import http from 'node:http';
import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const MAX=50*1024*1024;
let busy=false;
const fail=(res,status,error)=>{if(!res.headersSent)res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({error}));};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://local');
  if(req.method!=='POST'||url.pathname!=='/convert')return fail(res,404,'Не найдено.');
  const ext=url.searchParams.get('type');
  if(!['doc','docx','xls','xlsx'].includes(ext))return fail(res,400,'Неподдерживаемый формат.');
  if(busy)return fail(res,503,'Сервис преобразования занят. Попробуйте ещё раз.');
  const length=Number(req.headers['content-length']);
  if(!Number.isSafeInteger(length)||length<1||length>MAX)return fail(res,400,'Файл слишком большой.');
  busy=true;let dir;
  try{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>MAX)throw Error('size');chunks.push(chunk)}
    if(size!==length)throw Error('size');
    dir=await mkdtemp('/tmp/convert-');
    const profile=join(dir,'profile');await mkdir(join(profile,'user'),{recursive:true});
    // Disable macros in the disposable LibreOffice profile.
    await writeFile(join(profile,'user','registrymodifications.xcu'),`<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>`);
    const input=join(dir,`document.${ext}`);await writeFile(input,Buffer.concat(chunks));
    await new Promise((resolve,reject)=>{
      const child=spawn('soffice',[`-env:UserInstallation=${pathToFileURL(profile).href}`,'--headless','--nologo','--nodefault','--nofirststartwizard','--convert-to','pdf','--outdir',dir,input],{stdio:'ignore',detached:true,env:{...process.env,HOME:dir,TMPDIR:dir}});
      const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}reject(Error('timeout'))},45000);
      child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('conversion'))});
    });
    const output=join(dir,'document.pdf'), info=await stat(output);
    if(!info.size||info.size>MAX)throw Error('size');
    const pdf=await readFile(output);if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('format');
    res.writeHead(200,{'content-type':'application/pdf','content-length':pdf.length,'cache-control':'no-store'}).end(pdf);
  }catch{fail(res,400,'Не удалось преобразовать файл. Проверьте, что он не защищён паролем.')}
  finally{if(dir)await rm(dir,{recursive:true,force:true}).catch(()=>{});busy=false}
}).listen(3001,'0.0.0.0');
