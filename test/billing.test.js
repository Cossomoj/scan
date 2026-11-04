import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {setupBilling} from '../server/billing.js';

test('daily plan allows 50 downloads, then uses the free download once',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');
 let now=100000;const billing=setupBilling(db,{clock:()=>now});db.prepare('INSERT INTO users VALUES (?,?)').run('new',now);
 assert.equal('balance' in billing.state('new'),false);assert.equal(billing.state('new').downloadLimit,1);assert.equal(billing.state('new').downloadUsed,0);billing.adjust('new',{plan:'daily'});
 assert.equal(billing.state('new').plan,'daily');assert.equal(billing.state('new').remaining,50);
 for(let i=0;i<49;i++)billing.debit('new','download-request-'+String(i).padStart(8,'0'));
 assert.equal(billing.downloads('new'),49);assert.equal(billing.state('new').downloadLimit,50);assert.equal(billing.state('new').downloadUsed,49);
 assert.equal('balance' in billing.state('new'),false);
 const id='12345678-1234-1234-1234-123456789012';billing.debit('new',id,'first');assert.equal(billing.debit('new',id,'first').repeated,true);assert.equal(billing.downloads('new'),50);
 assert.throws(()=>billing.debit('new',id,'different'),/другого документа/);
 now+=86400000;assert.equal(billing.debit('new','new-download-request-00001').kind,'document_free');assert.equal(billing.state('new').downloadUsed,1);assert.equal(billing.state('new').downloadLimit,1);assert.throws(()=>billing.debit('new','new-download-request-00002'),/тариф/);
 assert.equal('balance' in billing.state('new'),false);db.close();
});

test('one free download per account is preserved across setup and protected against retries',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');db.prepare('INSERT INTO users VALUES (?,?)').run('u',100);
 let billing=setupBilling(db,{clock:()=>100});const first='free-download-request-00001';
 assert.equal(billing.state('u').freeRemaining,1);assert.equal(billing.debit('u',first,'document-a').kind,'document_free');assert.equal(billing.state('u').freeRemaining,0);assert.equal(billing.downloads('u'),1);
 assert.equal(billing.debit('u',first,'document-a').repeated,true);assert.throws(()=>billing.debit('u',first,'document-b'),/другого документа/);
 billing=setupBilling(db,{clock:()=>100});assert.equal(billing.state('u').freeRemaining,0);assert.throws(()=>billing.debit('u','free-download-request-00002','document-b'),/тариф/);
 billing.adjust('u',{plan:'monthly'});assert.equal(billing.debit('u','paid-download-request-00001','document-b').kind,'document_plan');assert.equal(billing.downloads('u'),2);db.close();
});

test('payment orders validate amount and identity; retries and test payments do not duplicate credit',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');const billing=setupBilling(db,{clock:()=>100});db.prepare('INSERT INTO users VALUES (?,?)').run('u',100);
 assert.throws(()=>billing.order('u','topup',5000),/тариф/);
 const order=billing.order('u','daily');assert.throws(()=>billing.complete(order.id,'tx1',{userId:'other',amount:5000,testMode:false}),/платежа/);
 assert.throws(()=>billing.complete(order.id,'tx1',{userId:'u',amount:5001,testMode:false}),/платежа/);
 billing.complete(order.id,'tx1',{userId:'u',amount:5000,testMode:false});billing.complete(order.id,'tx1',{userId:'u',amount:5000,testMode:false});assert.equal(billing.state('u').plan,'daily');
 const testOrder=billing.order('u','yearly',0,true);billing.complete(testOrder.id,'tx2',{userId:'u',amount:149900,testMode:true});billing.complete(testOrder.id,'tx2',{userId:'u',amount:149900,testMode:true});assert.equal(billing.state('u').plan,'daily');
 db.close();
});

