import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resizeCover} from '../src/coverGeometry.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} ≠ ${expected}`);

test('cover corners resize independently and keep the opposite corner fixed',()=>{
 const item={x:.2,y:.3,width:.3,height:.2,angle:0};
 const ne=resizeCover(item,'ne',100,-50,1000,1000);
 close(ne.x,.2);close(ne.y,.25);close(ne.width,.4);close(ne.height,.25);
 const sw=resizeCover(item,'sw',-100,50,1000,1000);
 close(sw.x,.1);close(sw.y,.3);close(sw.width,.4);close(sw.height,.25);
 const bounded=resizeCover(item,'nw',-1000,-1000,1000,1000);
 close(bounded.x,0);close(bounded.y,0);close(bounded.width,.5);close(bounded.height,.5);
});

test('resizing a rotated cover follows its rotated axes',()=>{
 const item={x:.3,y:.3,width:.2,height:.2,angle:90};
 const result=resizeCover(item,'se',0,100,1000,1000);
 close(result.width,.3);close(result.height,.2);
 close(result.x,.25);close(result.y,.35);
});
