import {createHash,createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import nodemailer from 'nodemailer';
import {createLoginMessage} from './loginMail.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
// Accept ordinary internet mailboxes and reject header injection, whitespace and malformed domains.
export function validEmail(value){
 const email=normalizeEmail(value);if(email.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/i.test(email))return false;
 const [local,domain]=email.split('@');return local.length<=64&&!local.startsWith('.')&&!local.endsWith('.')&&!local.includes('..')&&domain.length<=253&&domain.includes('.')&&domain.split('.').every(p=>p.length>0&&p.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(p))&&/^[a-z]{2,63}$/i.test(domain.split('.').at(-1));
}
function getSecret(dir){const path=join(dir,'account-secret');try{return readFileSync(path)}catch(e){if(e.code!=='ENOENT')throw e;const key=randomBytes(32);try{writeFileSync(path,key,{mode:0o600,flag:'wx'});return key}catch(err){if(err.code==='EEXIST')return readFileSync(path);throw err}}}
const cookieValue=req=>{const match=/(?:^|;\s*)list_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie||'');return match?.[1]||''};
const maxAge=30*24*60*60*1000,codeAge=10*60*1000;
const validPng=value=>typeof value==='string'&&value.length<=1400000&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)&&Buffer.from(value.slice(22,38),'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));

export function setupAccounts(app,db,{dataDir,sendMail,production=process.env.NODE_ENV==='production',clock=Date.now}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS account_codes (email TEXT PRIMARY KEY,code_hash TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS account_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS account_assets (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,data TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,id));
 CREATE TABLE IF NOT EXISTS consent_records (subject_hash TEXT NOT NULL,purpose TEXT NOT NULL,revision TEXT NOT NULL,first_at INTEGER NOT NULL,last_at INTEGER NOT NULL,verified_at INTEGER,PRIMARY KEY(subject_hash,purpose,revision));
 CREATE TABLE IF NOT EXISTS account_rate (key TEXT NOT NULL,created INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS account_rate_key ON account_rate(key,created);`);
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='last_seen'))db.exec('ALTER TABLE users ADD COLUMN last_seen INTEGER');
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='archived_at'))db.exec('ALTER TABLE users ADD COLUMN archived_at INTEGER');
 const secret=getSecret(dataDir),mac=(email,code)=>createHmac('sha256',secret).update(email+'\0'+code).digest('hex');
 if(!db.prepare('PRAGMA table_info(consent_records)').all().some(c=>c.name==='verified_at'))db.exec('ALTER TABLE consent_records ADD COLUMN verified_at INTEGER');
 const consentSubject=email=>createHmac('sha256',secret).update('consent\0'+normalizeEmail(email)).digest('hex');
 const recordConsent=(email,purpose,revision)=>{const time=clock();db.prepare('INSERT INTO consent_records(subject_hash,purpose,revision,first_at,last_at) VALUES (?,?,?,?,?) ON CONFLICT(subject_hash,purpose,revision) DO UPDATE SET last_at=excluded.last_at').run(consentSubject(email),purpose,revision,time,time)};
 const env=process.env,configured=!!(env.SMTP_HOST&&env.SMTP_PORT&&env.SMTP_USER&&env.SMTP_PASSWORD&&env.SMTP_FROM);
 const transport=configured?nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT),secure:Number(env.SMTP_PORT)===465,requireTLS:Number(env.SMTP_PORT)!==465,auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000}):null;
 const send=sendMail||((to,code)=>transport.sendMail(createLoginMessage(to,code,env.SMTP_FROM)));
 const enabled=!!sendMail||configured;
 const take=(key,limit,period)=>{const time=clock(),count=Number(db.prepare('SELECT COUNT(*) n FROM account_rate WHERE key=? AND created>?').get(key,time-period).n);if(count>=limit)return false;db.prepare('INSERT INTO account_rate VALUES (?,?)').run(key,time);return true};
 const session=req=>{const raw=cookieValue(req);const user=raw?db.prepare('SELECT u.id,u.email,u.created FROM account_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.archived_at IS NULL').get(sha(raw),clock()):undefined;if(user)db.prepare('UPDATE users SET last_seen=? WHERE id=? AND (last_seen IS NULL OR last_seen<?)').run(clock(),user.id,clock()-300000);return user};
 const requireSession=(req,res,next)=>{req.user=session(req);if(!req.user)return res.status(401).json({error:'Войдите в аккаунт.'});next()};
 const sameOrigin=(req,res,next)=>{const origin=req.get('origin');if(origin){try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Запрос отклонён.'})}catch{return res.sendStatus(403)}}next()};
 app.use('/api/account',sameOrigin);
 app.get('/api/account/session',(req,res)=>{const user=session(req);res.json({user:user?{email:user.email,created:user.created}:null,available:enabled})});
 app.post('/api/account/code',async(req,res)=>{const email=normalizeEmail(req.body?.email);if(!validEmail(email))return res.status(400).json({error:'Введите корректный адрес электронной почты.'});if(!enabled)return res.status(503).json({error:'Вход по почте пока не настроен.'});
  if(req.body?.consent!==true||req.body?.consentVersion!=='2026-11-03-account-v1')return res.status(400).json({error:'Подтвердите согласие на обработку данных для работы аккаунта.'});
  const time=clock(),existing=db.prepare('SELECT created FROM account_codes WHERE email=?').get(email);if(existing&&existing.created>time-60000)return res.status(429).json({error:'Новый код можно запросить через минуту.'});
  if(!take('send-ip:'+req.ip,10,3600000)||!take('send-email:'+sha(email),5,3600000))return res.status(429).json({error:'Слишком много попыток. Попробуйте позже.'});
  recordConsent(email,'account','2026-11-03-account-v1');const code=String(randomInt(0,1000000)).padStart(6,'0');db.prepare('INSERT INTO account_codes (email,code_hash,created,expires,attempts) VALUES (?,?,?,?,0) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,created=excluded.created,expires=excluded.expires,attempts=0').run(email,mac(email,code),time,time+codeAge);
  try{await send(email,code);res.json({ok:true})}catch{db.prepare('DELETE FROM account_codes WHERE email=? AND code_hash=?').run(email,mac(email,code));res.status(503).json({error:'Не удалось отправить письмо. Попробуйте позже.'})}
 });
 app.post('/api/account/verify',(req,res)=>{const email=normalizeEmail(req.body?.email),code=req.body?.code;if(!validEmail(email)||typeof code!=='string'||!/^\d{6}$/.test(code))return res.status(400).json({error:'Введите почту и шестизначный код.'});if(!take('verify-ip:'+req.ip,40,3600000))return res.status(429).json({error:'Слишком много попыток. Попробуйте позже.'});
  const record=db.prepare('SELECT * FROM account_codes WHERE email=?').get(email),value=mac(email,code),valid=record&&record.expires>clock()&&record.attempts<5&&timingSafeEqual(Buffer.from(record.code_hash,'hex'),Buffer.from(value,'hex'));
  if(!valid){if(record)db.prepare('UPDATE account_codes SET attempts=attempts+1 WHERE email=?').run(email);return res.status(400).json({error:'Код неверный или срок его действия истёк.'})}
  db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM account_codes WHERE email=?').run(email);db.prepare("UPDATE consent_records SET verified_at=? WHERE subject_hash=? AND purpose='account' AND revision='2026-11-03-account-v1'").run(clock(),consentSubject(email));let user=db.prepare('SELECT id,created,archived_at FROM users WHERE email=?').get(email);if(user?.archived_at!==null&&user?.archived_at!==undefined){db.exec('COMMIT');return res.status(403).json({error:'Аккаунт находится в архиве. Обратитесь в поддержку.'})}if(!user){user={id:randomUUID(),created:clock()};db.prepare('INSERT INTO users (id,email,created,last_seen) VALUES (?,?,?,?)').run(user.id,email,user.created,clock())}else db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(clock(),user.id);const raw=randomBytes(32).toString('base64url');db.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run(sha(raw),user.id,clock()+maxAge);db.exec('COMMIT');res.setHeader('Set-Cookie',`list_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge/1000}${production?'; Secure':''}`);res.json({user:{email,created:user.created}})}catch(e){db.exec('ROLLBACK');throw e}
 });
 app.post('/api/account/logout',(req,res)=>{const raw=cookieValue(req);if(raw)db.prepare('DELETE FROM account_sessions WHERE token_hash=?').run(sha(raw));res.setHeader('Set-Cookie',`list_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production?'; Secure':''}`);res.json({ok:true})});
 app.get('/api/account/assets',requireSession,(req,res)=>res.json({items:db.prepare('SELECT data FROM account_assets WHERE user_id=? ORDER BY updated').all(req.user.id).map(x=>JSON.parse(x.data))}));
 app.put('/api/account/assets/:id',requireSession,(req,res)=>{const x=req.body;if(!x||x.id!==req.params.id||! /^[a-z0-9-]{1,80}$/i.test(x.id)||!['signature','stamp','text'].includes(x.kind)||typeof x.name!=='string'||x.name.length>200||![x.widthMm,x.heightMm].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=1000))return res.status(400).json({error:'Некорректная заготовка.'});
  if(x.kind==='text'){if(typeof x.text!=='string'||!x.text.trim()||x.text.length>200||!/^#[0-9a-f]{6}$/i.test(x.color))return res.status(400).json({error:'Некорректный текст.'})}else if(!validPng(x.image)||!validPng(x.sourceImage||x.image))return res.status(400).json({error:'Некорректное изображение.'});
  const count=db.prepare('SELECT COUNT(*) n,COALESCE(SUM(length(data)),0) size FROM account_assets WHERE user_id=? AND id<>?').get(req.user.id,x.id),data=JSON.stringify(x);if(count.n>=100||count.size+data.length>25*1024*1024)return res.status(413).json({error:'Достигнут лимит хранилища: 100 заготовок или 25 МБ.'});
  db.prepare('INSERT INTO account_assets VALUES (?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data,updated=excluded.updated').run(req.user.id,x.id,data,clock());res.json({ok:true});
 });
 app.delete('/api/account/assets/:id',requireSession,(req,res)=>{db.prepare('DELETE FROM account_assets WHERE user_id=? AND id=?').run(req.user.id,req.params.id);res.json({ok:true})});
 const cleanup=()=>{const time=clock();db.prepare('DELETE FROM account_codes WHERE expires<?').run(time);db.prepare('DELETE FROM account_sessions WHERE expires<?').run(time);db.prepare('DELETE FROM account_rate WHERE created<?').run(time-86400000)};cleanup();setInterval(cleanup,3600000).unref();
 return {session,requireSession,sameOrigin,recordConsent};
}
