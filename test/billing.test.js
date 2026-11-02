import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setupBilling} from '../server/billing.js';

test('billing credits new registrations once and debits atomically',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');
 let now=100000;const billing=setupBilling(db,{clock:()=>now});
 db.prepare('INSERT INTO users VALUES (?,?)').run('new',now);
 assert.equal(billing.state('new').balance,1000);
 const first=billing.debit('new','12345678-1234-1234-1234-123456789012');assert.equal(first.balance,0);
 assert.equal(billing.debit('new','12345678-1234-1234-1234-123456789012').repeated,true);
 assert.throws(()=>billing.debit('new','12345678-1234-1234-1234-123456789012','different-document'),/другого документа/);
 assert.throws(()=>billing.debit('new','12345678-1234-1234-1234-123456789013'),/Недостаточно/);
 assert.equal(db.prepare('SELECT count(*) n FROM billing_ledger').get().n,2);
 billing.adjust('new',{plan:'monthly',balance:5000});assert.equal(billing.state('new').remaining,20);
 billing.debit('new','12345678-1234-1234-1234-123456789014');assert.equal(billing.state('new').remaining,19);assert.equal(billing.state('new').balance,5000);
 now+=31*86400000;billing.debit('new','12345678-1234-1234-1234-123456789015');assert.equal(billing.state('new').balance,4000);
 db.close();
});

test('payment orders validate amount and identity; retries and test payments do not duplicate credit',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');const billing=setupBilling(db,{clock:()=>100});db.prepare('INSERT INTO users VALUES (?,?)').run('u',100);
 assert.throws(()=>billing.order('u','topup',4999),/50/);
 const order=billing.order('u','topup',5000);assert.throws(()=>billing.complete(order.id,'tx1',{userId:'other',amount:5000,testMode:false}),/платежа/);
 assert.throws(()=>billing.complete(order.id,'tx1',{userId:'u',amount:5001,testMode:false}),/платежа/);
 billing.complete(order.id,'tx1',{userId:'u',amount:5000,testMode:false});billing.complete(order.id,'tx1',{userId:'u',amount:5000,testMode:false});assert.equal(billing.state('u').balance,6000);
 const testOrder=billing.order('u','yearly',0,true);billing.complete(testOrder.id,'tx2',{userId:'u',amount:149900,testMode:true});billing.complete(testOrder.id,'tx2',{userId:'u',amount:149900,testMode:true});assert.equal(billing.state('u').plan,null);
 db.close();
});

test('partial refunds suspend new charges until an administrator reconciles them',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');const billing=setupBilling(db,{clock:()=>100});db.prepare('INSERT INTO users VALUES (?,?)').run('u',100);
 const o=billing.order('u','topup',5000);billing.complete(o.id,'100',{userId:'u',amount:5000,testMode:false});
 assert.equal(billing.refund('100','200',2000).repeated,false);assert.equal(billing.refund('100','200',2000).repeated,true);assert.equal(billing.state('u').review,true);
 assert.throws(()=>billing.refund('100','201',3001),/превышает/);assert.throws(()=>billing.debit('u','12345678-1234-1234-1234-123456789012'),/возврата/);
 billing.adjust('u',{balance:4000,resolveRefunds:true});assert.equal(billing.state('u').review,false);assert.equal(billing.debit('u','12345678-1234-1234-1234-123456789012').balance,3000);
 db.close();
});

test('purchased plans queue in payment order and start when the previous plan ends',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');let now=100;const billing=setupBilling(db,{clock:()=>now});db.prepare('INSERT INTO users VALUES (?,?)').run('u',now);
 const one=billing.order('u','monthly'),two=billing.order('u','yearly'),three=billing.order('u','monthly');
 billing.complete(one.id,'101',{userId:'u',amount:24900,testMode:false});billing.complete(two.id,'102',{userId:'u',amount:149900,testMode:false});billing.complete(three.id,'103',{userId:'u',amount:24900,testMode:false});
 assert.equal(billing.state('u').plan,'monthly');assert.equal(billing.state('u').remaining,20);assert.equal(billing.state('u').queued,2);
 for(let i=0;i<20;i++)billing.debit('u','download-request-'+String(i).padStart(8,'0'));
 assert.equal(billing.state('u').plan,'yearly');assert.equal(billing.state('u').remaining,100);assert.equal(billing.state('u').queued,1);
 now+=366*86400000;assert.equal(billing.state('u').plan,'monthly');assert.equal(billing.state('u').remaining,20);assert.equal(billing.state('u').queued,0);
 db.close();
});

test('refunded queued plan is removed and no other queued plan starts before review',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');let now=100;const billing=setupBilling(db,{clock:()=>now});db.prepare('INSERT INTO users VALUES (?,?)').run('u',now);
 for(const [i,kind,amount] of [[1,'monthly',24900],[2,'yearly',149900],[3,'monthly',24900]]){const o=billing.order('u',kind);billing.complete(o.id,String(i),{userId:'u',amount,testMode:false})}
 billing.refund('2','20',149900);assert.equal(billing.state('u').queued,1);now+=31*86400000;assert.equal(billing.state('u').plan,null);assert.equal(billing.state('u').queued,1);
 billing.adjust('u',{resolveRefunds:true});assert.equal(billing.state('u').plan,'monthly');assert.equal(billing.state('u').queued,0);db.close();
});
