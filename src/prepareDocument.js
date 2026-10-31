import {PDFDocument} from 'pdf-lib';

export async function prepareDocument(file){
  if(!file||file.size===0)throw Error('Выберите непустой файл.');
  if(file.size>50*1024*1024)throw Error('Максимальный размер файла — 50 МБ.');
  const ext=file.name.split('.').pop().toLowerCase();
  let bytes;
  if(ext==='pdf')bytes=new Uint8Array(await file.arrayBuffer());
  else if(['png','jpg','jpeg'].includes(ext)){
    let image;
    try{
      image=await createImageBitmap(file);
      if(!image.width||!image.height||image.width*image.height>40000000||Math.max(image.width,image.height)>16384)throw Error('Слишком большое изображение. Уменьшите его и попробуйте снова.');
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      canvas.getContext('2d').drawImage(image,0,0);
      const type=ext==='png'?'image/png':'image/jpeg';
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,.95));
      if(!blob)throw Error('Не удалось открыть изображение.');
      const pdf=await PDFDocument.create(),data=new Uint8Array(await blob.arrayBuffer());
      const embedded=type==='image/png'?await pdf.embedPng(data):await pdf.embedJpg(data);
      const scale=Math.min(.75,14400/Math.max(image.width,image.height));
      const page=pdf.addPage([image.width*scale,image.height*scale]);
      page.drawImage(embedded,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});bytes=await pdf.save();
    }catch(e){throw Error(e.message?.includes('Слишком большое')?e.message:'Не удалось открыть изображение. Выберите файл JPG или PNG.')}
    finally{image?.close()}
  }else if(['doc','docx','xls','xlsx'].includes(ext)){
    const form=new FormData();form.append('file',file);
    let response;try{response=await fetch('/api/convert',{method:'POST',body:form})}catch{throw Error('Не удалось связаться с сервисом преобразования. Попробуйте снова.')}
    if(!response.ok){let message;try{message=(await response.json()).error}catch{}throw Error(message||'Не удалось преобразовать документ.')}
    bytes=new Uint8Array(await response.arrayBuffer());
  }else throw Error('Поддерживаются файлы PDF, JPG, PNG, DOC, DOCX, XLS и XLSX.');
  try{const pdf=await PDFDocument.load(bytes);if(!pdf.getPageCount()||pdf.getPageCount()>100)throw Error('Поддерживается до 100 страниц.')}catch(e){if(e.message.includes('100 страниц'))throw e;throw Error('Не удалось открыть PDF. Проверьте, что файл не защищён паролем.')}
  return {bytes,file:new File([bytes],file.name.replace(/\.[^.]+$/,'')+'.pdf',{type:'application/pdf'})};
}
