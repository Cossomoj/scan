import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scryptSync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {setupAccounts} from '../server/account.js';
import {setupBilling} from '../server/billing.js';
import {setupAdmin} from '../server/admin.js';

test('archive revokes access and preserves data; restore and permanent deletion work with billing foreign keys',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'admin-users-test-')),db=new DatabaseSync(':memory:'),mail=[];db.exec('PRAGMA foreign_keys=ON');let now=1700000000000;
 const app=express();app.use(express.json());setupAccounts(app,db,{dataDir:dir,sendMail:async(email,code)=>mail.push({email,code}),clock:()=>now});const billing=setupBilling(db,{clock:()=>now});const salt=Buffer.alloc(16,4),credential=salt.toString('hex')+':'+scryptSync('test-password',salt,32).toString('hex');setupAdmin(app,db,{credential,billing,clock:()=>now});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root=`http://127.0.0.1:${server.address().port}`;
 const call=(path,{method='GET',body,cookie,origin}={})=>fetch(root+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:body?JSON.stringify(body):undefined});
 const post=(path,body,cookie)=>call(path,{method:'POST',body:path==='/api/account/code'?{consent:true,consentVersion:'2026-11-03-account-v1',...body}:body,cookie});
 try{
  await post('/api/account/code',{email:'reader@example.test'});let response=await post('/api/account/verify',{email:'reader@example.test',code:mail.at(-1).code});assert.equal(response.status,200);const userCookie=response.headers.get('set-cookie'),user=db.prepare('SELECT * FROM users WHERE email=?').get('reader@example.test');
  const item={id:'example',kind:'text',name:'Example',text:'Example',color:'#17233b',widthMm:50,heightMm:10};assert.equal((await call('/api/account/assets/example',{method:'PUT',body:item,cookie:userCookie})).status,200);
  const order=billing.order(user.id,'monthly');billing.complete(order.id,'111',{userId:user.id,amount:24900,testMode:false});const pending=billing.order(user.id,'topup',5000);
  response=await post('/api/admin/login',{login:'Max',password:'test-password'});const adminCookie=response.headers.get('set-cookie');assert.equal(response.status,200);
  assert.equal((await post(`/api/admin/clients/${user.id}/archive`)).status,401);assert.equal((await call(`/api/admin/clients/${user.id}/archive`,{method:'POST',cookie:adminCookie,origin:'https://evil.test'})).status,403);
  now+=61000;await post('/api/account/code',{email:user.email});const oldCode=mail.at(-1).code;assert.equal((await post(`/api/admin/clients/${user.id}/archive`,undefined,adminCookie)).status,200);
  assert.equal((await call('/api/account/assets',{cookie:userCookie})).status,401);assert.equal((await post('/api/account/verify',{email:user.email,code:oldCode})).status,400);
  assert.equal((await(await call('/api/admin/clients',{cookie:adminCookie})).json()).total,0);const archived=await(await call('/api/admin/clients?status=archived',{cookie:adminCookie})).json();assert.equal(archived.users[0].email,user.email);assert.equal(archived.users[0].billing.remaining,20);
  assert.equal((await call(`/api/admin/clients/${user.id}`,{method:'DELETE',cookie:adminCookie})).status,409);assert.ok(db.prepare('SELECT id FROM users WHERE id=?').get(user.id));
  now+=61000;await post('/api/account/code',{email:user.email});assert.equal((await post('/api/account/verify',{email:user.email,code:mail.at(-1).code})).status,403);
  assert.equal((await post(`/api/admin/clients/${user.id}/restore`,undefined,adminCookie)).status,200);now+=61000;await post('/api/account/code',{email:user.email});response=await post('/api/account/verify',{email:user.email,code:mail.at(-1).code});assert.equal(response.status,200);const newCookie=response.headers.get('set-cookie');assert.equal((await(await call('/api/account/assets',{cookie:newCookie})).json()).items.length,1);assert.equal(billing.state(user.id).balance,0);
  db.prepare("UPDATE billing_orders SET status='failed' WHERE id=?").run(pending.id);assert.equal((await call(`/api/admin/clients/${user.id}`,{method:'DELETE',cookie:adminCookie})).status,200);
  assert.equal((await call('/api/account/assets',{cookie:newCookie})).status,401);for(const table of ['users','account_assets','account_sessions','billing_wallets','billing_orders','billing_ledger','billing_plan_queue','billing_refunds'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0,table);assert.equal((await call(`/api/admin/clients/${user.id}`,{method:'DELETE',cookie:adminCookie})).status,404);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();unlinkSync(join(dir,'account-secret'));rmdirSync(dir)}
});
