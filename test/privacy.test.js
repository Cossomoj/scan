import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {setupPrivacy} from '../server/privacy.js';

test('analytics consent is recorded and revocable without identifying data',async t=>{
 const db=new DatabaseSync(':memory:'),app=express();let time=1000;app.use(express.json());setupPrivacy(app,db,{clock:()=>time});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.close()});const root=`http://127.0.0.1:${server.address().port}`;
 const send=(body,origin=root)=>fetch(root+'/api/privacy/analytics-consent',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
 const id=randomUUID(),record={id,revision:'2026-11-03-analytics-v1',action:'grant'};
 assert.equal((await send(record,'https://unrelated.example')).status,403);assert.equal((await send({...record,revision:'obsolete'})).status,400);assert.equal((await send(record)).status,200);assert.equal((await send(record)).status,200);
 time=3000;assert.equal((await send({...record,action:'revoke'})).status,200);const row=db.prepare('SELECT * FROM analytics_consents').get();assert.deepEqual({...row},{id,revision:record.revision,granted_at:1000,revoked_at:3000});assert.equal((await send(record)).status,409);
});