test('partial refunds suspend new charges until an administrator reconciles them',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');const billing=setupBilling(db,{clock:()=>100});db.prepare('INSERT INTO users VALUES (?,?)').run('u',100);
 const o=billing.order('u','daily');billing.complete(o.id,'100',{userId:'u',amount:5000,testMode:false});
 assert.equal(billing.refund('100','200',2000).repeated,false);assert.equal(billing.refund('100','200',2000).repeated,true);assert.equal(billing.state('u').review,true);
 assert.throws(()=>billing.refund('100','201',3001),/превышает/);assert.throws(()=>billing.debit('u','12345678-1234-1234-1234-123456789012'),/возврата/);
 billing.adjust('u',{plan:'daily',resolveRefunds:true});assert.equal(billing.state('u').review,false);assert.equal(billing.debit('u','12345678-1234-1234-1234-123456789012').plan,'daily');
 db.close();
});

test('purchased plans queue in payment order and start when the previous plan ends',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');let now=100;const billing=setupBilling(db,{clock:()=>now});db.prepare('INSERT INTO users VALUES (?,?)').run('u',now);
 const one=billing.order('u','monthly'),two=billing.order('u','yearly'),three=billing.order('u','monthly');
 billing.complete(one.id,'101',{userId:'u',amount:24900,testMode:false});billing.complete(two.id,'102',{userId:'u',amount:149900,testMode:false});billing.complete(three.id,'103',{userId:'u',amount:24900,testMode:false});
 assert.equal(billing.state('u').plan,'monthly');assert.equal(billing.state('u').remaining,250);assert.equal(billing.state('u').queued,2);
 for(let i=0;i<250;i++)billing.debit('u','download-request-'+String(i).padStart(8,'0'));
 assert.equal(billing.state('u').plan,'yearly');assert.equal(billing.state('u').remaining,2500);assert.equal(billing.state('u').queued,1);
 now+=366*86400000;assert.equal(billing.state('u').plan,'monthly');assert.equal(billing.state('u').remaining,250);assert.equal(billing.state('u').queued,0);
 db.close();
});

test('refunded queued plan is removed and no other queued plan starts before review',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');let now=100;const billing=setupBilling(db,{clock:()=>now});db.prepare('INSERT INTO users VALUES (?,?)').run('u',now);
 for(const [i,kind,amount] of [[1,'monthly',24900],[2,'yearly',149900],[3,'monthly',24900]]){const o=billing.order('u',kind);billing.complete(o.id,String(i),{userId:'u',amount,testMode:false})}
 billing.refund('2','20',149900);assert.equal(billing.state('u').queued,1);now+=31*86400000;assert.equal(billing.state('u').plan,null);assert.equal(billing.state('u').queued,1);
 billing.adjust('u',{resolveRefunds:true});assert.equal(billing.state('u').plan,'monthly');assert.equal(billing.state('u').queued,0);db.close();
});

test('daily plans queue behind paid plans and the next plan starts after 24 hours',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');let now=100;const billing=setupBilling(db,{clock:()=>now});db.prepare('INSERT INTO users VALUES (?,?)').run('u',now);
 for(const [i,kind,amount] of [[1,'monthly',24900],[2,'daily',5000],[3,'yearly',149900]]){
  const o=billing.order('u',kind);billing.complete(o.id,String(i),{userId:'u',amount,testMode:false});
 }
 assert.equal(billing.state('u').plan,'monthly');assert.equal(billing.state('u').queued,2);
 for(let i=0;i<250;i++)billing.debit('u','monthly-download-'+String(i).padStart(8,'0'));
 assert.equal(billing.state('u').plan,'daily');assert.equal(billing.state('u').remaining,50);assert.equal(billing.state('u').queued,1);
 for(let i=0;i<49;i++)billing.debit('u','daily-download-'+String(i).padStart(8,'0'));
 now+=86400000-1;assert.equal(billing.state('u').plan,'daily');
 now+=1;assert.equal(billing.state('u').plan,'yearly');assert.equal(billing.state('u').remaining,2500);db.close();
});

