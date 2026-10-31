import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';

test('office conversion accepts supported content and returns only a valid PDF',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();const result=Buffer.from(await pdf.save());let received;
 const mock=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);received={url:req.url,body:Buffer.concat(chunks)};res.writeHead(200,{'content-type':'application/pdf','content-length':result.length});res.end(result)});
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const dir=await mkdtemp(join(tmpdir(),'zapdf-convert-')),port=String(32000+Math.floor(Math.random()*10000));
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:port,DATA_DIR:dir,CONVERTER_URL:`http://127.0.0.1:${mock.address().port}`},stdio:'ignore'});
 const root=`http://127.0.0.1:${port}`;
 try{
  for(let i=0;i<100;i++){try{if((await fetch(root+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,50))}
  const source=Buffer.from([0x50,0x4b,3,4,1,2,3]);const form=new FormData();form.append('file',new Blob([source]),'sample.docx');
  let response=await fetch(root+'/api/convert',{method:'POST',body:form});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal((await PDFDocument.load(await response.arrayBuffer())).getPageCount(),1);
  assert.equal(received.url,'/convert?type=docx');assert.deepEqual(received.body,source);
  const bad=new FormData();bad.append('file',new Blob(['not an office file']),'sample.docx');response=await fetch(root+'/api/convert',{method:'POST',body:bad});assert.equal(response.status,400);
  const wrong=new FormData();wrong.append('file',new Blob([source]),'sample.pdf');response=await fetch(root+'/api/convert',{method:'POST',body:wrong});assert.equal(response.status,400);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));await new Promise(r=>mock.close(r));await rm(dir,{recursive:true,force:true})}
});
