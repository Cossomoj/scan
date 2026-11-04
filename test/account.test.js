import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setupAccounts,validEmail} from '../server/account.js';
import {setupBilling} from '../server/billing.js';

test('email login protects accounts, expires codes, isolates saved items and honours logout',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'list-account-')),db=new DatabaseSync(':memory:'),outbox=[];let time=1700000000000;
 const app=express();app.use(express.json({limit:'4mb'}));setupAccounts(app,db,{dataDir:dir,sendMail:async(to,code)=>outbox.push({to,code}),clock:()=>time,production:true});
 const billing=setupBilling(db,{clock:()=>time});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const root=`http://127.0.0.1:${server.address().port}`;
 const call=(path,{method='GET',body,cookie,origin}={})=>fetch(root+'/api/account/'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:body?JSON.stringify(body):undefined});
 const post=(path,body,cookie)=>call(path,{method:'POST',body:path==='code'?{consent:true,consentVersion:'2026-11-03-account-v1',...body}:body,cookie});
 try{
  for(const email of ['wrong','a..b@example.com','a@-example.com','a@example','a@x..com','a@x.com\r\nBcc: x'])assert.equal(validEmail(email),false,email);
  assert.equal(validEmail('hello+tag@example.com'),true);
  assert.equal((await post('code',{email:'bad'})).status,400);
  assert.equal((await call('code',{method:'POST',body:{email:'alice@example.com'}})).status,400);
  assert.equal(outbox.length,0);
  assert.equal((await call('code',{method:'POST',body:{email:'alice@example.com'},origin:'https://evil.test'})).status,403);
  assert.equal((await post('code',{email:'Alice@example.com'})).status,200);assert.equal(outbox[0].to,'alice@example.com');assert.match(outbox[0].code,/^\d{6}$/);
  const consent=db.prepare('SELECT * FROM consent_records').get();assert.equal(consent.purpose,'account');assert.equal(consent.revision,'2026-11-03-account-v1');assert.ok(!JSON.stringify(consent).includes('alice@example.com'));
  assert.equal((await post('code',{email:'alice@example.com'})).status,429);
  assert.equal((await post('verify',{email:'alice@example.com',code:outbox[0].code==='000000'?'000001':'000000'})).status,400);
  let r=await post('verify',{email:'alice@example.com',code:outbox[0].code});assert.equal(r.status,200);const alice=r.headers.get('set-cookie');assert.match(alice,/HttpOnly/);assert.match(alice,/SameSite=Strict/);assert.match(alice,/Secure/);
  assert.equal(db.prepare('SELECT verified_at FROM consent_records').get().verified_at,time);
  assert.equal((await r.json()).user.created,time);
  const aliceId=db.prepare('SELECT id FROM users WHERE email=?').get('alice@example.com').id;assert.equal('balance' in billing.state(aliceId),false);
  assert.equal((await post('verify',{email:'alice@example.com',code:outbox[0].code})).status,400);
  assert.equal('balance' in billing.state(aliceId),false);
  const item={id:'asset-a',kind:'text',name:'Пример',text:'Пример',color:'#17233b',widthMm:50,heightMm:10};
  assert.equal((await call('assets/asset-a',{method:'PUT',body:item})).status,401);
  assert.equal((await call('assets/asset-a',{method:'PUT',body:item,cookie:alice})).status,200);
  assert.equal((await call('assets/asset-b',{method:'PUT',body:{...item,id:'asset-b',kind:'signature',image:'data:image/png;base64,AAAA'},cookie:alice})).status,400);
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  assert.equal((await call('assets/asset-b',{method:'PUT',body:{id:'asset-b',kind:'signature',name:'Подпись',widthMm:50,heightMm:20,image:png,sourceImage:png},cookie:alice})).status,200);
  assert.equal((await post('code',{email:'bob@example.com'})).status,200);r=await post('verify',{email:'bob@example.com',code:outbox.at(-1).code});const bob=r.headers.get('set-cookie');
  assert.deepEqual((await (await call('assets',{cookie:bob})).json()).items,[]);
  assert.equal((await call('assets/asset-a',{method:'DELETE',cookie:bob})).status,200);assert.equal((await (await call('assets',{cookie:alice})).json()).items.length,2);
  await post('logout',{},alice);assert.equal((await call('assets',{cookie:alice})).status,401);
  time+=61000;assert.equal((await post('code',{email:'alice@example.com'})).status,200);const expired=outbox.at(-1).code;time+=11*60000;assert.equal((await post('verify',{email:'alice@example.com',code:expired})).status,400);
  assert.equal((await post('code',{email:'alice@example.com'})).status,200);const latest=outbox.at(-1).code;for(let i=0;i<5;i++)assert.equal((await post('verify',{email:'alice@example.com',code:latest==='000000'?'000001':'000000'})).status,400);assert.equal((await post('verify',{email:'alice@example.com',code:latest})).status,400);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true})}
});

test('signature and stamp limits follow the plan without deleting existing assets',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'account-limits-')),db=new DatabaseSync(':memory:'),outbox=[];let time=1700000000000;
 const app=express();app.use(express.json({limit:'4mb'}));const accounts=setupAccounts(app,db,{dataDir:dir,sendMail:async(to,code)=>outbox.push({to,code}),clock:()=>time});const billing=setupBilling(db,{clock:()=>time});accounts.setBilling(billing);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const root=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body)=>fetch(root+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  await post('/api/account/code',{email:'limits@example.com',consent:true,consentVersion:'2026-11-03-account-v1'});const login=await post('/api/account/verify',{email:'limits@example.com',code:outbox[0].code});const cookie=login.headers.get('set-cookie');const id=db.prepare("SELECT id FROM users WHERE email='limits@example.com'").get().id;
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const item=(i,kind='signature')=>({id:'image-'+i,kind,name:'Образец',widthMm:50,heightMm:20,image:png,sourceImage:png});
  const save=x=>fetch(root+'/api/account/assets/'+x.id,{method:'PUT',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify(x)});
  assert.equal(billing.state(id).signatureLimit,1);assert.equal((await save(item(1))).status,200);assert.equal((await save(item(2,'stamp'))).status,409);assert.equal((await save({...item(1),name:'Изменённая'})).status,200);
  assert.equal((await save({id:'text-1',kind:'text',name:'Текст',text:'Текст',color:'#17233b',widthMm:50,heightMm:10})).status,200);
  billing.adjust(id,{plan:'monthly'});assert.equal(billing.state(id).signatureLimit,20);for(let i=2;i<=20;i++)assert.equal((await save(item(i,i%2?'signature':'stamp'))).status,200);
  assert.equal((await save(item(21))).status,409);billing.adjust(id,{plan:'yearly'});assert.equal(billing.state(id).signatureLimit,100);for(let i=21;i<=100;i++)assert.equal((await save(item(i))).status,200);assert.equal((await save(item(101))).status,409);
  billing.adjust(id,{plan:null});assert.equal(billing.state(id).signatureLimit,1);assert.equal((await save({...item(21),name:'Исправлено'})).status,200);assert.equal((await save(item(101))).status,409);
  const items=(await(await fetch(root+'/api/account/assets',{headers:{cookie}})).json()).items;assert.equal(items.length,101);assert.ok(items.some(x=>x.id==='image-21'&&x.name==='Исправлено'));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true})}
});
