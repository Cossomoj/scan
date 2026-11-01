import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resizeSignatureCrop} from '../src/signatureCrop.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} ≠ ${expected}`);
test('signature crop corners resize without moving the opposite corner',()=>{
 const crop={x:.2,y:.3,w:.4,h:.2};
 const ne=resizeSignatureCrop(crop,'ne',.1,-.1,false,1000,500);
 close(ne.x,.2);close(ne.y,.2);close(ne.w,.5);close(ne.h,.3);
 const sw=resizeSignatureCrop(crop,'sw',-.1,.1,false,1000,500);
 close(sw.x,.1);close(sw.y,.3);close(sw.w,.5);close(sw.h,.3);
 const bounded=resizeSignatureCrop(crop,'nw',-2,-2,false,1000,500);
 close(bounded.x,0);close(bounded.y,0);close(bounded.w,.6);close(bounded.h,.5);
});
test('stamp crop stays square in image pixels and within its edges',()=>{
 const crop={x:.2,y:.3,w:.2,h:.4};
 for(const corner of ['nw','ne','sw','se']){
  const resized=resizeSignatureCrop(crop,corner,.08,.1,true,1000,500);
  close(resized.w*1000,resized.h*500);
  assert.ok(resized.x>=0&&resized.y>=0&&resized.x+resized.w<=1.00000001&&resized.y+resized.h<=1.00000001);
 }
});
