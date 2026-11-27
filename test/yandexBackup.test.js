import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {setupYandexBackup,applyPendingBackupRestore,backupDue} from '../server/yandexBackup.js';

test('daily backup uses 03:00 Moscow time and does not duplicate successful days',()=>{
 const before=Date.UTC(2026,10,27,23,59),after=Date.UTC(2026,10,28,0,0),yesterday=Date.UTC(2026,10,27,1,0);
 assert.equal(backupDue(before,yesterday),false);assert.equal(backupDue(after,yesterday),true);assert.equal(backupDue(after,after),false);assert.equal(backupDue(after,0),true);
});

test('connecting an account starts the first automatic backup without any real network',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'kontorka-yadisk-schedule-'));const db=new DatabaseSync(join(dir,'sign.sqlite'));db.exec('CREATE TABLE users(id TEXT);CREATE TABLE account_assets(id TEXT);CREATE TABLE billing_orders(id TEXT);CREATE TABLE billing_wallets(id TEXT);CREATE TABLE yookassa_settings(id TEXT)');writeFileSync(join(dir,'account-secret'),Buffer.alloc(32,1));writeFileSync(join(dir,'payment-settings-key'),Buffer.alloc(32,2));let uploads=0;
 const fetcher=async(input,options={})=>{const url=new URL(input);if(url.hostname==='cloud-api.yandex.net')return Response.json(url.pathname.endsWith('/resources/upload')?{href:'https://uploader.disk.yandex.net/upload'}:{type:'dir',resource_id:'shared-id'});if(url.hostname==='uploader.disk.yandex.net'){assert.equal(options.method,'PUT');uploads++;return new Response(null,{status:201})}throw Error('Unexpected test request')};
 const app=express();app.use(express.json());const service=setupYandexBackup(app,{db,dataDir:dir,fetcher,auth:(_req,_res,next)=>next()});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root=`http://127.0.0.1:${server.address().port}/api/admin/backups`;
 try{const response=await fetch(root+'/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({folder:'disk:/kontorka',token:'test-token-12345'})});assert.equal(response.status,200);for(let i=0;i<40&&!uploads;i++)await new Promise(r=>setTimeout(r,25));assert.equal(uploads,1);const status=await(await fetch(root+'/settings')).json();assert.ok(status.lastSuccess)}finally{service.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true})}
});

