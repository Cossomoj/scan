import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findInkBounds,removePaper,removeSignatureRule} from '../src/imageProcessing.js';

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

test('removes a grey rule and tinted paper while preserving blue and black ink',()=>{
 const width=120,height=70,data=new Uint8ClampedArray(width*height*4);
 const pixel=(x,y,r,g,b,a=255)=>data.set([r,g,b,a],(y*width+x)*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixel(x,y,238,232,222);
 for(let x=5;x<115;x++)for(let y=34;y<37;y++)pixel(x,y,145,145,145);
 for(let y=15;y<55;y++)for(let x=50;x<54;x++)pixel(x,y,20,35,100);
 for(let y=12;y<26;y++)for(let x=70;x<73;x++)pixel(x,y,25,25,25);
 pixel(1,1,120,120,120,0);
 removePaper({data,width,height},35);
 const alpha=(x,y)=>data[(y*width+x)*4+3];
 assert.equal(alpha(3,3),0,'tinted paper');
 assert.equal(alpha(25,35),0,'grey line');
 assert.equal(alpha(51,35),255,'blue ink crossing line');
 assert.equal(alpha(71,20),255,'black ink');
 assert.equal(alpha(1,1),0,'existing transparency');
});

test('zero strength preserves pixels and broad grey marks are not treated as rules',()=>{
 const width=80,height=40,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(y>=10&&y<22?[120,120,120,255]:[255,255,255,255],(y*width+x)*4);
 const unchanged=data.slice();removePaper({data,width,height},0);assert.deepEqual(data,unchanged);
 removePaper({data,width,height},35);assert.equal(data[(15*width+25)*4+3],255);
});

test('background removal keeps coloured strokes on a transparent canvas',()=>{
 const width=60,height=30,data=new Uint8ClampedArray(width*height*4);
 for(let x=10;x<50;x++){data.set([179,41,41,255],(10*width+x)*4);data.set([23,74,165,255],(20*width+x)*4)}
 removePaper({data,width,height},35);
 assert.equal(data[(10*width+20)*4+3],255,'red stroke');
 assert.equal(data[(20*width+20)*4+3],255,'blue stroke');
 assert.equal(data[(5*width+5)*4+3],0,'transparent background');
});

test('optional rule removal removes black line and keeps ink crossing it',()=>{
 const width=160,height=80,data=new Uint8ClampedArray(width*height*4);
 const pixel=(x,y,r,g,b,a=255)=>data.set([r,g,b,a],(y*width+x)*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixel(x,y,255,255,255);
 for(let x=4;x<156;x++)for(let y=39;y<=41;y++)pixel(x,y,18,18,18);
 for(let y=24;y<56;y++)for(let x=52;x<=55;x++)pixel(x,y,18,18,18);
 for(let y=25;y<55;y++)for(let x=90;x<=93;x++)pixel(x,y,30,50,130);
 removePaper({data,width,height},35);removeSignatureRule({data,width,height});
 const alpha=(x,y)=>data[(y*width+x)*4+3];
 assert.equal(alpha(20,40),0,'black line removed');
 assert.equal(alpha(53,40),255,'black stroke crossing preserved');
 assert.equal(alpha(91,40),255,'blue stroke crossing preserved');
 assert.equal(alpha(53,30),255,'ink outside line preserved');
});

test('rule removal leaves short marks and broad filled shapes intact',()=>{
 const width=120,height=70,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set([255,255,255,255],(y*width+x)*4);
 for(let y=12;y<20;y++)for(let x=5;x<115;x++)data.set([20,20,20,255],(y*width+x)*4);
 for(let x=15;x<35;x++)data.set([10,10,10,255],(45*width+x)*4);
 const original=data.slice();removeSignatureRule({data,width,height});assert.deepEqual(data,original);
});

test('removes a rule split by handwriting when only a short edge remains',()=>{
 const width=440,height=250,data=new Uint8ClampedArray(width*height*4);
 const pixel=(x,y,rgba)=>data.set(rgba,(y*width+x)*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixel(x,y,[255,255,255,0]);
 for(let x=285;x<width;x++){pixel(x,147,[195,195,195,180]);pixel(x,151,[195,195,195,180])}
 for(let x=285;x<width;x++)for(let y=148;y<151;y++)pixel(x,y,[25,25,25,255]);
 for(let y=125;y<170;y++)for(let x=345;x<359;x++)pixel(x,y,[30,40,120,255]);
 for(let y=115;y<175;y++)for(let x=390;x<404;x++)pixel(x,y,[30,40,120,255]);
 for(let x=70;x<115;x++)pixel(x,70,[20,20,20,255]);
 removeSignatureRule({data,width,height});
 const alpha=(x,y)=>data[(y*width+x)*4+3];
 assert.equal(alpha(425,149),0,'short segment at right edge removed');
 assert.equal(alpha(425,147),0,'antialiased edge removed');
 assert.equal(alpha(370,149),0,'segment between strokes removed');
 assert.equal(alpha(350,149),255,'first coloured stroke preserved');
 assert.equal(alpha(395,149),255,'second coloured stroke preserved');
 assert.equal(alpha(85,70),255,'unrelated short stroke preserved');
});
