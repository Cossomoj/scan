import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {createHash,scryptSync} from 'node:crypto';
import {setupAdmin} from '../server/admin.js';

test('admin email verification is single-use, expires and is not affected by another IP',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,created INTEGER,last_seen INTEGER);');
 let now=Date.now(),messages=[];const salt=Buffer.alloc(16,4),credential=salt.toString('hex')+':'+scryptSync('secret',salt,32).toString('hex');
 const app=express();app.set('trust proxy',true);app.use(express.json());setupAdmin(app,db,{credential,clock:()=>now,production:true,sendAdminMail:async m=>messages.push(m)});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,ip='198.51.100.1')=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body:JSON.stringify(body)});
 const login=(password,ip)=>post('/api/admin/login',{login:'Max',password},ip),verify=token=>post('/api/admin/verify',{token});
 try{
  const legacy='a'.repeat(43);db.prepare('INSERT INTO admin_sessions VALUES (?,?)').run(createHash('sha256').update(legacy).digest('hex'),now+3600000);
  const legacySession=await fetch(base+'/api/admin/session',{headers:{cookie:'zapdf_admin='+legacy}});assert.equal(legacySession.status,401);
  for(let i=0;i<5;i++)assert.equal((await login('wrong','198.51.100.1')).status,401);
  assert.equal((await login('secret','198.51.100.1')).status,429);
  let response=await login('secret','198.51.100.2');assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.equal(messages[0].to,'maksim@kuchermg.ru');
  let token=/https:\/\/xn--80ataleboo\.xn--p1ai\/admin#verify=([\w-]{43})/.exec(messages[0].text)?.[1];assert.ok(token);
  const stored=db.prepare('SELECT token_hash FROM admin_email_tokens').get().token_hash;assert.notEqual(stored,token);assert.match(stored,/^[a-f0-9]{64}$/);
  const crossOrigin=await fetch(base+'/api/admin/verify',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.test'},body:JSON.stringify({token})});assert.equal(crossOrigin.status,403);
  response=await verify(token);assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800; Secure/);
  assert.equal((await verify(token)).status,400);
  await login('secret','198.51.100.2');token=/#verify=([\w-]{43})/.exec(messages[1].text)[1];now+=600001;assert.equal((await verify(token)).status,400);
  assert.equal((await login('secret','198.51.100.1')).status,429);now+=301000;assert.equal((await login('secret','198.51.100.1')).status,200);
 }finally{await new Promise(r=>server.close(r));db.close()}
});

test('admin session is not created if email sending fails',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,created INTEGER,last_seen INTEGER);');
 const salt=Buffer.alloc(16,5),credential=salt.toString('hex')+':'+scryptSync('secret',salt,32).toString('hex');const app=express();app.use(express.json());setupAdmin(app,db,{credential,sendAdminMail:async()=>{throw Error('smtp error')}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/admin/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'Max',password:'secret'})});assert.equal(r.status,503);assert.equal(r.headers.get('set-cookie'),null);assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_email_tokens').get().n,0)}finally{await new Promise(r=>server.close(r));db.close()}
});
