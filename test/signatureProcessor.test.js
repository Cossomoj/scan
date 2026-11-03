import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createCanvas} from '@napi-rs/canvas';
import {setupSignatureProcessor} from '../server/signatureProcessor.js';

test('signature processing validates images and forwards only PNG data to the private service', async t=>{
 const canvas=createCanvas(80,40),ctx=canvas.getContext('2d');
 ctx.fillStyle='white';ctx.fillRect(0,0,80,40);ctx.fillStyle='blue';ctx.fillRect(10,10,30,4);
 const png=canvas.toBuffer('image/png'),requests=[];
 const app=express();
 const sameOrigin=(req,res,next)=>req.get('origin')==='https://bad.example'?res.sendStatus(403):next();
 setupSignatureProcessor(app,{sameOrigin,url:'http://private-service:8000',fetcher:async(url,options)=>{
  requests.push({url,body:Buffer.from(options.body)});
  return new Response(png,{headers:{'content-type':'image/png'}});
 }});
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const send=(body,headers={})=>fetch(`http://127.0.0.1:${server.address().port}/api/signature/enhance`,{method:'POST',headers:{'Content-Type':'image/png',...headers},body});
 assert.equal((await send(png,{Origin:'https://bad.example'})).status,403);
 assert.equal((await send(Buffer.from('not a PNG'))).status,400);
 const tooWide=Buffer.from(png);tooWide.writeUInt32BE(901,16);
 assert.equal((await send(tooWide)).status,400);
 assert.equal(requests.length,0);
 const response=await send(png);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
 assert.equal(requests[0].url,'http://private-service:8000/extract');
 assert.deepEqual(requests[0].body,png);
});

test('signature processing reports a service failure without returning its details',async t=>{
 const app=express();
 setupSignatureProcessor(app,{sameOrigin:(_req,_res,next)=>next(),url:'http://private',fetcher:async()=>{throw Error('private detail')}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const png=createCanvas(10,10).toBuffer('image/png');
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/signature/enhance`,{method:'POST',headers:{'Content-Type':'image/png'},body:png});
 assert.equal(response.status,503);
 assert.doesNotMatch(await response.text(),/private detail/);
});
