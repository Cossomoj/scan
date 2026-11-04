import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {setupBilling} from '../server/billing.js';
import {validCloudPaymentsSignature,parseCloudPaymentsBody,validateCloudPaymentsOrder} from '../server/cloudPayments.js';
import {setupCloudNotifications} from '../server/cloudRoutes.js';
import express from 'express';

test('CloudPayments validates the signed raw body and matches the stored order',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');const billing=setupBilling(db);db.prepare('INSERT INTO users VALUES (?,?)').run('user1',Date.now());const order=billing.order('user1','daily',5000,true);
 const raw=Buffer.from(new URLSearchParams({InvoiceId:order.id,AccountId:'user1',Amount:'50.00',Currency:'RUB',TestMode:'1'}).toString());const mac=createHmac('sha256','secret').update(raw).digest('base64');
 assert.equal(validCloudPaymentsSignature(raw,mac,'secret'),true);assert.equal(validCloudPaymentsSignature(Buffer.from(raw+'x'),mac,'secret'),false);assert.equal(validCloudPaymentsSignature(raw,'invalid','secret'),false);
 const fields=parseCloudPaymentsBody(raw);assert.equal(validateCloudPaymentsOrder(db,fields).code,0);assert.equal(validateCloudPaymentsOrder(db,{...fields,AccountId:'user2'}).code,11);assert.equal(validateCloudPaymentsOrder(db,{...fields,Amount:'50.01'}).code,12);assert.equal(validateCloudPaymentsOrder(db,{...fields,TestMode:'0'}).code,13);assert.throws(()=>parseCloudPaymentsBody(Buffer.from('Amount=50&Amount=500')));
 db.close();
});

test('signed CloudPayments notifications validate order and accept duplicate delivery once',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');const billing=setupBilling(db);db.prepare('INSERT INTO users VALUES (?,?)').run('user1',Date.now());const order=billing.order('user1','daily',5000,true);
 const app=express();setupCloudNotifications(app,{db,billing,paymentSettings:{get:()=>({secret:'very-secret-test'})}});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root=`http://127.0.0.1:${server.address().port}`;
 const fields={InvoiceId:order.id,AccountId:'user1',Amount:'50.00',Currency:'RUB',TestMode:'1',Status:'Completed',OperationType:'Payment',TransactionId:'12345'};
 const send=(kind,data,valid=true)=>{const body=new URLSearchParams(data).toString(),mac=createHmac('sha256',valid?'very-secret-test':'wrong').update(body).digest('base64');return fetch(root+'/api/cloudpayments/'+kind,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','Content-HMAC':mac},body})};
 try{assert.equal((await send('check',fields,false)).status,403);assert.equal((await(await send('check',{...fields,Amount:'51'})).json()).code,12);assert.equal((await(await send('check',fields)).json()).code,0);assert.equal((await(await send('pay',fields)).json()).code,0);assert.equal((await(await send('pay',fields)).json()).code,0);assert.equal('balance' in billing.state('user1'),false);assert.equal(billing.getOrder(order.id,'user1').status,'test_paid');const refund={PaymentTransactionId:'12345',TransactionId:'999',Amount:'25.00',OperationType:'Refund'};assert.equal((await(await send('refund',refund)).json()).code,0);assert.equal((await(await send('refund',refund)).json()).code,0);assert.equal(billing.state('user1').review,false)}finally{await new Promise(r=>server.close(r));db.close()}
});
