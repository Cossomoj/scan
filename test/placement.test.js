import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imagePlacement} from '../src/placement.js';

test('image rotation keeps its centre on normal and rotated PDF pages',()=>{
 for(const page of [0,90,180,270])for(const angle of [-45,0,30,180]){
  const center=[270,350],width=140,height=55,p=imagePlacement(center,width,height,page,angle),r=p.rotation*Math.PI/180;
  assert.ok(Math.abs(p.x+width/2*Math.cos(r)-height/2*Math.sin(r)-center[0])<1e-8);
  assert.ok(Math.abs(p.y+width/2*Math.sin(r)+height/2*Math.cos(r)-center[1])<1e-8);
  assert.equal(p.rotation,page-angle);
 }
});
