import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordMetrikaView,startMetrika,stopMetrika,analyticsChoice,defaultAnalyticsToDenied} from '../src/metrika.js';

test('SPA views use fixed paths and never include private URL or referrer data', () => {
  const calls = [];
  global.window = {
    location: new URL('https://xn--80ataleboo.xn--p1ai/?utm_source=search&token=secret'),
    ym: (...args) => calls.push(args),
  };
  global.document = {title: 'Конторка', referrer: 'https://example.com/landing?email=private#token'};
  global.localStorage={getItem:()=>JSON.stringify({choice:'allowed'})};
  try {
    recordMetrikaView('home');
    recordMetrikaView('editor');
    recordMetrikaView('policy');
    recordMetrikaView('consent');
    recordMetrikaView('offer');
    recordMetrikaView('details');
    recordMetrikaView('created');
    assert.equal(calls.length, 6);
    assert.deepEqual(calls.map(call => call[2]), [
      'https://xn--80ataleboo.xn--p1ai/?utm_source=search',
      'https://xn--80ataleboo.xn--p1ai/editor',
      'https://xn--80ataleboo.xn--p1ai/policy',
      'https://xn--80ataleboo.xn--p1ai/consent',
      'https://xn--80ataleboo.xn--p1ai/offer',
      'https://xn--80ataleboo.xn--p1ai/details',
    ]);
    assert.equal(calls[0][3].referer, 'https://example.com/');
    assert.equal(calls[1][3].referer, 'https://xn--80ataleboo.xn--p1ai/?utm_source=search');
    assert.ok(!JSON.stringify(calls).includes('secret'));
    assert.ok(!JSON.stringify(calls).includes('private'));
  } finally {
    delete global.window;
    delete global.document;
    delete global.localStorage;
  }
});

test('counter loads only with consent and never for private links or admin', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.ok(!html.includes('mc.yandex.ru'));
  let choice=null;const inserted=[];
  global.localStorage={getItem:()=>choice};global.window={location:new URL('https://xn--80ataleboo.xn--p1ai/')};
  global.document={title:'Конторка',referrer:'',createElement:()=>({dataset:{},remove(){}}),head:{append:node=>inserted.push(node)},querySelectorAll:()=>[]};
  try{
    startMetrika();assert.equal(inserted.length,0);
    choice=JSON.stringify({choice:'allowed'});
    for(const path of ['/admin','/#/sign/id/secret','/#/owner/id/secret']){window.location=new URL('https://xn--80ataleboo.xn--p1ai'+path);startMetrika();assert.equal(inserted.length,0)}
    window.location=new URL('https://xn--80ataleboo.xn--p1ai/');startMetrika();assert.equal(inserted.length,1);assert.match(inserted[0].src,/mc\.yandex\.ru/);assert.equal(window.ym.a[0][1],'init');
    stopMetrika();assert.equal(window.disableYaCounter114023353,true);
  }finally{delete global.window;delete global.document;delete global.localStorage}
});

test('login defaults an unset analytics choice to denied without overriding a prior choice',()=>{
 let value=null;global.window={};global.localStorage={getItem:()=>value,setItem:(_key,next)=>{value=next}};
 try{assert.equal(defaultAnalyticsToDenied(),true);assert.equal(analyticsChoice().choice,'denied');value=JSON.stringify({choice:'allowed',id:'existing'});assert.equal(defaultAnalyticsToDenied(),false);assert.equal(analyticsChoice().choice,'allowed');value=JSON.stringify({choice:'denied'});assert.equal(defaultAnalyticsToDenied(),false);
  global.localStorage={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}};assert.equal(defaultAnalyticsToDenied(),true);assert.equal(analyticsChoice().choice,'denied');
 }finally{delete global.window;delete global.localStorage}
});
