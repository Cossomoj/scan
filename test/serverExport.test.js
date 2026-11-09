import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts,degrees} from 'pdf-lib';
import {exportServerDocument} from '../server/exportDocument.js';

test('server export preserves pages and flattens covered or filtered content',async()=>{
 const source=await PDFDocument.create(),font=await source.embedFont(StandardFonts.Helvetica);const first=source.addPage([240,320]);first.drawText('SECRET TEXT',{x:20,y:160,font});const second=source.addPage([240,320]);second.setRotation(degrees(90));const bytes=await source.save();
 const result=await exportServerDocument(bytes,[{type:'cover',page:0,x:.1,y:.2,width:.5,height:.2,color:'#101010'},{type:'text',page:1,x:.1,y:.1,width:.4,height:.1,text:'Test',fontScale:1}],{0:{name:'gray',strength:'medium'}});
 const pdf=await PDFDocument.load(result);assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getPage(1).getRotation().angle,90);
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=pdfjs.getDocument({data:new Uint8Array(result)});try{const view=await task.promise;const page=await view.getPage(1);const text=await page.getTextContent();assert.equal(text.items.length,0)}finally{await task.destroy()}
});
