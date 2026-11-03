import express from 'express';

const MAX_BYTES=2*1024*1024;
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
export function setupSignatureProcessor(app,{sameOrigin,url=process.env.SIGNATURE_PROCESSOR_URL,fetcher=fetch}={}){
 let active=0;
 app.post('/api/signature/enhance',sameOrigin,express.raw({type:'image/png',limit:MAX_BYTES}),async(req,res)=>{
  const input=req.body;
  if(!Buffer.isBuffer(input)||input.length<24||!input.subarray(0,8).equals(signature)||input.readUInt32BE(16)>900||input.readUInt32BE(20)>700||!input.readUInt32BE(16)||!input.readUInt32BE(20))return res.status(400).json({error:'Не удалось прочитать изображение.'});
  if(!url||active>=2)return res.status(503).json({error:'Улучшенная обработка сейчас недоступна. Попробуйте позже или выключите её.'});
  active++;
  try{
   const response=await fetcher(`${url}/extract`,{method:'POST',headers:{'Content-Type':'image/png'},body:input,signal:AbortSignal.timeout(20000)});
   if(!response.ok||!response.headers.get('content-type')?.startsWith('image/png'))throw Error('processing failed');
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>MAX_BYTES||bytes.length<24||!bytes.subarray(0,8).equals(signature))throw Error('invalid result');
   res.type('image/png').set('Cache-Control','no-store').send(bytes);
  }catch{return res.status(503).json({error:'Не удалось улучшить изображение. Попробуйте ещё раз или выключите обработку.'})}
  finally{active--}
 });
}
