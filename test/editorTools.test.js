import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cropBoxFromViewport,scanFilter,validQuad,warpImageData} from '../src/editorTransforms.js';

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

test('perspective correction preserves corner pixels and rejects crossed points',()=>{
 const w=20,h=20,data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;data[i]=x*10;data[i+1]=y*10;data[i+3]=255}
 const square=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],out=warpImageData({width:w,height:h,data},square);
 assert.equal(out.width,20);assert.equal(out.height,20);assert.deepEqual([...out.data.slice(0,4)],[0,0,0,255]);assert.deepEqual([...out.data.slice(-4)],[190,190,0,255]);
 const trapezoid=[{x:.15,y:0},{x:.85,y:0},{x:1,y:1},{x:0,y:1}];assert.equal(validQuad(trapezoid),true);const adjusted=warpImageData({width:w,height:h,data},trapezoid);assert.ok(adjusted.width>10&&adjusted.height>10);
 assert.equal(validQuad([square[0],square[2],square[1],square[3]]),false);assert.throws(()=>warpImageData({width:w,height:h,data},[square[0],square[2],square[1],square[3]]));
});
