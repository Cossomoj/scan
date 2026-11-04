import {createYooClient,createTestPaymentPayload,createSettlementReceipt,matchesYooPayment,parseYooAmount,safeConfirmationUrl,validYooId} from './yookassa.js';

export function setupYooKassa(app,{db,billing,paymentSettings,accounts,enabled=process.env.BILLING_ENABLED==='1',clientFor=createYooClient}) {
 db.exec(`CREATE TABLE IF NOT EXISTS yookassa_payments (order_id TEXT PRIMARY KEY REFERENCES billing_orders(id) ON DELETE CASCADE, payment_id TEXT NOT NULL UNIQUE, shop_id TEXT NOT NULL)`);
 if(!db.prepare('PRAGMA table_info(yookassa_payments)').all().some(column=>column.name==='receipt_status'))db.exec('ALTER TABLE yookassa_payments ADD COLUMN receipt_status TEXT');
 const settingsForPayment=()=>{const s=paymentSettings.get();return s&&s.verified!==false&&['test','live'].includes(s.mode)&&s.secret.startsWith(s.mode+'_')?s:null};
 const findOrder=id=>db.prepare('SELECT * FROM billing_orders WHERE id=?').get(id);
 const link=(order,paymentId,shopId)=>{
  const existing=db.prepare('SELECT * FROM yookassa_payments WHERE order_id=? OR payment_id=?').get(order.id,paymentId);
  if(existing){if(existing.order_id!==order.id||existing.payment_id!==paymentId||existing.shop_id!==shopId)throw Error('Payment conflict');return}
  db.prepare('INSERT INTO yookassa_payments(order_id,payment_id,shop_id) VALUES (?,?,?)').run(order.id,paymentId,shopId);
 };
 const reconcile=(payment,settings)=>{
  const order=typeof payment?.metadata?.order_id==='string'?findOrder(payment.metadata.order_id):null;
  if(!order||Boolean(order.test_mode)!==(settings.mode==='test')||!matchesYooPayment(payment,order))throw Error('Payment mismatch');
  link(order,payment.id,settings.shopId);
  if(['pending','succeeded','canceled'].includes(payment.receipt_registration))db.prepare('UPDATE yookassa_payments SET receipt_status=? WHERE order_id=?').run(payment.receipt_registration,order.id);
  if(payment.status==='succeeded'&&payment.paid===true)billing.complete(order.id,payment.id,{userId:order.user_id,amount:order.amount,testMode:settings.mode==='test'});
  else if(payment.status==='canceled'&&order.status==='pending')db.prepare("UPDATE billing_orders SET status='canceled' WHERE id=? AND status='pending'").run(order.id);
 };
 app.post('/api/billing/orders',accounts.requireSession,async(req,res)=>{
  if(!enabled)return res.status(503).json({error:'Оплата пока недоступна.'});
  const settings=settingsForPayment();if(!settings)return res.status(503).json({error:'Оплата пока не настроена.'});
  let order;
  try{
   const previous=db.prepare("SELECT * FROM billing_orders WHERE user_id=? AND kind=? AND test_mode=? AND status='pending' ORDER BY created DESC LIMIT 1").get(req.user.id,req.body?.kind,settings.mode==='test'?1:0);
   if(previous){
    if(Date.now()-previous.created>=23*60*60*1000)return res.status(409).json({error:'Предыдущий платёж ещё проверяется. Обратитесь в поддержку.'});
    order={id:previous.id,userId:previous.user_id,kind:previous.kind,amount:previous.amount,testMode:!!previous.test_mode};
   }else order=billing.order(req.user.id,req.body?.kind,req.body?.amount,settings.mode==='test');
  }catch(e){return res.status(400).json({error:e.message})}
  try{
   const payment=await clientFor(settings)('/payments',{method:'POST',body:createTestPaymentPayload(order,req.user.email),idempotenceKey:order.id});
   const stored=findOrder(order.id);
   if(!matchesYooPayment(payment,stored)||Boolean(stored.test_mode)!==(settings.mode==='test'))throw Error('Invalid payment');
   if(payment.status==='succeeded'&&payment.paid===true){
    reconcile(payment,settings);
    return res.json({orderId:order.id,status:settings.mode==='test'?'test_paid':'paid',testMode:settings.mode==='test'});
   }
   if(payment.status==='canceled'){
    reconcile(payment,settings);
    return res.status(409).json({error:'Платёж отменён. Попробуйте ещё раз.'});
   }
   if(payment.status!=='pending'||payment.confirmation?.type!=='redirect'||!safeConfirmationUrl(payment.confirmation?.confirmation_url))throw Error('Invalid payment');
   link(stored,payment.id,settings.shopId);res.json({orderId:order.id,confirmationUrl:payment.confirmation.confirmation_url,testMode:settings.mode==='test'});
  }catch(error){
   if(error.status===400)db.prepare("UPDATE billing_orders SET status='canceled' WHERE id=? AND status='pending' AND NOT EXISTS (SELECT 1 FROM yookassa_payments WHERE order_id=?)").run(order.id,order.id);
   return res.status(503).json({error:'Не удалось создать платёж. Попробуйте ещё раз.'});
  }
 });
 app.get('/api/billing/orders/:id',accounts.requireSession,async(req,res)=>{
  const order=billing.getOrder(req.params.id,req.user.id);if(!order)return res.sendStatus(404);
  if(order.status==='pending'){
   const saved=db.prepare('SELECT * FROM yookassa_payments WHERE order_id=?').get(order.id),settings=settingsForPayment();
   if(saved&&settings&&saved.shop_id===settings.shopId)try{reconcile(await clientFor(settings)('/payments/'+saved.payment_id),settings)}catch{}
  }
  res.json(billing.getOrder(req.params.id,req.user.id));
 });
 app.post('/api/yookassa/webhook',async(req,res)=>{
  const event=req.body?.event,id=req.body?.object?.id;
  if(req.body?.type!=='notification'||!['payment.succeeded','payment.canceled','refund.succeeded'].includes(event)||!validYooId(id))return res.sendStatus(400);
  const settings=settingsForPayment();if(!settings)return res.sendStatus(503);
  try{
   const client=clientFor(settings);
   if(event.startsWith('payment.')){const payment=await client('/payments/'+id);if(payment.id!==id)throw Error('Payment mismatch');reconcile(payment,settings)}
   else{
    const refund=await client('/refunds/'+id);
    if(refund.id!==id||refund.status!=='succeeded'||!validYooId(refund.payment_id)||refund.amount?.currency!=='RUB')throw Error('Refund mismatch');
    const amount=parseYooAmount(refund.amount.value),saved=db.prepare('SELECT * FROM yookassa_payments WHERE payment_id=?').get(refund.payment_id);
    if(!saved||saved.shop_id!==settings.shopId||amount===null)throw Error('Refund mismatch');
    billing.refund(refund.payment_id,refund.id,amount);
   }
   res.sendStatus(200);
  }catch{res.sendStatus(503)}
 });
 let processing=false;
 const processPending=async()=>{
  if(processing||!enabled)return;
  const settings=settingsForPayment();if(!settings)return;
  processing=true;
  try{
   const client=clientFor(settings);
   const pending=db.prepare("SELECT y.payment_id FROM yookassa_payments y JOIN billing_orders o ON o.id=y.order_id WHERE o.status='pending' AND o.test_mode=? AND y.shop_id=? LIMIT 30").all(settings.mode==='test'?1:0,settings.shopId);
   for(const row of pending){
    try{reconcile(await client('/payments/'+row.payment_id),settings)}
    catch(error){console.error('YooKassa payment reconciliation failed',row.payment_id,error.message)}
   }
   if(settings.mode!=='live')return;
   for(const row of db.prepare('SELECT DISTINCT user_id FROM billing_plan_queue').all()){
    try{billing.state(row.user_id)}catch(error){console.error('Plan activation failed',row.user_id,error.message)}
   }
   const receipts=db.prepare("SELECT y.payment_id FROM yookassa_payments y JOIN billing_orders o ON o.id=y.order_id WHERE o.status='paid' AND y.shop_id=? AND (y.receipt_status IS NULL OR y.receipt_status='pending') ORDER BY o.created DESC LIMIT 30").all(settings.shopId);
   for(const row of receipts){
    try{reconcile(await client('/payments/'+row.payment_id),settings)}
    catch(error){console.error('YooKassa receipt status failed',row.payment_id,error.message)}
   }
   const jobs=db.prepare("SELECT j.*,o.amount,o.kind,o.user_id,o.transaction_id,u.email,y.shop_id FROM billing_receipt_jobs j JOIN billing_orders o ON o.id=j.order_id JOIN users u ON u.id=o.user_id JOIN yookassa_payments y ON y.order_id=o.id WHERE j.status IN ('pending','submitted') AND y.shop_id=? AND (j.last_attempt IS NULL OR j.last_attempt<?) ORDER BY j.created LIMIT 30").all(settings.shopId,Date.now()-300000);
   for(const job of jobs){
    try{
     if(job.first_attempt&&!job.receipt_id&&Date.now()-job.first_attempt>=23*60*60*1000){
      db.prepare("UPDATE billing_receipt_jobs SET status='manual' WHERE order_id=?").run(job.order_id);
      console.error('YooKassa receipt requires manual verification',job.order_id);
      continue;
     }
     if(job.receipt_id&&Date.now()-job.first_attempt>=3*86400000){
      db.prepare("UPDATE billing_receipt_jobs SET status='manual' WHERE order_id=?").run(job.order_id);
      console.error('YooKassa receipt registration timed out',job.order_id);
      continue;
     }
     const attempted=Date.now();
     db.prepare('UPDATE billing_receipt_jobs SET first_attempt=COALESCE(first_attempt,?),last_attempt=? WHERE order_id=?').run(attempted,attempted,job.order_id);
     const receipt=job.receipt_id
      ?await client('/receipts/'+encodeURIComponent(job.receipt_id))
      :await client('/receipts',{method:'POST',idempotenceKey:'settlement-'+job.order_id,body:createSettlementReceipt({id:job.order_id,userId:job.user_id,kind:job.kind,amount:job.amount},job.email,job.transaction_id)});
     if(!receipt||typeof receipt.id!=='string'||receipt.payment_id!==job.transaction_id||!['pending','succeeded','canceled'].includes(receipt.status))throw Error('Invalid receipt');
     const status=receipt.status==='succeeded'?'succeeded':receipt.status==='canceled'?'manual':'submitted';
     db.prepare('UPDATE billing_receipt_jobs SET receipt_id=?,status=? WHERE order_id=?').run(receipt.id,status,job.order_id);
     if(status==='manual')console.error('YooKassa receipt rejected',job.order_id);
    }catch(error){console.error('YooKassa receipt processing failed',job.order_id,error.message)}
   }
  }finally{processing=false}
 };
 const timer=setInterval(()=>processPending().catch(error=>console.error('YooKassa background processing failed',error.message)),60000);
 timer.unref();
 return {processPending,close:()=>clearInterval(timer)};
}
