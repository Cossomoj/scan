import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findInkBounds,removePaper} from '../src/imageProcessing.js';

test('detects ink and constrains stamp crop to a square in pixels',()=>{
 const width=100,height=60,data=new Uint8ClampedArray(width*height*4).fill(255);
 for(let y=20;y<30;y++)for(let x=35;x<65;x++){const i=(y*width+x)*4;data[i]=10;data[i+1]=20;data[i+2]=50}
 const crop=findInkBounds({data,width,height});
 assert.ok(crop.x<.35&&crop.x+crop.w>.64&&crop.y<20/60&&crop.y+crop.h>29/60);
 const stamp=findInkBounds({data,width,height},true);
 assert.equal(stamp.w*width,stamp.h*height);
});

test('background removal leaves dark ink visible and makes white transparent',()=>{
 const data=new Uint8ClampedArray([255,255,255,255, 20,30,50,255]);
 removePaper({data},35);
 assert.equal(data[3],0);assert.equal(data[7],255);
});
