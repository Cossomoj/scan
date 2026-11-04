import express from 'express';
import multer from 'multer';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import {setupAccounts} from './account.js';
import {setupAdmin} from './admin.js';
import {setupBilling} from './billing.js';
import {setupPaymentSettings} from './paymentSettings.js';
import {setupBillingRoutes} from './billingRoutes.js';
import {setupYooKassa} from './yookassaRoutes.js';
import {createYooClient} from './yookassa.js';
import {setupFeedback} from './feedback.js';
import {setupPrivacy} from './privacy.js';
import {setupSignatureProcessor} from './signatureProcessor.js';

const dataDir = resolve(process.env.DATA_DIR || './data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(resolve(dataDir, 'sign.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, name TEXT NOT NULL, pdf BLOB NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS signers (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE, position INTEGER NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL, signed INTEGER, UNIQUE(request_id,position));`);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use('/admin',(_req,res,next)=>{res.set('X-Robots-Tag','noindex, nofollow, noarchive');next()});
app.use((req, res, next) => { res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cache-Control':'no-store'}); next(); });
const buckets=new Map();
app.use('/api',(req,res,next)=>{const period=req.method==='POST' && req.path==='/requests' ? 3600000 : 60000, limit=period===3600000 ? 10 : 120, key=req.ip+':'+period, time=Date.now(); let bucket=buckets.get(key); if(!bucket||bucket.until<=time) bucket={count:0,until:time+period}; bucket.count++;buckets.set(key,bucket); if(bucket.count>limit)return res.status(429).json({error:'Слишком много запросов. Попробуйте позже.'});next();});
setInterval(()=>{const time=Date.now();for(const [key,b] of buckets)if(b.until<=time)buckets.delete(key)},60000).unref();
app.use(express.json({ limit: '4mb' }));
const accounts=setupAccounts(app,db,{dataDir});
setupSignatureProcessor(app,{sameOrigin:accounts.sameOrigin});
setupPrivacy(app,db);
setupFeedback(app,{recordConsent:accounts.recordConsent});
const billing=setupBilling(db);
accounts.setBilling(billing);
const paymentSettings=setupPaymentSettings(db,dataDir);
let checkingPaymentSettings=false;
const verifyExistingPaymentSettings=async()=>{
 if(process.env.BILLING_ENABLED!=='1'||checkingPaymentSettings)return;
 const settings=paymentSettings.get();
 if(!settings||settings.mode!=='live'||settings.verified)return;
 checkingPaymentSettings=true;
 try{
  await createYooClient(settings)('/payments?limit=1');
  const current=paymentSettings.get();
  if(current&&current.mode===settings.mode&&current.shopId===settings.shopId&&current.secret===settings.secret&&!current.verified)paymentSettings.save(settings,true);
 }catch(error){console.error('YooKassa settings verification failed:',error.message)}
 finally{checkingPaymentSettings=false}
};
const schedulePaymentSettingsCheck=()=>verifyExistingPaymentSettings().catch(error=>console.error('YooKassa settings check failed:',error.message));
setImmediate(schedulePaymentSettingsCheck);
setInterval(schedulePaymentSettingsCheck,300000).unref();
setupAdmin(app,db,{billing,paymentSettings});
setupBillingRoutes(app,{billing,accounts,paymentSettings});
setupYooKassa(app,{db,billing,paymentSettings,accounts});
const officeUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024,files:1,fields:0}});
const now = () => Date.now();
app.get('/api/health', (_req,res) => res.json({ok:true}));
const conversionBuckets = new Map();
let conversionInProgress=false;
app.post('/api/convert', (req,res,next)=>{const t=Date.now();let b=conversionBuckets.get(req.ip);if(!b||b.until<t)b={count:0,until:t+3600000};b.count++;conversionBuckets.set(req.ip,b);if(b.count>10)return res.status(429).json({error:'Слишком много преобразований. Попробуйте позже.'});if(conversionInProgress)return res.status(503).json({error:'Сервис преобразования занят. Попробуйте ещё раз.'});conversionInProgress=true;let released=false;const release=()=>{if(!released){released=true;conversionInProgress=false}};res.on('finish',release);res.on('close',release);next()}, officeUpload.single('file'), async (req,res)=>{
  const file=req.file, ext=(file?.originalname||'').split('.').pop().toLowerCase(), b=file?.buffer;
  const zip=b?.length>=4&&b[0]===0x50&&b[1]===0x4b&&b[2]===3&&b[3]===4;
  const ole=b?.length>=8&&b.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
  if(!(['docx','xlsx'].includes(ext)&&zip||['doc','xls'].includes(ext)&&ole))return res.status(400).json({error:'Выберите корректный файл Word или Excel.'});
  if(!process.env.CONVERTER_URL)return res.status(503).json({error:'Преобразование документов временно недоступно.'});
  try {
    const converted=await fetch(`${process.env.CONVERTER_URL}/convert?type=${ext}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:b,signal:AbortSignal.timeout(65000)});
    if(!converted.ok){let data;try{data=await converted.json()}catch{}return res.status(converted.status===503?503:400).json({error:data?.error||'Не удалось преобразовать файл. Проверьте, что он не защищён паролем.'})}
    const length=Number(converted.headers.get('content-length'));if(!length||length>50*1024*1024)throw Error('Invalid result size');
    const result=Buffer.from(await converted.arrayBuffer());if(result.length!==length||result.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF');
    const pdf=await PDFDocument.load(result);if(!pdf.getPageCount()||pdf.getPageCount()>100)return res.status(400).json({error:'Поддерживается до 100 страниц.'});
    res.type('application/pdf').send(result);
  }catch{return res.status(503).json({error:'Не удалось преобразовать файл. Проверьте документ и попробуйте ещё раз.'})}
});
setInterval(()=>{const t=Date.now();for(const [ip,b] of conversionBuckets)if(b.until<t)conversionBuckets.delete(ip)},60000).unref();
app.use('/api',(_req,res)=>res.status(404).json({error:'Не найдено.'}));
app.use(express.static(resolve('dist'),{index:'index.html',maxAge:'1h'}));
app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
app.use((err,req,res,_next)=>{console.error(err.message); if(err instanceof multer.MulterError) return res.status(400).json({error:`Файл слишком большой (максимум ${req.path==='/api/convert'?50:20} МБ).`}); res.status(400).json({error:err.message?.includes('PDF') ? err.message : 'Не удалось обработать документ. Проверьте файл и попробуйте снова.'});});
const cleanup=()=>{const result=db.prepare('DELETE FROM requests WHERE expires<=?').run(now());if(result.changes)db.exec('PRAGMA wal_checkpoint(TRUNCATE)');}; cleanup(); setInterval(cleanup,60*60*1000).unref();
app.listen(process.env.PORT || 3000,'0.0.0.0',()=>console.log('Listening on port '+(process.env.PORT||3000)));
