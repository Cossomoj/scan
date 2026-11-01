import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';

test('private links enforce signing order and produce a valid signed PDF',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'list-sign-')),port=String(22000+Math.floor(Math.random()*10000));
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:port,DATA_DIR:dir},stdio:'ignore'});
 const root='http://127.0.0.1:'+port;
 try {
   for(let i=0;i<100;i++){try{if((await fetch(root+'/api/health')).ok)break}catch{} await new Promise(r=>setTimeout(r,50));}
   const doc=await PDFDocument.create();doc.addPage([600,800]); const form=new FormData();form.append('file',new Blob([await doc.save()],{type:'application/pdf'}),'test.pdf');form.append('signers',JSON.stringify(['Аня','Борис']));
   let response=await fetch(root+'/api/requests',{method:'POST',body:form});assert.equal(response.status,201);const request=await response.json();
   const base=root+'/api/requests/'+request.id,auth=t=>({Authorization:'Bearer '+t});
   assert.equal((await fetch(base+'/owner',{headers:auth(request.signers[0].token)})).status,404);
   assert.equal((await fetch(base+'/sign/pdf',{headers:auth(request.signers[1].token)})).status,409);
   const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
   const sign=token=>fetch(base+'/sign',{method:'POST',headers:{...auth(token),'Content-Type':'application/json'},body:JSON.stringify({page:0,x:.1,y:.3,width:.3,height:.1,image:png})});
   assert.equal((await sign(request.signers[1].token)).status,409);
   assert.equal((await sign(request.signers[0].token)).status,200);
   assert.equal((await sign(request.signers[0].token)).status,409);
   assert.equal((await fetch(base+'/sign/pdf',{headers:auth(request.signers[0].token)})).status,200);
   assert.equal((await fetch(base+'/sign/pdf',{headers:auth(request.signers[1].token)})).status,200);
   assert.equal((await sign(request.signers[1].token)).status,200);
   response=await fetch(base+'/owner',{headers:auth(request.owner)});const status=await response.json();assert.ok(status.signers.every(s=>s.signed));
   response=await fetch(base+'/owner/pdf',{headers:auth(request.owner)});const signed=await PDFDocument.load(await response.arrayBuffer());assert.equal(signed.getPageCount(),1);
   assert.equal((await fetch(root+'/api/photo-sessions',{method:'POST'})).status,404);
 } finally {child.kill();await new Promise(r=>child.once('exit',r));await rm(dir,{recursive:true,force:true});}
});
