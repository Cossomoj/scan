import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {securityHeaders} from '../server/securityHeaders.js';

test('security headers protect HTTPS pages without blocking editor assets or Metrica',async t=>{
 const app=express();app.use(securityHeaders({production:true}));app.get('/admin',(_req,res)=>res.send('ok'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/admin`);
 const csp=response.headers.get('content-security-policy');
 const directives=Object.fromEntries(csp.split(';').map(x=>x.trim().split(/\s+/)).map(([k,...v])=>[k,v]));
 assert.equal(response.headers.get('strict-transport-security'),'max-age=31536000');
 assert.deepEqual(directives['frame-ancestors'],["'none'"]);
 assert.deepEqual(directives['object-src'],["'none'"]);
 assert.ok(directives['script-src'].includes("'self'"));
 assert.ok(directives['script-src'].includes('https://mc.yandex.ru'));
 assert.ok(!directives['script-src'].includes("'unsafe-inline'"));
 assert.ok(!directives['script-src'].includes("'unsafe-eval'"));
 assert.ok(directives['script-src'].includes("'wasm-unsafe-eval'"));
 assert.ok(directives['style-src'].includes("'unsafe-inline'"));
 assert.ok(directives['img-src'].includes('data:') && directives['img-src'].includes('blob:'));
 assert.ok(directives['worker-src'].includes('blob:'));
 assert.ok(directives['connect-src'].includes('https://mc.yandex.ru'));
 assert.ok(directives['connect-src'].includes('wss://mc.webvisor.com'));
 assert.equal(response.headers.get('x-frame-options'),'DENY');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
});

test('HSTS is not sent by the development server',async t=>{
 const app=express();app.use(securityHeaders({production:false}));app.get('/',(_req,res)=>res.send('ok'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/`);
 assert.equal(response.headers.get('strict-transport-security'),null);
 assert.ok(response.headers.get('content-security-policy'));
});
