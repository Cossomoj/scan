import multer from 'multer';
import {createHash} from 'node:crypto';
import {exportServerDocument} from './exportDocument.js';

// Deliberately disabled until the merchant has completed the payment and refund setup.
export function setupBillingRoutes(app,{billing,accounts,paymentSettings,enabled=process.env.BILLING_ENABLED==='1',render=exportServerDocument}){
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024,files:1,fields:3,fieldSize:4*1024*1024}});
 let rendering=false;
 app.use('/api/billing',accounts.sameOrigin);
 const active=()=>enabled&&(!paymentSettings||!!paymentSettings.get()?.verified);
 app.get('/api/billing/status',(req,res)=>{const user=accounts.session(req),settings=paymentSettings?.get();res.json({enabled:active(),testMode:settings?settings.mode==='test':!paymentSettings&&enabled,user:user?billing.state(user.id):null})});
 app.post('/api/billing/export',accounts.requireSession,(req,res,next)=>{
  if(!active())return res.status(503).json({error:'Платное скачивание ещё не подключено.'});
  if(rendering)return res.status(503).json({error:'Сервис занят. Повторите попытку через несколько секунд.'});
  upload.single('document')(req,res,err=>{if(err)return res.status(400).json({error:'Не удалось загрузить документ. Проверьте размер файла.'});next()});
 },async(req,res)=>{
  if(rendering)return res.status(503).json({error:'Сервис занят. Повторите попытку через несколько секунд.'});
  if(!req.file||req.file.buffer.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'Выберите корректный PDF-файл.'});
  let items,filters;try{items=JSON.parse(req.body.items);filters=JSON.parse(req.body.filters)}catch{return res.status(400).json({error:'Не удалось прочитать изменения документа.'})}
  rendering=true;try{
   const result=await render(req.file.buffer,items,filters);
   const fingerprint=createHash('sha256').update(req.file.buffer).update('\0').update(req.body.items).update('\0').update(req.body.filters).digest('hex');
   billing.debit(req.user.id,req.body.requestId,fingerprint);
   res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="document.pdf"','Cache-Control':'no-store'}).send(Buffer.from(result));
  }catch(e){if(e.code==='INSUFFICIENT_FUNDS'||e.code==='REFUND_REVIEW')return res.status(e.code==='INSUFFICIENT_FUNDS'?402:423).json({error:e.message});res.status(400).json({error:'Не удалось подготовить PDF. Проверьте документ и попробуйте снова.'})}finally{rendering=false}
 });
}