test('encrypted backups restore isolated SQLite data, preserve a safety copy and revoke sessions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'kontorka-yadisk-test-'));const path=join(dir,'sign.sqlite');let db=new DatabaseSync(path);db.exec("PRAGMA journal_mode=WAL; CREATE TABLE users(id TEXT);INSERT INTO users VALUES('before');CREATE TABLE account_assets(id TEXT);CREATE TABLE billing_orders(id TEXT);CREATE TABLE billing_wallets(id TEXT);CREATE TABLE yookassa_settings(id TEXT);CREATE TABLE admin_sessions_v2(id TEXT);INSERT INTO admin_sessions_v2 VALUES('old-session');CREATE TABLE account_sessions(id TEXT);INSERT INTO account_sessions VALUES('old-user-session')");
 writeFileSync(join(dir,'account-secret'),Buffer.alloc(32,1));writeFileSync(join(dir,'payment-settings-key'),Buffer.alloc(32,2));
 const files=new Map();let mismatch=false,authSeen=false,restarts=0;const fetcher=async(input,options={})=>{const url=new URL(input);if(url.hostname==='cloud-api.yandex.net'){
  assert.equal(options.headers.Authorization,'OAuth test-token-12345');authSeen=true;
  if(url.pathname.endsWith('/public/resources'))return Response.json({type:'dir',resource_id:'shared-id'});
  if(url.pathname.endsWith('/resources/upload'))return Response.json({href:'https://uploader.disk.yandex.net/upload?name='+encodeURIComponent(url.searchParams.get('path').split('/').at(-1))});
  if(url.pathname.endsWith('/resources/download'))return Response.json({href:'https://downloader.disk.yandex.ru/download?name='+encodeURIComponent(url.searchParams.get('path').split('/').at(-1))});
  if(url.pathname.endsWith('/resources')&&url.searchParams.has('limit'))return Response.json({_embedded:{items:[...files].map(([name,data])=>({name,type:'file',modified:'2026-11-28T00:00:00Z',size:data.length})),total:files.size}});
  if(url.pathname.endsWith('/resources'))return Response.json({type:'dir',resource_id:mismatch?'wrong-id':'shared-id'});
 }
 if(url.hostname==='uploader.disk.yandex.net'){files.set(url.searchParams.get('name'),Buffer.from(options.body));return new Response(null,{status:201})}
 if(url.hostname==='downloader.disk.yandex.ru')return new Response(files.get(url.searchParams.get('name')),{status:200});
 throw Error('Unexpected test request');};
 const app=express();app.use(express.json());const service=setupYandexBackup(app,{db,dataDir:dir,fetcher,schedule:false,auth:(req,res,next)=>req.get('x-admin')==='yes'?next():res.sendStatus(401),restart:()=>{restarts++}});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/admin/backups`;
 const request=(suffix,method='GET',body,admin=true)=>fetch(base+suffix,{method,headers:{...(admin?{'x-admin':'yes'}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await request('/settings','GET',null,false)).status,401);
  assert.equal((await request('/recovery-key','GET',null,false)).status,401);
  assert.equal((await request('','POST',{},false)).status,401);
  assert.equal((await request('/restore','POST',{name:'../../sign.sqlite',confirm:'ВОССТАНОВИТЬ'})).status,400);
  const recoveryKey=Buffer.alloc(32,3).toString('base64');assert.equal((await request('/recovery-key','PUT',{key:recoveryKey})).status,200);assert.equal((await(await request('/recovery-key')).json()).key,recoveryKey);
  mismatch=true;assert.equal((await request('/settings','PUT',{folder:'disk:/wrong',token:'test-token-12345'})).status,400);mismatch=false;
  assert.equal((await request('/settings','PUT',{folder:'disk:/../other',token:'test-token-12345'})).status,400);
  assert.equal((await request('/settings','PUT',{folder:'disk:/kontorka',token:'test-token-12345'})).status,200);assert.ok(authSeen);
  assert.equal((await request('/recovery-key','PUT',{key:Buffer.alloc(32,9).toString('base64')})).status,400);
  const config=readFileSync(join(dir,'yandex-backup-config'));assert.equal(config.includes(Buffer.from('test-token-12345')),false);
  const made=await request('','POST',{});assert.equal(made.status,200);const {name}=await made.json();const ciphertext=files.get(name);assert.ok(ciphertext);assert.equal(ciphertext.includes(Buffer.from('before')),false);assert.equal(ciphertext.includes(Buffer.from('SQLite format 3')),false);
  const list=await(await request('')).json();assert.equal(list.items[0].name,name);
  db.exec("INSERT INTO users VALUES('after')");assert.equal((await request('/restore','POST',{name,confirm:'no'})).status,400);
  const bad=Buffer.from(ciphertext);bad[bad.length-1]^=1;files.set(name,bad);assert.equal((await request('/restore','POST',{name,confirm:'ВОССТАНОВИТЬ'})).status,400);assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,2);assert.equal(existsSync(join(dir,'yandex-restore.pending')),false);
  files.set(name,ciphertext);assert.equal((await request('/restore','POST',{name,confirm:'ВОССТАНОВИТЬ'})).status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,2);assert.ok(existsSync(join(dir,'yandex-restore.pending')));
  await new Promise(r=>setTimeout(r,350));assert.equal(restarts,1);db.close();db=null;
  const crash=spawnSync(process.execPath,['-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec(\"PRAGMA journal_mode=WAL; INSERT INTO users VALUES('before-restart')\");process.exit(0)",path]);assert.equal(crash.status,0);
  writeFileSync(join(dir,'account-secret'),Buffer.alloc(32,7));writeFileSync(join(dir,'payment-settings-key'),Buffer.alloc(32,8));await applyPendingBackupRestore(dir);db=new DatabaseSync(path);assert.deepEqual(db.prepare('SELECT id FROM users').all().map(x=>x.id),['before']);assert.deepEqual(readFileSync(join(dir,'account-secret')),Buffer.alloc(32,1));assert.deepEqual(readFileSync(join(dir,'payment-settings-key')),Buffer.alloc(32,2));assert.equal(db.prepare('SELECT COUNT(*) n FROM account_sessions').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_sessions_v2').get().n,0);assert.equal(existsSync(join(dir,'yandex-restore.pending')),false);
  const safetyDir=readdirSync(dir).find(x=>x.startsWith('yandex-before-restore-'));assert.deepEqual(readFileSync(join(dir,safetyDir,'account-secret')),Buffer.alloc(32,7));assert.deepEqual(readFileSync(join(dir,safetyDir,'payment-settings-key')),Buffer.alloc(32,8));const safety=new DatabaseSync(join(dir,safetyDir,'sign.sqlite'),{readOnly:true});try{assert.equal(safety.prepare('SELECT COUNT(*) n FROM users').get().n,3)}finally{safety.close()}
 }finally{service.close();server.closeAllConnections();await new Promise(r=>server.close(r));db?.close();rmSync(dir,{recursive:true,force:true})}
});
