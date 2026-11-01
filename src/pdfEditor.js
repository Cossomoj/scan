import {PDFDocument, degrees} from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import {imagePlacement} from './placement.js';
import {scanFilter,cropBoxFromViewport} from './editorTransforms.js';

export async function addPdfPages(original,extra){
  const document=await PDFDocument.load(original),incoming=await PDFDocument.load(extra);
  if(document.getPageCount()+incoming.getPageCount()>100)throw Error('Поддерживается до 100 страниц.');
  const pages=await document.copyPages(incoming,incoming.getPageIndices());for(const p of pages)document.addPage(p);
  return document.save();
}
export async function changePage(original,index,operation){
 const doc=await PDFDocument.load(original),pages=doc.getPages();
 if(index<0||index>=pages.length)throw Error('Страница не найдена.');
 if(operation==='delete'){if(pages.length===1)throw Error('Нельзя удалить последнюю страницу.');doc.removePage(index)}
 else if(operation==='rotate'){const p=pages[index];p.setRotation(degrees((p.getRotation().angle+90)%360))}
 else if(operation==='up'||operation==='down'){const to=index+(operation==='up'?-1:1);if(to<0||to>=pages.length)return original;const p=pages[index];doc.removePage(index);doc.insertPage(to,p)}
 return doc.save();
}
export async function addBlankPage(original){const doc=await PDFDocument.load(original);if(doc.getPageCount()>=100)throw Error('Поддерживается до 100 страниц.');doc.addPage([595.28,841.89]);return doc.save()}
function elementPng(item){
 if(item.type==='image')return item.image;
 const c=document.createElement('canvas');c.width=1200;c.height=Math.max(1,Math.round(1200/(item.aspect||4)));const ctx=c.getContext('2d');
 if(item.type==='cover'){ctx.fillStyle=item.color||'#182028';ctx.fillRect(0,0,c.width,c.height);return c.toDataURL('image/png')}
 if(item.type==='check'){ctx.fillStyle='#168b54';ctx.font='bold '+Math.round(c.height*.85)+'px Arial';ctx.textBaseline='middle';ctx.fillText('✓',20,c.height/2);return c.toDataURL('image/png')}
 const size=Math.max(1,Math.round(c.height*.62*(item.fontScale??1)));ctx.fillStyle=item.color||'#1e293b';ctx.font=`${item.italic?'italic ':''}${item.bold?'bold ':''}${size}px ${item.fontFamily||'Arial'}, sans-serif`;ctx.textBaseline='middle';
 const content=(item.text||'').trim();if(!content)throw Error('Введите текст перед скачиванием.');ctx.fillText(content,8,c.height/2,c.width-16);return c.toDataURL('image/png')
}
export async function cropPdfPage(original,index,region){
 const pdf=await PDFDocument.load(original),viewer=await pdfjs.getDocument({data:new Uint8Array(original)}).promise;
 try{const page=pdf.getPages()[index];if(!page)throw Error('Страница не найдена.');const v=(await viewer.getPage(index+1)).getViewport({scale:1}),box=cropBoxFromViewport(v,region);if(box.width<10||box.height<10)throw Error('Выберите область побольше.');page.setCropBox(box.x,box.y,box.width,box.height);return await pdf.save()}finally{await viewer.destroy()}
}
async function flattenFiltered(original,filters){
 if(!Object.values(filters).some(f=>f?.name&&f.name!=='none'))return original;
 const source=await PDFDocument.load(original),out=await PDFDocument.create(),viewer=await pdfjs.getDocument({data:new Uint8Array(original)}).promise;
 try{for(let i=0;i<source.getPageCount();i++){const filter=filters[i];if(!filter||filter.name==='none'){const [p]=await out.copyPages(source,[i]);out.addPage(p);continue}
  const page=await viewer.getPage(i+1),base=page.getViewport({scale:1}),scale=Math.min(2,2400/Math.max(base.width,base.height)),view=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);await page.render({canvasContext:ctx,viewport:view}).promise;
  const result=document.createElement('canvas');result.width=canvas.width;result.height=canvas.height;const filtered=result.getContext('2d');filtered.filter=scanFilter(filter.name,filter.strength);filtered.drawImage(canvas,0,0);const image=await out.embedPng(result.toDataURL('image/png'));const target=out.addPage([base.width,base.height]);target.drawImage(image,{x:0,y:0,width:base.width,height:base.height});canvas.width=canvas.height=result.width=result.height=1;
 }return await out.save()}finally{await viewer.destroy()}
}
export async function exportDocument(original,items,filters={}){
 const pdf=await PDFDocument.load(original),viewer=await pdfjs.getDocument({data:new Uint8Array(original)}).promise;
 try{for(const item of items){if(item.type==='text'&&!item.text?.trim())continue;const page=pdf.getPages()[item.page];if(!page)continue;const view=(await viewer.getPage(item.page+1)).getViewport({scale:1});
   const x=item.x*view.width,y=item.y*view.height,w=item.width*view.width,h=item.height*view.height;
   const origin=view.convertToPdfPoint(x,y+h),right=view.convertToPdfPoint(x+w,y+h),top=view.convertToPdfPoint(x,y);
   const physicalWidth=Math.hypot(right[0]-origin[0],right[1]-origin[1]),physicalHeight=Math.hypot(top[0]-origin[0],top[1]-origin[1]);
   const center=view.convertToPdfPoint(x+w/2,y+h/2),position=imagePlacement(center,physicalWidth,physicalHeight,view.rotation,item.angle||0);
   const png=await pdf.embedPng(elementPng({...item,aspect:physicalWidth/physicalHeight}));page.drawImage(png,{x:position.x,y:position.y,width:physicalWidth,height:physicalHeight,rotate:degrees(position.rotation)});
 }return await flattenFiltered(await pdf.save(),filters)}finally{await viewer.destroy()}
}
