import {PDFDocument, degrees} from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import {imagePlacement} from './placement.js';

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
 const c=document.createElement('canvas');c.width=1200;c.height=Math.max(180,Math.round(1200/(item.aspect||4)));const ctx=c.getContext('2d');
 if(item.type==='check'){ctx.fillStyle='#168b54';ctx.font='bold '+Math.round(c.height*.85)+'px Arial';ctx.textBaseline='middle';ctx.fillText('✓',20,c.height/2);return c.toDataURL('image/png')}
 const size=Math.round(c.height*.62);ctx.fillStyle=item.color||'#1e293b';ctx.font=size+'px Arial, sans-serif';ctx.textBaseline='middle';
 const content=(item.text||'').trim();if(!content)throw Error('Введите текст перед скачиванием.');ctx.fillText(content,8,c.height/2,c.width-16);return c.toDataURL('image/png')
}
export async function exportDocument(original,items){
 const pdf=await PDFDocument.load(original),viewer=await pdfjs.getDocument({data:new Uint8Array(original)}).promise;
 try{for(const item of items){const page=pdf.getPages()[item.page];if(!page)continue;const view=(await viewer.getPage(item.page+1)).getViewport({scale:1});
   const x=item.x*view.width,y=item.y*view.height,w=item.width*view.width,h=item.height*view.height;
   const origin=view.convertToPdfPoint(x,y+h),right=view.convertToPdfPoint(x+w,y+h),top=view.convertToPdfPoint(x,y);
   const physicalWidth=Math.hypot(right[0]-origin[0],right[1]-origin[1]),physicalHeight=Math.hypot(top[0]-origin[0],top[1]-origin[1]);
   const center=view.convertToPdfPoint(x+w/2,y+h/2),position=imagePlacement(center,physicalWidth,physicalHeight,view.rotation,item.angle||0);
   const png=await pdf.embedPng(elementPng(item));page.drawImage(png,{x:position.x,y:position.y,width:physicalWidth,height:physicalHeight,rotate:degrees(position.rotation)});
 }return await pdf.save()}finally{await viewer.destroy()}
}
