import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

test('removed signing routes are unavailable and existing documents expire normally',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'list-sign-')),port=String(22000+Math.floor(Math.random()*10000));
 const db=new DatabaseSync(join(dir,'sign.sqlite'));
 db.exec('CREATE TABLE requests (id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,name TEXT NOT NULL,pdf BLOB NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL)');
 const insert=db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?)');
 insert.run('old','hash','old.pdf',Buffer.from('old'),0,1);
 insert.run('current','hash','current.pdf',Buffer.from('current'),0,Date.now()+3600000);
 db.close();
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:port,DATA_DIR:dir},stdio:'ignore'});
 const root='http://127.0.0.1:'+port;
 try {
  for(let i=0;i<100;i++){try{if((await fetch(root+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,50))}
  assert.equal((await fetch(root+'/api/requests',{method:'POST'})).status,404);
  for(const path of ['/api/requests/current/owner','/api/requests/current/owner/pdf','/api/requests/current/sign','/api/requests/current/sign/pdf'])assert.equal((await fetch(root+path)).status,404);
  const check=new DatabaseSync(join(dir,'sign.sqlite'));
  try{assert.deepEqual(check.prepare('SELECT id FROM requests').all().map(row=>row.id),['current'])}finally{check.close()}
 }finally{child.kill();await new Promise(r=>child.once('exit',r));await rm(dir,{recursive:true,force:true})}
});
