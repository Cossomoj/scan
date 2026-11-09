import {PDFDocument, degrees} from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import {cropBoxFromViewport,warpImageData} from './editorTransforms.js';

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
export async function cropPdfPage(original,index,region){
 const pdf=await PDFDocument.load(original),task=pdfjs.getDocument({data:new Uint8Array(original),isEvalSupported:false});
 try{const viewer=await task.promise;const page=pdf.getPages()[index];if(!page)throw Error('Страница не найдена.');const v=(await viewer.getPage(index+1)).getViewport({scale:1}),box=cropBoxFromViewport(v,region);if(box.width<10||box.height<10)throw Error('Выберите область побольше.');page.setCropBox(box.x,box.y,box.width,box.height);return await pdf.save()}finally{await task.destroy()}
}
export async function perspectiveCropPage(original,index,points){
 const pdf=await PDFDocument.load(original),task=pdfjs.getDocument({data:new Uint8Array(original),isEvalSupported:false});
 try{const viewer=await task.promise;const source=await viewer.getPage(index+1),base=source.getViewport({scale:1}),scale=Math.min(2,2400/Math.max(base.width,base.height)),view=source.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);await source.render({canvasContext:ctx,viewport:view}).promise;
  const warped=warpImageData(ctx.getImageData(0,0,canvas.width,canvas.height),points);const result=document.createElement('canvas');result.width=warped.width;result.height=warped.height;result.getContext('2d').putImageData(new ImageData(warped.data,warped.width,warped.height),0,0);
  const physicalScale=1/scale,w=warped.width*physicalScale,h=warped.height*physicalScale;const image=await pdf.embedPng(result.toDataURL('image/png'));pdf.removePage(index);const page=pdf.insertPage(index,[w,h]);page.drawImage(image,{x:0,y:0,width:w,height:h});canvas.width=canvas.height=result.width=result.height=1;return await pdf.save();
 }finally{await task.destroy()}
}
