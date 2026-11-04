import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {PDFDocument} from 'pdf-lib';
import {setupBilling} from '../server/billing.js';
import {setupBillingRoutes} from '../server/billingRoutes.js';

test('paid export charges only after successful rendering and protects retries',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');const billing=setupBilling(db);db.prepare('INSERT INTO users VALUES (?,?)').run('user',Date.now());
 billing.adjust('user',{plan:'daily'});let fail=false;const app=express(),accounts={sameOrigin:(_q,_s,n)=>n(),session:req=>req.get('x-test-user')?{id:'user'}:null,requireSession:(req,res,next)=>{if(!req.get('x-test-user'))return res.sendStatus(401);req.user={id:'user'};next()}};
 setupBillingRoutes(app,{billing,accounts,enabled:true,render:async()=>{if(fail)throw Error('render failed');return Buffer.from('%PDF-output')}});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root=`http://127.0.0.1:${server.address().port}`;
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();const request=async(id,items=[],loggedIn=true)=>{const form=new FormData();form.append('document',new Blob([bytes]),'test.pdf');form.append('items',JSON.stringify(items));form.append('filters','{}');form.append('requestId',id);return fetch(root+'/api/billing/export',{method:'POST',headers:loggedIn?{'x-test-user':'1'}:{},body:form})};
 try{const id='12345678-1234-1234-1234-123456789012';assert.equal((await request(id,[],false)).status,401);fail=true;assert.equal((await request(id)).status,400);assert.equal(billing.state('user').plan,'daily');fail=false;assert.equal((await request(id)).status,200);assert.equal(billing.state('user').plan,'daily');assert.equal((await request(id)).status,200);assert.equal((await request(id,[{type:'check'}])).status,400);assert.equal((await request('12345678-1234-1234-1234-123456789013')).status,200)}finally{await new Promise(r=>server.close(r));db.close()}
});

test('paid mode stays unavailable until payment settings are verified',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL)');const billing=setupBilling(db);
 const accounts={sameOrigin:(_q,_s,n)=>n(),session:()=>null,requireSession:(_q,r)=>r.sendStatus(401)};
 let settings={mode:'live',verified:false};const app=express();setupBillingRoutes(app,{billing,accounts,paymentSettings:{get:()=>settings},enabled:true});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/billing/status`;
 try{assert.equal((await(await fetch(url)).json()).enabled,false);settings={mode:'live',verified:true};const status=await(await fetch(url)).json();assert.equal(status.enabled,true);assert.equal(status.testMode,false)}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.close()}
});
