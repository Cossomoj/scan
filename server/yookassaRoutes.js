import {createYooClient,createTestPaymentPayload,matchesYooPayment,parseYooAmount,safeConfirmationUrl,validYooId} from './yookassa.js';

// Live payments remain unavailable until the fiscal treatment of wallet spending is implemented.
export function setupYooKassa(app,{db,billing,paymentSettings,accounts,enabled=process.env.BILLING_ENABLED==='1',clientFor=createYooClient}) {
 db.exec(`CREATE TABLE IF NOT EXISTS yookassa_payments (order_id TEXT PRIMARY KEY REFERENCES billing_orders(id) ON DELETE CASCADE, payment_id TEXT NOT NULL UNIQUE, shop_id TEXT NOT NULL)`);
 const settingsForTest=()=>{const s=paymentSettings.get();return s?.mode==='test'&&s.secret.startsWith('test_')?s:null};
 const findOrder=id=>db.prepare('SELECT * FROM billing_orders WHERE id=?').get(id);
 const link=(order,paymentId,shopId)=>{
  const existing=db.prepare('SELECT * FROM yookassa_payments WHERE order_id=? OR payment_id=?').get(order.id,paymentId);
  if(existing){if(existing.order_id!==order.id||existing.payment_id!==paymentId||existing.shop_id!==shopId)throw Error('Payment conflict');return}
  db.prepare('INSERT INTO yookassa_payments(order_id,payment_id,shop_id) VALUES (?,?,?)').run(order.id,paymentId,shopId);
 };
 const reconcile=(payment,settings)=>{
  const order=typeof payment?.metadata?.order_id==='string'?findOrder(payment.metadata.order_id):null;
  if(!order||!matchesYooPayment(payment,order))throw Error('Payment mismatch');
  link(order,payment.id,settings.shopId);
  if(payment.status==='succeeded'&&payment.paid===true)billing.complete(order.id,payment.id,{userId:order.user_id,amount:order.amount,testMode:true});
  else if(payment.status==='canceled'&&order.status==='pending')db.prepare("UPDATE billing_orders SET status='canceled' WHERE id=? AND status='pending'").run(order.id);
 };
 app.post('/api/billing/orders',accounts.requireSession,async(req,res)=>{
  if(!enabled)return res.status(503).json({error:'Оплата пока недоступна.'});
  const settings=settingsForTest();if(!settings)return res.status(503).json({error:'Тестовая оплата пока не настроена. Реальные платежи отключены.'});
  let order;try{order=billing.order(req.user.id,req.body?.kind,req.body?.amount,true)}catch(e){return res.status(400).json({error:e.message})}
  try{
   const payment=await clientFor(settings)('/payments',{method:'POST',body:createTestPaymentPayload(order,req.user.email),idempotenceKey:order.id});
   const stored=findOrder(order.id);
   if(!matchesYooPayment(payment,stored)||payment.status!=='pending'||payment.confirmation?.type!=='redirect'||!safeConfirmationUrl(payment.confirmation?.confirmation_url))throw Error('Invalid payment');
   link(stored,payment.id,settings.shopId);res.json({orderId:order.id,confirmationUrl:payment.confirmation.confirmation_url,testMode:true});
  }catch{return res.status(503).json({error:'Не удалось создать тестовый платёж. Проверьте настройки ЮKassa.'})}
 });
 app.get('/api/billing/orders/:id',accounts.requireSession,async(req,res)=>{
  const order=billing.getOrder(req.params.id,req.user.id);if(!order)return res.sendStatus(404);
  if(order.status==='pending'){
   const saved=db.prepare('SELECT * FROM yookassa_payments WHERE order_id=?').get(order.id),settings=settingsForTest();
   if(saved&&settings&&saved.shop_id===settings.shopId)try{reconcile(await clientFor(settings)('/payments/'+saved.payment_id),settings)}catch{}
  }
  res.json(billing.getOrder(req.params.id,req.user.id));
 });
 app.post('/api/yookassa/webhook',async(req,res)=>{
  const event=req.body?.event,id=req.body?.object?.id;
  if(req.body?.type!=='notification'||!['payment.succeeded','payment.canceled','refund.succeeded'].includes(event)||!validYooId(id))return res.sendStatus(400);
  const settings=settingsForTest();if(!settings)return res.sendStatus(503);
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
}