test('migration preserves existing daily unlimited terms and accounts for prior monthly and yearly downloads',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');let now=100;let billing=setupBilling(db,{clock:()=>now});
 for(const id of ['daily','monthly','yearly','exhausted'])db.prepare('INSERT INTO users VALUES (?,?)').run(id,now);
 for(const [id,plan] of [['daily','daily'],['monthly','monthly'],['yearly','yearly'],['exhausted','monthly']])billing.adjust(id,{plan});
 db.exec("DELETE FROM billing_migrations WHERE name='plan_limits_v2'; UPDATE billing_wallets SET terms_version=1,unlimited_legacy=0; UPDATE billing_wallets SET remaining=0 WHERE user_id IN ('daily','exhausted'); UPDATE billing_wallets SET remaining=13 WHERE user_id='monthly'; UPDATE billing_wallets SET remaining=91 WHERE user_id='yearly'");
 billing=setupBilling(db,{clock:()=>now});assert.equal(billing.state('daily').remaining,null);assert.equal(billing.state('daily').signatureLimit,100);
 assert.equal(billing.state('monthly').remaining,243);assert.equal(billing.state('monthly').signatureLimit,100);assert.equal(billing.state('yearly').remaining,2491);assert.equal(billing.state('exhausted').plan,null);
 for(let i=0;i<60;i++)billing.debit('daily','legacy-download-'+String(i).padStart(8,'0'));
 billing=setupBilling(db,{clock:()=>now});assert.equal(billing.state('daily').remaining,null);assert.equal(billing.state('monthly').remaining,243);db.close();
});

test('previously purchased queued daily plan keeps unlimited downloads',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');let now=100;const billing=setupBilling(db,{clock:()=>now});db.prepare('INSERT INTO users VALUES (?,?)').run('u',now);
 billing.adjust('u',{plan:'monthly'});const order=billing.order('u','daily');db.prepare('UPDATE billing_orders SET terms_version=1 WHERE id=?').run(order.id);billing.complete(order.id,'legacy-tx',{userId:'u',amount:5000,testMode:false});
 now+=31*86400000;assert.equal(billing.state('u').plan,'daily');assert.equal(billing.state('u').remaining,null);assert.equal(billing.state('u').signatureLimit,100);
 for(let i=0;i<60;i++)billing.debit('u','queued-legacy-'+String(i).padStart(8,'0'));assert.equal(billing.state('u').plan,'daily');db.close();
});

test('upgrades an old wallet schema without changing paid daily terms',()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL); INSERT INTO users VALUES ('u',100); CREATE TABLE billing_wallets(user_id TEXT PRIMARY KEY REFERENCES users(id),plan TEXT,remaining INTEGER NOT NULL DEFAULT 0,expires INTEGER); INSERT INTO billing_wallets VALUES ('u','daily',0,86400100)");
 const billing=setupBilling(db,{clock:()=>100});assert.equal(billing.state('u').remaining,null);assert.equal(billing.state('u').signatureLimit,100);
 const columns=db.prepare('PRAGMA table_info(billing_wallets)').all().map(c=>c.name);assert.ok(columns.includes('unlimited_legacy'));assert.ok(columns.includes('terms_version'));db.close();
});

