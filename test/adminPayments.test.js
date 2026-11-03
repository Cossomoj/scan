import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync} from 'node:crypto';
import express from 'express';
import {setupBilling} from '../server/billing.js';
import {setupAdmin} from '../server/admin.js';

test('dashboard counts confirmed payments by Moscow date and current plans',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,created INTEGER,last_seen INTEGER);CREATE TABLE account_assets(user_id TEXT,id TEXT,data TEXT,updated INTEGER)');
 let now=Date.UTC(2026,10,3,12);const billing=setupBilling(db,{clock:()=>now});
 for(const id of ['monthly','yearly','archived','expired'])db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id,id+'@example.test',now,now);
 const app=express();app.use(express.json());const salt=Buffer.alloc(16,7),credential=salt.toString('hex')+':'+scryptSync('test-password',salt,32).toString('hex');setupAdmin(app,db,{billing,credential,clock:()=>now});
 billing.adjust('monthly',{plan:'monthly'});billing.adjust('yearly',{plan:'yearly'});billing.adjust('archived',{plan:'monthly'});billing.adjust('expired',{plan:'yearly'});
 db.prepare('UPDATE users SET archived_at=? WHERE id=?').run(now,'archived');db.prepare('UPDATE billing_wallets SET expires=? WHERE user_id=?').run(now-1,'expired');
 const payment=(when,amount,tx,testMode=false)=>{now=when;const o=billing.order('monthly','topup',amount,testMode);billing.complete(o.id,tx,{userId:'monthly',amount,testMode});return o};
 payment(Date.UTC(2026,9,20,12),5000,'101');payment(Date.UTC(2026,10,1,12),6000,'102');payment(Date.UTC(2026,10,2,12),7000,'103');
 const earlier=billing.order('monthly','topup',8000);payment(Date.UTC(2026,10,2,20,59),5000,'106');payment(Date.UTC(2026,10,2,21),5000,'107');now=Date.UTC(2026,10,3,12);billing.complete(earlier.id,'104',{userId:'monthly',amount:8000,testMode:false});billing.complete(earlier.id,'104',{userId:'monthly',amount:8000,testMode:false});payment(now,9000,'105',true);billing.order('monthly','topup',10000);
 const queuedOrder=billing.order('yearly','monthly');billing.complete(queuedOrder.id,'108',{userId:'yearly',amount:24900,testMode:false});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root=`http://127.0.0.1:${server.address().port}`;
 try{let response=await fetch(root+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'Max',password:'test-password'})});const cookie=response.headers.get('set-cookie');assert.equal(response.status,200);
  const stats=await(await fetch(root+'/api/admin/stats',{headers:{cookie}})).json();assert.deepEqual(stats.payments.today,{count:3,amount:37900});assert.deepEqual(stats.payments.week,{count:5,amount:49900});assert.deepEqual(stats.payments.month,{count:6,amount:55900});assert.deepEqual(stats.subscriptions,{total:2,monthly:1,yearly:1,queued:1});
  assert.equal(stats.series.length,30);assert.equal(stats.series.at(-1).day,Date.UTC(2026,10,2,21));assert.equal(stats.series.at(-1).payments,3);assert.equal(stats.series.at(-2).payments,2);assert.equal(stats.series.at(-3).payments,1);assert.equal(stats.series.at(-1).users,4);assert.equal(stats.series.at(-1).downloads,0);assert.equal(stats.series.at(-2).downloads,null);assert.equal(stats.series.at(-4).payments,null);assert.equal(stats.series.reduce((sum,item)=>sum+item.payments,0),7);
  db.prepare("UPDATE billing_orders SET status='canceled' WHERE status='pending'").run();response=await fetch(root+'/api/admin/clients/monthly',{method:'DELETE',headers:{cookie}});assert.equal(response.status,200);
  const after=await(await fetch(root+'/api/admin/stats',{headers:{cookie}})).json();assert.deepEqual(after.payments.month,{count:6,amount:55900});assert.equal(after.subscriptions.monthly,0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.close()}
});

test('five failed logins lock every new login until server setup restarts',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,created INTEGER,last_seen INTEGER);CREATE TABLE account_assets(user_id TEXT,id TEXT,data TEXT,updated INTEGER)');let now=1000;
 const salt=Buffer.alloc(16,9),credential=salt.toString('hex')+':'+scryptSync('right-password',salt,32).toString('hex');
 async function start(){const app=express();app.use(express.json());setupAdmin(app,db,{credential,clock:()=>now});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return server}
 const login=(server,password)=>fetch(`http://127.0.0.1:${server.address().port}/api/admin/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'Max',password})});
 let server=await start();try{
  for(let i=0;i<4;i++)assert.equal((await login(server,'wrong')).status,401);
  const loggedIn=await login(server,'right-password');assert.equal(loggedIn.status,200);const session=loggedIn.headers.get('set-cookie'); // Success clears previous failures.
  for(let i=0;i<4;i++)assert.equal((await login(server,'wrong')).status,401);
  const locked=await login(server,'wrong');assert.equal(locked.status,429);assert.match((await locked.json()).error,/Перезапустите сервер/);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/admin/stats`,{headers:{cookie:session}})).status,200);
  now+=24*3600000;assert.equal((await login(server,'right-password')).status,429);
  server.closeAllConnections();await new Promise(r=>server.close(r));server=await start();assert.equal((await login(server,'right-password')).status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.close()}
});

test('existing payments are migrated once using the time of payment',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER)');let now=Date.UTC(2026,10,1,12);let billing=setupBilling(db,{clock:()=>now});db.prepare('INSERT INTO users VALUES (?,?)').run('u',now);
 const order=billing.order('u','topup',5000);now=Date.UTC(2026,10,3,12);billing.complete(order.id,'123',{userId:'u',amount:5000,testMode:false});
 db.exec("DELETE FROM billing_payment_days; DELETE FROM billing_migrations WHERE name='payment_days_v1'");billing=setupBilling(db,{clock:()=>now});setupBilling(db,{clock:()=>now});
 const days=db.prepare('SELECT * FROM billing_payment_days').all();assert.equal(days.length,1);assert.equal(days[0].count,1);assert.equal(days[0].amount,5000);assert.equal(days[0].day,Date.UTC(2026,10,2,21));db.close();
});
