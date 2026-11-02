import {createCanvas} from '@napi-rs/canvas';
import {PDFDocument,degrees} from 'pdf-lib';
import {imagePlacement} from '../src/placement.js';
import {scanFilter} from '../src/editorTransforms.js';

// The legacy build supports Node's canvas implementation and rotated/cropped PDF viewports.
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');

function elementPng(item,aspect){
 if(item.type==='image'){
  if(typeof item.image!=='string'||item.image.length>2_000_000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(item.image))throw Error('Некорректное изображение подписи.');
  return Buffer.from(item.image.slice(22),'base64');
 }
 const canvas=createCanvas(1200,Math.max(1,Math.min(5000,Math.round(1200/aspect)))),ctx=canvas.getContext('2d');
 if(item.type==='cover'){ctx.fillStyle=item.color||'#182028';ctx.fillRect(0,0,canvas.width,canvas.height)}
 else if(item.type==='check'){ctx.fillStyle='#168b54';ctx.font='bold '+Math.round(canvas.height*.85)+'px Arial';ctx.textBaseline='middle';ctx.fillText('✓',20,canvas.height/2)}
 else if(item.type==='text'){const value=(item.text||'').trim();if(!value)return null;ctx.fillStyle=item.color||'#1e293b';const size=Math.max(1,Math.round(canvas.height*.62*(item.fontScale??1)));ctx.font=`${item.italic?'italic ':''}${item.bold?'bold ':''}${size}px ${item.fontFamily||'Arial'}, sans-serif`;ctx.textBaseline='middle';ctx.fillText(value,8,canvas.height/2,canvas.width-16)}
 else throw Error('Неизвестный элемент документа.');
 return canvas.toBuffer('image/png');
}

export async function exportServerDocument(original,items,filters={}){
 if(!Array.isArray(items)||items.length>1000||!filters||typeof filters!=='object'||Array.isArray(filters))throw Error('Некорректные параметры документа.');
 const pdf=await PDFDocument.load(original),count=pdf.getPageCount();if(count<1||count>100)throw Error('Поддерживается до 100 страниц.');
 const viewer=await pdfjs.getDocument({data:new Uint8Array(original),isEvalSupported:false,useSystemFonts:true}).promise;
 try{
  for(const item of items){
   if(!item||!Number.isInteger(item.page)||item.page<0||item.page>=count||![item.x,item.y,item.width,item.height].every(Number.isFinite)||item.width<=0||item.height<=0||item.width>2||item.height>2||Math.abs(item.x)>2||Math.abs(item.y)>2||!Number.isFinite(item.angle||0)||Math.abs(item.angle||0)>360||typeof(item.text||'')!=='string'||(item.text||'').length>200||!Number.isFinite(item.fontScale??1)||(item.fontScale??1)<.001||(item.fontScale??1)>10)throw Error('Некорректный элемент документа.');
   const view=(await viewer.getPage(item.page+1)).getViewport({scale:1});const x=item.x*view.width,y=item.y*view.height,w=item.width*view.width,h=item.height*view.height;
   const origin=view.convertToPdfPoint(x,y+h),right=view.convertToPdfPoint(x+w,y+h),top=view.convertToPdfPoint(x,y),physicalWidth=Math.hypot(right[0]-origin[0],right[1]-origin[1]),physicalHeight=Math.hypot(top[0]-origin[0],top[1]-origin[1]);
   const png=elementPng(item,physicalWidth/physicalHeight);if(!png)continue;
   const position=imagePlacement(view.convertToPdfPoint(x+w/2,y+h/2),physicalWidth,physicalHeight,view.rotation,item.angle||0);
   pdf.getPages()[item.page].drawImage(await pdf.embedPng(png),{x:position.x,y:position.y,width:physicalWidth,height:physicalHeight,rotate:degrees(position.rotation)});
  }
  const result=await pdf.save(),coverPages=new Set(items.filter(x=>x.type==='cover').map(x=>x.page));
  if(!coverPages.size&&!Object.values(filters).some(f=>f?.name&&f.name!=='none'))return result;
  const combined=await PDFDocument.load(result),out=await PDFDocument.create(),render=await pdfjs.getDocument({data:new Uint8Array(result),isEvalSupported:false,useSystemFonts:true}).promise;
  try{for(let i=0;i<count;i++){const filter=filters[i];if(!coverPages.has(i)&&(!filter||filter.name==='none')){const [p]=await out.copyPages(combined,[i]);out.addPage(p);continue}
   const page=await render.getPage(i+1),base=page.getViewport({scale:1}),scale=Math.min(2,2400/Math.max(base.width,base.height)),view=page.getViewport({scale}),canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height)),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);await page.render({canvasContext:ctx,viewport:view}).promise;
   const filtered=createCanvas(canvas.width,canvas.height),fctx=filtered.getContext('2d');fctx.filter=scanFilter(filter?.name,filter?.strength);fctx.drawImage(canvas,0,0);const image=await out.embedPng(filtered.toBuffer('image/png'));out.addPage([base.width,base.height]).drawImage(image,{x:0,y:0,width:base.width,height:base.height});
  }return await out.save()}finally{await render.destroy()}
 }finally{await viewer.destroy()}
}
