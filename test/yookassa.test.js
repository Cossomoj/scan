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
 assert.equal(payload.receipt.items[0].vat_code,1);assert.equal(payload.receipt.items[0].amount.value,'50.00');assert.equal(payload.receipt.customer.email,'a@example.test');assert.equal(payload.receipt.items[0].payment_mode,'full_payment');
 assert.equal(safeConfirmationUrl('https://yookassa.ru/checkout'),true);assert.equal(safeConfirmationUrl('https://yookassa.ru.evil.test/'),false);assert.equal(safeConfirmationUrl('https://yookassa.ru@evil.test/'),false);
});

test('test payments are verified with YooKassa, idempotent and never affect the wallet',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER);');const billing=setupBilling(db);db.prepare('INSERT INTO users VALUES (?,?)').run('u',Date.now());
 const app=express();app.use(express.json());let settings={shopId:'123456',mode:'test',secret:'test_example'},payment;let requests=0;
 const accounts={requireSession:(req,_res,next)=>{req.user={id:'u',email:'u@example.test'};next()}};
 const clientFor=()=>async(path,options)=>{requests++;if(path==='/payments'){assert.equal(options.body.receipt.items[0].vat_code,1);payment={id:randomUUID(),status:'pending',test:true,paid:false,amount:options.body.amount,metadata:options.body.metadata,confirmation:{type:'redirect',confirmation_url:'https://yookassa.ru/checkout'}};assert.equal(options.idempotenceKey,payment.metadata.order_id);return payment}if(path==='/payments/'+payment?.id)return payment;throw Error('not found')};
 const processor=setupYooKassa(app,{db,billing,paymentSettings:{get:()=>settings},accounts,enabled:true,clientFor});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body)=>fetch(root+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  settings={shopId:'123456',mode:'live',secret:'live_example',verified:false};assert.equal((await post('/api/billing/orders',{kind:'daily',amount:5000,termsVersion:2})).status,503);assert.equal(requests,0);
  settings={shopId:'123456',mode:'test',secret:'test_example'};assert.equal((await post('/api/billing/orders',{kind:'daily'})).status,409);assert.equal(requests,0);const created=await post('/api/billing/orders',{kind:'daily',amount:5000,termsVersion:2});assert.equal(created.status,200);const order=await created.json();assert.equal(order.confirmationUrl,'https://yookassa.ru/checkout');
  const notification={type:'notification',event:'payment.succeeded',object:{id:payment.id,status:'succeeded',paid:true}};
  assert.equal((await post('/api/yookassa/webhook',notification)).status,200);assert.equal(billing.getOrder(order.orderId,'u').status,'pending');
  payment={...payment,status:'succeeded',paid:true,amount:{value:'51.00',currency:'RUB'}};assert.equal((await post('/api/yookassa/webhook',notification)).status,503);assert.equal(billing.getOrder(order.orderId,'u').status,'pending');
  payment={...payment,amount:{value:'50.00',currency:'RUB'}};assert.equal((await post('/api/yookassa/webhook',notification)).status,200);assert.equal((await post('/api/yookassa/webhook',notification)).status,200);assert.equal(billing.getOrder(order.orderId,'u').status,'test_paid');assert.equal('balance' in billing.state('u'),false);
 }finally{processor.close();await new Promise(r=>server.close(r));db.close()}
});

test('legacy prepayment is reconciled exactly once and settlement receipt survives retry',async()=>{
 const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,created INTEGER)");const billing=setupBilling(db);db.prepare('INSERT INTO users VALUES (?,?,?)').run('u','buyer@example.test',Date.now());
 const app=express();app.use(express.json());const settings={shopId:'1516684',mode:'live',secret:'live_example',verified:true};let payment,firstCreate=true,receiptCalls=0;const receiptKeys=[];
 const accounts={requireSession:(req,_res,next)=>{req.user={id:'u',email:'buyer@example.test'};next()}};
 const clientFor=()=>async(path,options={})=>{
  if(path==='/payments'){
   assert.equal(options.body.receipt.items[0].payment_mode,'full_prepayment');
   if(!payment)payment={id:randomUUID(),test:false,status:'pending',paid:false,amount:options.body.amount,metadata:options.body.metadata,receipt_registration:'pending',confirmation:{type:'redirect',confirmation_url:'https://yookassa.ru/checkout'}};
   if(firstCreate){firstCreate=false;throw Error('connection lost after creation')}
   return payment;
  }
  if(path==='/payments/'+payment.id)return payment;
  if(path.startsWith('/refunds?'))return {type:'list',items:[]};
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
  const legacy=billing.order('u','daily');db.prepare("UPDATE billing_orders SET receipt_mode='full_prepayment' WHERE id=?").run(legacy.id);
  assert.equal((await post('/api/billing/orders',{kind:'daily',termsVersion:2})).status,503);assert.equal((await post('/api/billing/orders',{kind:'daily',termsVersion:2})).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_orders').get().n,1);
  payment={...payment,status:'succeeded',paid:true,receipt_registration:'succeeded'};const n={type:'notification',event:'payment.succeeded',object:{id:payment.id}};
  assert.equal((await post('/api/yookassa/webhook',n)).status,200);assert.equal((await post('/api/yookassa/webhook',n)).status,200);
  assert.equal(billing.state('u').plan,'daily');assert.equal(db.prepare("SELECT COUNT(*) n FROM billing_receipt_jobs").get().n,1);
  await processor.processPending();assert.equal(receiptCalls,1);assert.equal(db.prepare('SELECT status FROM billing_receipt_jobs').get().status,'pending');
  db.exec('UPDATE billing_receipt_jobs SET last_attempt=0');await processor.processPending();assert.equal(receiptCalls,2);assert.equal(receiptKeys[0],receiptKeys[1]);assert.equal(db.prepare('SELECT status FROM billing_receipt_jobs').get().status,'succeeded');
  const refundId=randomUUID(),notice={type:'notification',event:'refund.succeeded',object:{id:refundId}};assert.equal((await post('/api/yookassa/webhook',notice)).status,200);assert.equal((await post('/api/yookassa/webhook',notice)).status,200);assert.equal(billing.state('u').review,true);assert.throws(()=>billing.debit('u','12345678-1234-1234-1234-123456789012'),/возврата/);
 }finally{processor.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close()}
});

