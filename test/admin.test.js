import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {scryptSync} from 'node:crypto';
import {setupAdmin} from '../server/admin.js';

test('admin authentication protects client data, counts events and expires sessions',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,created INTEGER,last_seen INTEGER);CREATE TABLE account_assets(user_id TEXT,id TEXT,data TEXT,updated INTEGER);`);
 let now=Date.UTC(2026,10,1,12),salt=Buffer.alloc(16,3),credential=salt.toString('hex')+':'+scryptSync('test-password',salt,32).toString('hex');
 db.prepare('INSERT INTO users VALUES (?,?,?,?)').run('1','reader@example.test',now,now);db.prepare('INSERT INTO account_assets VALUES (?,?,?,?)').run('1','a',JSON.stringify({kind:'text'}),now);db.prepare('INSERT INTO account_assets VALUES (?,?,?,?)').run('1','b',JSON.stringify({kind:'signature'}),now);
 let adminMail;const app=express();app.use(express.json());setupAdmin(app,db,{credential,clock:()=>now,production:true,sendAdminMail:async message=>{adminMail=message}});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root=`http://127.0.0.1:${server.address().port}`;
 const call=(path,options={})=>fetch(root+path,options),login=(password)=>call('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'Max',password})});
 try{
  assert.equal((await call('/api/admin/clients')).status,401);assert.equal((await login('wrong')).status,401);
  let response=await login('test-password');assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.equal((await response.json()).verificationRequired,true);assert.equal(adminMail.to,'maksim@kuchermg.ru');const token=/#verify=([A-Za-z0-9_-]+)/.exec(adminMail.text)?.[1];assert.ok(token);response=await call('/api/admin/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
  assert.equal((await call('/api/admin/stats',{headers:{cookie,origin:'https://evil.test'}})).status,403);
  assert.equal((await call('/api/metrics/download',{method:'POST'})).status,204);
  const stats=await(await call('/api/admin/stats',{headers:{cookie}})).json();assert.equal(stats.users.today,1);assert.equal(stats.downloads.total,1);
  const clients=await(await call('/api/admin/clients?q=reader',{headers:{cookie}})).json();assert.equal(clients.total,1);assert.equal(clients.users[0].texts,1);assert.equal(clients.users[0].signatures,1);
  now+=8*3600000+1;assert.equal((await call('/api/admin/clients',{headers:{cookie}})).status,401);
 }finally{await new Promise(r=>server.close(r));db.close()}
});
