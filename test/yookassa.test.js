import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {setupBilling} from '../server/billing.js';
import {setupYooKassa} from '../server/yookassaRoutes.js';
import {createTestPaymentPayload,parseYooAmount,safeConfirmationUrl} from '../server/yookassa.js';

test('amounts, receipt and redirect validation',()=>{
 assert.equal(parseYooAmount('50.01'),5001);assert.equal(parseYooAmount('1e2'),null);assert.equal(parseYooAmount('50'),null);
 const payload=createTestPaymentPayload({id:'o',userId:'u',kind:'daily',amount:5000},'a@example.test');
 assert.equal(payload.receipt.items[0].vat_code,1);assert.equal(payload.receipt.items[0].amount.value,'50.00');assert.equal(payload.receipt.customer.email,'a@example.test');
 assert.equal(safeConfirmationUrl('https://yookassa.ru/checkout'),true);assert.equal(safeConfirmationUrl('https://yookassa.ru.evil.test/'),false);assert.equal(safeConfirmationUrl('https://yookassa.ru@evil.test/'),false);
});

test('test payments are verified with YooKassa, idempotent and never affect the wallet',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER);');const billing=setupBilling(db);db.prepare('INSERT INTO users VALUES (?,?)').run('u',Date.now());
 const app=express();app.use(express.json());let settings={shopId:'123456',mode:'test',secret:'test_example'},payment;let requests=0;
 const accounts={requireSession:(req,_res,next)=>{req.user={id:'u',email:'u@example.test'};next()}};
 const clientFor=()=>async(path,options)=>{requests++;if(path==='/payments'){assert.equal(options.body.receipt.items[0].vat_code,1);payment={id:randomUUID(),status:'pending',test:true,paid:false,amount:options.body.amount,metadata:options.body.metadata,confirmation:{type:'redirect',confirmation_url:'https://yookassa.ru/checkout'}};assert.equal(options.idempotenceKey,payment.metadata.order_id);return payment}if(path==='/payments/'+payment?.id)return payment;throw Error('not found')};
 setupYooKassa(app,{db,billing,paymentSettings:{get:()=>settings},accounts,enabled:true,clientFor});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body)=>fetch(root+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  settings={shopId:'123456',mode:'live',secret:'live_example',verified:false};assert.equal((await post('/api/billing/orders',{kind:'daily',amount:5000})).status,503);assert.equal(requests,0);
  settings={shopId:'123456',mode:'test',secret:'test_example'};const created=await post('/api/billing/orders',{kind:'daily',amount:5000});assert.equal(created.status,200);const order=await created.json();assert.equal(order.confirmationUrl,'https://yookassa.ru/checkout');
  const notification={type:'notification',event:'payment.succeeded',object:{id:payment.id,status:'succeeded',paid:true}};
  assert.equal((await post('/api/yookassa/webhook',notification)).status,200);assert.equal(billing.getOrder(order.orderId,'u').status,'pending');
  payment={...payment,status:'succeeded',paid:true,amount:{value:'51.00',currency:'RUB'}};assert.equal((await post('/api/yookassa/webhook',notification)).status,503);assert.equal(billing.getOrder(order.orderId,'u').status,'pending');
  payment={...payment,amount:{value:'50.00',currency:'RUB'}};assert.equal((await post('/api/yookassa/webhook',notification)).status,200);assert.equal((await post('/api/yookassa/webhook',notification)).status,200);assert.equal(billing.getOrder(order.orderId,'u').status,'test_paid');assert.equal('balance' in billing.state('u'),false);
 }finally{await new Promise(r=>server.close(r));db.close()}
});

test('live payment is reconciled exactly once and settlement receipt survives retry',async()=>{
 const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,created INTEGER)");const billing=setupBilling(db);db.prepare('INSERT INTO users VALUES (?,?,?)').run('u','buyer@example.test',Date.now());
 const app=express();app.use(express.json());const settings={shopId:'1516684',mode:'live',secret:'live_example',verified:true};let payment,firstCreate=true,receiptCalls=0;const receiptKeys=[];
 const accounts={requireSession:(req,_res,next)=>{req.user={id:'u',email:'buyer@example.test'};next()}};
 const clientFor=()=>async(path,options={})=>{
  if(path==='/payments'){
   if(!payment)payment={id:randomUUID(),test:false,status:'pending',paid:false,amount:options.body.amount,metadata:options.body.metadata,receipt_registration:'pending',confirmation:{type:'redirect',confirmation_url:'https://yookassa.ru/checkout'}};
   if(firstCreate){firstCreate=false;throw Error('connection lost after creation')}
   return payment;
  }
  if(path==='/payments/'+payment.id)return payment;
  if(path.startsWith('/refunds/'))return {id:path.split('/').at(-1),payment_id:payment.id,status:'succeeded',amount:{value:'25.00',currency:'RUB'}};
  if(path==='/receipts'){
   receiptCalls++;receiptKeys.push(options.idempotenceKey);assert.equal(options.body.payment_id,payment.id);assert.equal(options.body.customer.email,'buyer@example.test');assert.equal(options.body.items[0].payment_mode,'full_payment');assert.equal(options.body.settlements[0].type,'prepayment');
   if(receiptCalls===1)throw Error('temporary network failure');
   return {id:'rt-test',payment_id:payment.id,status:'succeeded'};
  }
  throw Error('unexpected path '+path);
 };
 const processor=setupYooKassa(app,{db,billing,paymentSettings:{get:()=>settings},accounts,enabled:true,clientFor});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/api/billing/orders',{kind:'daily'})).status,503);assert.equal((await post('/api/billing/orders',{kind:'daily'})).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_orders').get().n,1);
  payment={...payment,status:'succeeded',paid:true,receipt_registration:'succeeded'};const n={type:'notification',event:'payment.succeeded',object:{id:payment.id}};
  assert.equal((await post('/api/yookassa/webhook',n)).status,200);assert.equal((await post('/api/yookassa/webhook',n)).status,200);
  assert.equal(billing.state('u').plan,'daily');assert.equal(db.prepare("SELECT COUNT(*) n FROM billing_receipt_jobs").get().n,1);
  await processor.processPending();assert.equal(receiptCalls,1);assert.equal(db.prepare('SELECT status FROM billing_receipt_jobs').get().status,'pending');
  db.exec('UPDATE billing_receipt_jobs SET last_attempt=0');await processor.processPending();assert.equal(receiptCalls,2);assert.equal(receiptKeys[0],receiptKeys[1]);assert.equal(db.prepare('SELECT status FROM billing_receipt_jobs').get().status,'succeeded');
  const refundId=randomUUID(),notice={type:'notification',event:'refund.succeeded',object:{id:refundId}};assert.equal((await post('/api/yookassa/webhook',notice)).status,200);assert.equal((await post('/api/yookassa/webhook',notice)).status,200);assert.equal(billing.state('u').review,true);assert.throws(()=>billing.debit('u','12345678-1234-1234-1234-123456789012'),/возврата/);
 }finally{processor.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close()}
});
