import express from 'express';
import {parseAmount,parseCloudPaymentsBody,validCloudPaymentsSignature,validateCloudPaymentsOrder} from './cloudPayments.js';

export function setupCloudNotifications(app,{db,billing,paymentSettings}){
 app.post('/api/cloudpayments/:kind',express.raw({type:'application/x-www-form-urlencoded',limit:'64kb'}),(req,res)=>{
  if(!['check','pay','refund'].includes(req.params.kind))return res.sendStatus(404);
  const settings=paymentSettings.get();if(!settings||!validCloudPaymentsSignature(req.body,req.get('Content-HMAC'),settings.secret))return res.sendStatus(403);
  let fields;try{fields=parseCloudPaymentsBody(req.body)}catch{return res.status(400).json({code:13})}
  if(req.params.kind==='refund'){const amount=parseAmount(fields.Amount);if(fields.OperationType!=='Refund'||amount===null)return res.status(400).json({code:13});try{billing.refund(fields.PaymentTransactionId,fields.TransactionId,amount);return res.json({code:0})}catch{return res.status(409).json({code:13})}}
  const result=validateCloudPaymentsOrder(db,fields);
  if(req.params.kind==='check'){if(result.code)return res.json({code:result.code});if(result.order.status!=='pending')return res.json({code:13});return res.json({code:0})}
  if(result.code||fields.Status!=='Completed'||fields.OperationType!=='Payment'||!/^\d{1,30}$/.test(fields.TransactionId||''))return res.status(400).json({code:13});
  try{billing.complete(result.order.id,fields.TransactionId,{userId:result.order.user_id,amount:result.amount,testMode:!!result.order.test_mode});res.json({code:0})}catch{return res.status(409).json({code:13})}
 });
}

export function setupCloudOrders(app,{billing,paymentSettings,accounts,enabled=process.env.BILLING_ENABLED==='1'}){
 app.post('/api/billing/orders',accounts.requireSession,(req,res)=>{
  if(!enabled)return res.status(503).json({error:'Оплата ещё не подключена.'});const settings=paymentSettings.get();if(!settings)return res.status(503).json({error:'Платёжный сервис пока не настроен.'});if(!settings.publicId.startsWith('test_'))return res.status(503).json({error:'Реальные платежи ещё не включены.'});
  try{const testMode=settings.publicId.startsWith('test_'),order=billing.order(req.user.id,req.body?.kind,req.body?.amount,testMode);res.json({orderId:order.id,publicId:settings.publicId,amount:order.amount/100,accountId:req.user.id,email:req.user.email,testMode})}catch(e){res.status(400).json({error:e.message})}
 });
 app.get('/api/billing/orders/:id',accounts.requireSession,(req,res)=>{const order=billing.getOrder(req.params.id,req.user.id);if(!order)return res.sendStatus(404);res.json(order)});
}
