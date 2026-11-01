import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cropBoxFromViewport,scanFilter} from '../src/editorTransforms.js';

test('scan presets are distinct and strength changes their effect',()=>{
 assert.equal(scanFilter('none'),'none');
 assert.match(scanFilter('gray'),/grayscale/);
 assert.notEqual(scanFilter('mono','weak'),scanFilter('mono','strong'));
 assert.notEqual(scanFilter('color'),scanFilter('copy'));
});

test('cropping maps the selected visible coordinates onto normal and rotated PDF pages',()=>{
 const region={x:.25,y:.25,w:.5,h:.5},normal={width:600,height:800,convertToPdfPoint:(x,y)=>[x,800-y]},rotated={width:800,height:600,convertToPdfPoint:(x,y)=>[y,x]};
 for(const view of [normal,rotated])assert.deepEqual(cropBoxFromViewport(view,region),{x:150,y:200,width:300,height:400});
});
