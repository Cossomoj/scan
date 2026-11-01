import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resizeSignatureCrop} from '../src/signatureCrop.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} ≠ ${expected}`);
test('signature crop corners resize without moving the opposite corner',()=>{
 const crop={x:.2,y:.3,w:.4,h:.2};
 const ne=resizeSignatureCrop(crop,'ne',.1,-.1);
 close(ne.x,.2);close(ne.y,.2);close(ne.w,.5);close(ne.h,.3);
 const sw=resizeSignatureCrop(crop,'sw',-.1,.1);
 close(sw.x,.1);close(sw.y,.3);close(sw.w,.5);close(sw.h,.3);
 const bounded=resizeSignatureCrop(crop,'nw',-2,-2);
 close(bounded.x,0);close(bounded.y,0);close(bounded.w,.6);close(bounded.h,.5);
});
test('selection can expand sideways even when it touches the image edge',()=>{
 const crop={x:.2,y:0,w:.5,h:1};
 const resized=resizeSignatureCrop(crop,'se',.15,.2);
 close(resized.x,.2);close(resized.y,0);close(resized.w,.65);close(resized.h,1);
 const left=resizeSignatureCrop(crop,'sw',-.1,.2);
 close(left.x,.1);close(left.w,.6);close(left.h,1);
});