test('live full payment produces no settlement receipt, including after retries',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,created INTEGER)');const billing=setupBilling(db);db.prepare('INSERT INTO users VALUES (?,?,?)').run('u','buyer@example.test',Date.now());
 const app=express();app.use(express.json());const settings={shopId:'1516684',mode:'live',secret:'live_example',verified:true};let payment,receiptCalls=0,paymentCalls=0;
 const accounts={requireSession:(req,_res,next)=>{req.user={id:'u',email:'buyer@example.test'};next()}};
 const clientFor=()=>async(path,options={})=>{
  if(path==='/payments'){paymentCalls++;assert.equal(options.body.receipt.items[0].payment_mode,'full_payment');payment??={id:randomUUID(),test:false,status:'pending',paid:false,amount:options.body.amount,metadata:options.body.metadata,receipt_registration:'pending',confirmation:{type:'redirect',confirmation_url:'https://yookassa.ru/checkout'}};return payment}
  if(path==='/payments/'+payment.id)return payment;
  if(path.startsWith('/refunds?'))return {type:'list',items:[]};
  if(path==='/receipts'){receiptCalls++;throw Error('unexpected settlement receipt')}
  throw Error('unexpected path '+path);
 };
 const processor=setupYooKassa(app,{db,billing,paymentSettings:{get:()=>settings},accounts,enabled:true,clientFor});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/api/billing/orders',{kind:'daily',termsVersion:2})).status,200);assert.equal((await post('/api/billing/orders',{kind:'daily',termsVersion:2})).status,200);assert.equal(paymentCalls,2);
  payment={...payment,status:'succeeded',paid:true,receipt_registration:'succeeded'};const n={type:'notification',event:'payment.succeeded',object:{id:payment.id}};
  assert.equal((await post('/api/yookassa/webhook',n)).status,200);assert.equal((await post('/api/yookassa/webhook',n)).status,200);await processor.processPending();
  assert.equal(billing.state('u').plan,'daily');assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_receipt_jobs').get().n,0);assert.equal(receiptCalls,0);
 }finally{processor.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close()}
});

test('refund reconciliation restores missed refunds once, follows pages and reports failures',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,created INTEGER)');const billing=setupBilling(db);db.prepare('INSERT INTO users VALUES (?,?,?)').run('u','buyer@example.test',Date.now());
 const app=express();app.use(express.json());const settings={shopId:'1516684',mode:'live',secret:'live_example',verified:true},accounts={requireSession:(req,_res,next)=>{req.user={id:'u',email:'buyer@example.test'};next()}};
 const paymentId=randomUUID(),refund1=randomUUID(),refund2=randomUUID(),unrelated=randomUUID(),created=new Date(Date.now()-3600000).toISOString();let fail=true,calls=[];
 const clientFor=()=>async(path)=>{calls.push(path);if(path.startsWith('/refunds?')){if(fail)throw Error('temporary failure');const params=new URLSearchParams(path.split('?')[1]);if(!params.has('cursor'))return {type:'list',items:[{id:refund1,payment_id:paymentId,status:'succeeded',amount:{value:'20.00',currency:'RUB'},created_at:created},{id:randomUUID(),payment_id:unrelated,status:'succeeded',amount:{value:'99.00',currency:'RUB'},created_at:created}],next_cursor:'page-2'};assert.equal(params.get('cursor'),'page-2');return {type:'list',items:[{id:refund2,payment_id:paymentId,status:'succeeded',amount:{value:'30.00',currency:'RUB'},created_at:created}]}}throw Error('Unexpected request '+path)};
 const processor=setupYooKassa(app,{db,billing,paymentSettings:{get:()=>settings},accounts,enabled:true,clientFor});
 try{
  const order=billing.order('u','daily');db.prepare('INSERT INTO yookassa_payments(order_id,payment_id,shop_id,receipt_status) VALUES (?,?,?,?)').run(order.id,paymentId,settings.shopId,'succeeded');billing.complete(order.id,paymentId,{userId:'u',amount:5000,testMode:false});
  await processor.processPending();assert.ok(db.prepare('SELECT last_error FROM yookassa_refund_sync').get().last_error);assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_refunds').get().n,0);
  fail=false;await processor.processPending();assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_refunds').get().n,2);assert.deepEqual({...db.prepare('SELECT SUM(count) count,SUM(amount) amount FROM billing_refund_days').get()},{count:2,amount:5000});assert.ok(db.prepare('SELECT last_completed FROM yookassa_refund_sync').get().last_completed);assert.equal(billing.state('u').review,true);
  db.exec('UPDATE yookassa_refund_sync SET last_completed=0');await processor.processPending();assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_refunds').get().n,2);assert.equal(db.prepare('SELECT SUM(amount) n FROM billing_refund_days').get().n,5000);assert.ok(calls.some(path=>path.includes('cursor=page-2')));
 }finally{processor.close();db.close()}
});
