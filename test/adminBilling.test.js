import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scryptSync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {setupAdmin} from '../server/admin.js';
import {setupBilling} from '../server/billing.js';
import {setupPaymentSettings} from '../server/paymentSettings.js';

test('admin billing and payment settings require admin session and never return the secret',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'billing-admin-test-')),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,created INTEGER,last_seen INTEGER);CREATE TABLE account_assets(user_id TEXT,id TEXT,data TEXT,updated INTEGER)');const billing=setupBilling(db);db.prepare('INSERT INTO users VALUES (?,?,?,?)').run('u','user@example.test',Date.now(),null);
 const salt=Buffer.alloc(16,3),credential=salt.toString('hex')+':'+scryptSync('test-password',salt,32).toString('hex'),app=express();app.use(express.json());setupAdmin(app,db,{billing,paymentSettings:setupPaymentSettings(db,dir),credential,verifyPaymentSettings:async s=>{if(s.secret!=='live_working-secret')throw Error('ЮKassa не приняла запрос.')}});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root=`http://127.0.0.1:${server.address().port}`;
 const send=(path,body,cookie,method='POST')=>fetch(root+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
 try{assert.equal((await send('/api/admin/clients/u/billing',{plan:'monthly'})).status,401);const login=await send('/api/admin/login',{login:'Max',password:'test-password'});const cookie=login.headers.get('set-cookie');assert.equal(login.status,200);assert.equal((await send('/api/admin/clients/u/billing',{balance:5000},cookie)).status,400);const changed=await send('/api/admin/clients/u/billing',{plan:'monthly'},cookie);assert.equal(changed.status,200);assert.equal((await changed.json()).remaining,20);assert.equal('balance' in billing.state('u'),false);assert.equal((await send('/api/admin/payment-settings',{shopId:'123456',mode:'test',secret:'test_secret-for-test'},cookie,'PUT')).status,200);const settings=await(await fetch(root+'/api/admin/payment-settings',{headers:{cookie}})).json();assert.deepEqual(settings,{shopId:'123456',mode:'test',configured:true,verified:true});assert.ok(!JSON.stringify(settings).includes('secret-for-test'));assert.equal((await send('/api/admin/payment-settings',{shopId:'1516684',mode:'live',secret:'live_incorrect'},cookie,'PUT')).status,400);assert.deepEqual(await(await fetch(root+'/api/admin/payment-settings',{headers:{cookie}})).json(),settings);assert.equal((await send('/api/admin/payment-settings',{shopId:'1516684',mode:'live',secret:'live_working-secret'},cookie,'PUT')).status,200);assert.equal((await send('/api/admin/clients/no-such-user/billing',{plan:'daily'},cookie)).status,404)}finally{await new Promise(r=>server.close(r));db.close();unlinkSync(join(dir,'payment-settings-key'));rmdirSync(dir)}
});