test('migration removes old balance and cancels pending topups while preserving plans and history',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');
 let now=100;let billing=setupBilling(db,{clock:()=>now});db.prepare('INSERT INTO users VALUES (?,?)').run('u',now);billing.adjust('u',{plan:'monthly'});
 db.exec('ALTER TABLE billing_wallets ADD COLUMN balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0)');
 db.prepare('UPDATE billing_wallets SET balance=5000 WHERE user_id=?').run('u');
 db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,?)').run('old-bonus','u',now,'welcome',1000,'',null);
 db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,?)').run('old-credit','u',now,'topup',5000,'','payment:old-paid');
 db.prepare("INSERT INTO billing_orders(id,user_id,kind,amount,status,created,transaction_id,test_mode) VALUES (?,?,?,?,?,?,?,?)").run('old-pending','u','topup',5000,'pending',now,null,0);
 db.prepare("INSERT INTO billing_orders(id,user_id,kind,amount,status,created,transaction_id,test_mode) VALUES (?,?,?,?,?,?,?,?)").run('old-paid','u','topup',5000,'paid',now,'old-payment',0);
 billing=setupBilling(db,{clock:()=>now});setupBilling(db,{clock:()=>now});
 assert.equal(db.prepare('PRAGMA table_info(billing_wallets)').all().some(c=>c.name==='balance'),false);
 assert.equal(billing.state('u').plan,'monthly');assert.equal(billing.state('u').remaining,250);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM billing_ledger WHERE id='old-bonus'").get().n,0);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM billing_ledger WHERE id='old-credit'").get().n,1);
 assert.equal(db.prepare("SELECT status FROM billing_orders WHERE id='old-pending'").get().status,'canceled');
 assert.equal(db.prepare("SELECT status FROM billing_orders WHERE id='old-paid'").get().status,'paid');db.close();
});

test('a legacy queued prepaid tariff creates its settlement receipt only when activated',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');
 let now=100;const billing=setupBilling(db,{clock:()=>now});db.exec('CREATE TABLE yookassa_payments(order_id TEXT PRIMARY KEY REFERENCES billing_orders(id),payment_id TEXT,shop_id TEXT)');
 db.prepare('INSERT INTO users VALUES (?,?)').run('u',now);billing.adjust('u',{plan:'daily'});
 const order=billing.order('u','monthly');db.prepare("UPDATE billing_orders SET receipt_mode='full_prepayment' WHERE id=?").run(order.id);db.prepare('INSERT INTO yookassa_payments VALUES (?,?,?)').run(order.id,'payment','1516684');
 billing.complete(order.id,'payment',{userId:'u',amount:24900,testMode:false});assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_receipt_jobs').get().n,0);
 now+=86400000;assert.equal(billing.state('u').plan,'monthly');assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_receipt_jobs').get().n,1);
 billing.state('u');assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_receipt_jobs').get().n,1);db.close();
});

test('fully paid queued tariff does not create a second receipt on activation',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');
 let now=100;const billing=setupBilling(db,{clock:()=>now});db.exec('CREATE TABLE yookassa_payments(order_id TEXT PRIMARY KEY REFERENCES billing_orders(id),payment_id TEXT,shop_id TEXT)');
 db.prepare('INSERT INTO users VALUES (?,?)').run('u',now);billing.adjust('u',{plan:'daily'});
 const order=billing.order('u','monthly');assert.equal(order.receiptMode,'full_payment');db.prepare('INSERT INTO yookassa_payments VALUES (?,?,?)').run(order.id,'payment','1516684');
 billing.complete(order.id,'payment',{userId:'u',amount:24900,testMode:false});now+=86400000;
 assert.equal(billing.state('u').plan,'monthly');assert.equal(db.prepare('SELECT COUNT(*) n FROM billing_receipt_jobs').get().n,0);db.close();
});

test('old orders retain the prepayment mode when upgrading the database',()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL); INSERT INTO users VALUES ('u',100); CREATE TABLE billing_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,transaction_id TEXT UNIQUE,test_mode INTEGER NOT NULL DEFAULT 0); INSERT INTO billing_orders VALUES ('old','u','daily',5000,'pending',100,NULL,0)");
 const billing=setupBilling(db,{clock:()=>100});setupBilling(db,{clock:()=>100});
 assert.equal(db.prepare("SELECT receipt_mode FROM billing_orders WHERE id='old'").get().receipt_mode,'full_prepayment');
 assert.equal(db.prepare('SELECT receipt_mode FROM billing_orders WHERE id=?').get(billing.order('u','daily').id).receipt_mode,'full_payment');db.close();
});
