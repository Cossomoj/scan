import React,{useEffect,useMemo,useRef,useState} from 'react';
import {loadSignatureImage} from './signature.js';
import {detectImage,previewImage} from './imageProcessing.js';
import {resizeSignatureCrop} from './signatureCrop.js';
import {saveSignature} from './signatureStore.js';
import {useAccount} from './Account.jsx';
import './signature-wizard.css';

const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
function Icon({name}){
 const paths={upload:<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>,draw:<><path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14zM4 14l5 5"/></>,stamp:<><path d="M8 13c0-2 1.5-3 2-4a3 3 0 1 1 4 0c.5 1 2 2 2 4M6 17h12M5 20h14M7 13h10v4H7z"/></>,back:<path d="m15 18-6-6 6-6"/>};
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function SignatureWizard({onClose,onUse,initialFile=null,initialMethod='upload',saveOnly=false}){
 const [step,setStep]=useState(1),[kind,setKind]=useState('signature'),[method,setMethod]=useState(initialMethod);
 const [img,setImg]=useState(null),[fileInfo,setFileInfo]=useState(null),[crop,setCrop]=useState(null),[strength,setStrength]=useState(35),[widthMm,setWidthMm]=useState(50),[preview,setPreview]=useState('');
 const [removeRule,setRemoveRule]=useState(false);
 const [enhanced,setEnhanced]=useState(false),[enhancedResult,setEnhancedResult]=useState(null),[enhanceError,setEnhanceError]=useState(''),[enhanceAttempt,setEnhanceAttempt]=useState(0),[compare,setCompare]=useState(50);
 const [name,setName]=useState(''),[remember,setRemember]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dragOver,setDragOver]=useState(false);
 const [inkColor,setInkColor]=useState('#182028'),[inkWidth,setInkWidth]=useState(3);
 const picker=useRef(null),draw=useRef(null),drawing=useRef(false),drawn=useRef(false),frame=useRef(null),drag=useRef(null),dialog=useRef(null);
 const account=useAccount();

 useEffect(()=>()=>img?.release(),[img]);
 useEffect(()=>{if(img&&crop){try{setPreview(previewImage(img,crop,strength,900,removeRule))}catch{setError('Не удалось обработать изображение.')}}},[img,crop,strength,removeRule]);
 const enhanceKey=img&&crop?JSON.stringify([img.src,crop,removeRule,enhanceAttempt]):'';
 const enhancedReady=enhancedResult?.key===enhanceKey;
 const resultPreview=enhanced&&enhancedReady?enhancedResult.image:preview;
 const beforePreview=useMemo(()=>step===3&&img&&crop?previewImage(img,crop,0,900,false):'', [step,img,crop]);
 useEffect(()=>{
  if(!enhanced||!img||!crop||step!==2)return;
  const controller=new AbortController();let cancelled=false;
  setEnhanceError('');
  const timer=setTimeout(async()=>{try{
   const cropped=previewImage(img,crop,0,900,false);
   const blob=await (await fetch(cropped)).blob();
   const response=await fetch('/api/signature/enhance',{method:'POST',headers:{'Content-Type':'image/png'},body:blob,signal:controller.signal});
   if(!response.ok)throw new Error('Не удалось улучшить изображение. Попробуйте ещё раз или выключите обработку.');
   const result=await response.blob();
   const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(result)});
   if(!cancelled)setEnhancedResult({key:enhanceKey,image});
  }catch(e){if(!cancelled&&e.name!=='AbortError')setEnhanceError(e.message||'Не удалось улучшить изображение. Попробуйте ещё раз или выключите обработку.')}},450);
  return()=>{cancelled=true;clearTimeout(timer);controller.abort()};
 },[enhanced,enhanceKey,step]);
 useEffect(()=>{if(step===1&&method==='draw'&&draw.current){const ctx=draw.current.getContext('2d');ctx.strokeStyle=inkColor;ctx.lineWidth=inkWidth;ctx.lineCap='round';ctx.lineJoin='round'}},[step,method,inkColor,inkWidth]);
 useEffect(()=>{if(step===1&&method==='draw')drawn.current=false},[step,method]);
 useEffect(()=>{const previous=document.activeElement;dialog.current?.querySelector('.sw-close')?.focus();return()=>previous?.focus?.()},[]);
 useEffect(()=>{const key=e=>{if(e.key==='Escape'){onClose();return}if(e.key==='Tab'&&dialog.current){const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(n=>n.offsetParent!==null);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[onClose]);

 const openFile=async file=>{if(!file)return;setError('');setBusy(true);try{const picture=await loadSignatureImage(file);setImg(picture);setFileInfo({name:file.name,size:file.size});setCrop(detectImage(picture,kind==='stamp'));setStrength(35);setRemoveRule(false);setEnhanced(false);setEnhancedResult(null);setStep(2)}catch(e){setError(e.message)}finally{setBusy(false)}};
 useEffect(()=>{if(initialFile)openFile(initialFile)},[initialFile]);
 const changeKind=k=>{setKind(k);if(img)setCrop(detectImage(img,k==='stamp'))};
 const point=e=>{const r=draw.current.getBoundingClientRect();return [(e.clientX-r.left)*draw.current.width/r.width,(e.clientY-r.top)*draw.current.height/r.height]};
 const drawStart=e=>{e.preventDefault();drawing.current=true;drawn.current=true;e.currentTarget.setPointerCapture(e.pointerId);const [x,y]=point(e),ctx=draw.current.getContext('2d');ctx.beginPath();ctx.moveTo(x,y)};
 const drawMove=e=>{if(!drawing.current)return;const [x,y]=point(e),ctx=draw.current.getContext('2d');ctx.lineTo(x,y);ctx.stroke()};
 const processDrawing=()=>{if(!drawn.current)return setError('Нарисуйте подпись или печать.');draw.current.toBlob(blob=>{if(blob)openFile(new File([blob],kind==='stamp'?'Печать.png':'Подпись.png',{type:'image/png'}))},'image/png')};

 const beginDrag=(e,corner=null)=>{e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,crop,corner}};
 const moveDrag=e=>{if(!drag.current||!frame.current)return;e.stopPropagation();const rect=frame.current.getBoundingClientRect(),dx=(e.clientX-drag.current.x)/rect.width,dy=(e.clientY-drag.current.y)/rect.height,c=drag.current.crop;if(!drag.current.corner)setCrop({...c,x:clamp(c.x+dx,0,1-c.w),y:clamp(c.y+dy,0,1-c.h)});else setCrop(resizeSignatureCrop(c,drag.current.corner,dx,dy))};
 const moveSelectionKey=e=>{if(e.target!==e.currentTarget)return;const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;e.preventDefault();const amount=e.shiftKey?.05:.01;setCrop(c=>({...c,x:clamp(c.x+d[0]*amount,0,1-c.w),y:clamp(c.y+d[1]*amount,0,1-c.h)}))};
 const resizeKey=(e,corner)=>{const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;e.preventDefault();e.stopPropagation();const amount=e.shiftKey?.05:.01;setCrop(c=>resizeSignatureCrop(c,corner,d[0]*amount,d[1]*amount))};
 const heightMm=crop?Number(widthMm)*crop.h*img.naturalHeight/(crop.w*img.naturalWidth):0;
 const save=async()=>{if(!resultPreview||enhanced&&!enhancedReady)return;if(remember&&!name.trim())return setError('Укажите название для сохранения.');setBusy(true);setError('');try{const width=clamp(+widthMm||50,5,150),height=width*crop.h*img.naturalHeight/(crop.w*img.naturalWidth),item={id:crypto.randomUUID(),name:name.trim()||(kind==='stamp'?'Печать':'Подпись'),image:resultPreview,sourceImage:enhanced?resultPreview:previewImage(img,crop,0,900,removeRule),strength:enhanced?0:strength,widthMm:width,heightMm:height,kind};if(remember)await saveSignature(item);onUse(item)}catch(e){setError(e.message||'Не удалось сохранить. Попробуйте ещё раз или снимите галочку сохранения.')}finally{setBusy(false)}};
 const sizeText=fileInfo?(fileInfo.size<1024?'меньше 1 КБ':Math.round(fileInfo.size/1024)+' КБ'):'';

 return <div className="wiz-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section ref={dialog} className="signature-wizard" role="dialog" aria-modal="true" aria-labelledby="sw-title">
  <button type="button" className="sw-close" aria-label="Закрыть" onClick={onClose}>×</button>
  <div className="sw-steps" aria-label="Этапы создания подписи">{['Загрузка','Обработка','Сохранение'].map((label,i)=><div key={label} className={step===i+1?'current':step>i+1?'completed':''} aria-current={step===i+1?'step':undefined}><span>{i+1}</span><b>{label}</b></div>)}</div>
  {step===1&&<div className="sw-body"><div className="sw-heading"><h2 id="sw-title">{method==='draw'?(kind==='stamp'?'Нарисуйте печать':'Нарисуйте подпись'):'Добавьте подпись или печать'}</h2><p>{method==='draw'?'Используйте мышь, палец или стилус.':'Загрузите изображение или нарисуйте прямо здесь.'}</p></div>
   <div className="sw-choice" role="group" aria-label="Тип изображения"><button type="button" aria-pressed={kind==='signature'} onClick={()=>changeKind('signature')}><Icon name="draw"/>Подпись</button><button type="button" aria-pressed={kind==='stamp'} onClick={()=>changeKind('stamp')}><Icon name="stamp"/>Печать</button></div>
   <div className="sw-method" role="group" aria-label="Способ создания"><button type="button" aria-pressed={method==='upload'} onClick={()=>{setMethod('upload');setError('')}}>Загрузить фото</button><button type="button" aria-pressed={method==='draw'} onClick={()=>{setMethod('draw');setError('')}}>Нарисовать</button></div>
   {method==='upload'?<div className={'sw-drop '+(dragOver?'is-dragging':'')} onDragEnter={e=>{e.preventDefault();setDragOver(true)}} onDragOver={e=>e.preventDefault()} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragOver(false)}} onDrop={e=>{e.preventDefault();setDragOver(false);if(e.dataTransfer.files.length!==1){setError('Выберите одно изображение.');return}openFile(e.dataTransfer.files[0])}}>
    <span className="sw-drop-icon"><Icon name="upload"/></span><strong>{busy?'Открываем изображение…':'Перетащите изображение сюда'}</strong><span>PNG, JPG, WebP или SVG · до 10 МБ</span><button type="button" className="sw-outline" disabled={busy} onClick={()=>picker.current.click()}>Выбрать файл</button><input ref={picker} hidden type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>{openFile(e.target.files[0]);e.target.value=''}}/>
   </div>:<><canvas className="sw-draw" ref={draw} width="800" height="300" aria-label="Поле для рисования подписи" onPointerDown={drawStart} onPointerMove={drawMove} onPointerUp={()=>drawing.current=false} onPointerCancel={()=>drawing.current=false}/><div className="sw-draw-tools"><div><strong>Цвет</strong><div role="group" aria-label="Цвет подписи">{[['#182028','Чёрная ручка'],['#174aa5','Синяя ручка'],['#b32929','Красная ручка']].map(([color,label])=><button type="button" key={color} aria-label={label} aria-pressed={inkColor===color} className="sw-ink" style={{background:color}} onClick={()=>setInkColor(color)}/>)}</div></div><div><strong>Толщина</strong><div role="group" aria-label="Толщина линии">{[[3,'Тонкая линия'],[5,'Средняя линия'],[8,'Толстая линия']].map(([width,label])=><button type="button" key={width} aria-label={label} aria-pressed={inkWidth===width} className="sw-pen-width" onClick={()=>setInkWidth(width)}><span style={{height:Math.max(2,width/2)+'px'}}/></button>)}</div></div></div><div className="sw-footer"><button type="button" className="sw-outline" onClick={()=>{draw.current.getContext('2d').clearRect(0,0,800,300);drawn.current=false;setError('')}}>Очистить</button><button type="button" className="sw-primary" onClick={processDrawing}>Далее</button></div></>}
   {error&&<p className="sw-error" role="alert">{error}</p>}
  </div>}
  {step===2&&img&&crop&&<div className="sw-body sw-processing"><div className="sw-processing-heading"><button type="button" className="sw-back" onClick={()=>{setError('');setStep(1)}} aria-label="Назад к загрузке"><Icon name="back"/></button><div><h2 id="sw-title">{kind==='stamp'?'Подготовьте печать':'Подготовьте подпись'}</h2><p>Выделите нужную область и настройте фон.</p></div></div>
   {enhanced&&<div className={'sw-enhance-banner'+(enhanceError?' is-error':'')} aria-hidden="true"><span>{enhanceError?'!':enhancedReady?'✓':'⋯'}</span><p>{enhanceError||(!enhancedReady?'Улучшаем подпись… Результат появится здесь.':'Подпись обработана. Результат показан ниже.')}</p></div>}
   <div className="sw-crop-workspace"><div ref={frame} className="sw-crop-frame" style={{width:`min(100%, ${Math.round(360*img.naturalWidth/img.naturalHeight)}px)`}}><img className="sw-source" src={img.src} alt="Исходное изображение" draggable="false"/><div className="sw-crop-selection" role="group" tabIndex="0" aria-label="Выделенная область. Перемещайте стрелками." style={{left:crop.x*100+'%',top:crop.y*100+'%',width:crop.w*100+'%',height:crop.h*100+'%'}} onPointerDown={e=>beginDrag(e)} onPointerMove={moveDrag} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onKeyDown={moveSelectionKey}><div className="sw-crop-result">{resultPreview&&<img src={resultPreview} alt="" draggable="false"/>}</div>{[['nw','верхний левый'],['ne','верхний правый'],['sw','нижний левый'],['se','нижний правый']].map(([corner,label])=><button type="button" key={corner} className={'sw-crop-handle sw-crop-'+corner} aria-label={'Изменить выделение: '+label+' угол'} onPointerDown={e=>beginDrag(e,corner)} onPointerMove={moveDrag} onPointerUp={e=>{e.stopPropagation();drag.current=null}} onPointerCancel={()=>drag.current=null} onKeyDown={e=>resizeKey(e,corner)}/>)}</div></div></div>
   {fileInfo&&<div className="sw-file"><span className="sw-file-check">✓</span><strong title={fileInfo.name}>{fileInfo.name}</strong><span>{sizeText} → PNG</span></div>}
   <p className="sw-crop-help">Перетащите рамку или её углы, чтобы выбрать область {kind==='stamp'?'печати':'подписи'}.</p>
   <div className="sw-background"><label htmlFor="sw-strength">Удаление фона <output>{enhanced?'Автоматически':Math.round(strength)+'%'}</output></label><input id="sw-strength" type="range" min="0" max="100" value={strength} disabled={enhanced} onChange={e=>setStrength(+e.target.value)}/><div><span>Без удаления</span><span>Сильнее</span></div></div>
   <label className="sw-remove-rule"><input type="checkbox" checked={removeRule||enhanced} disabled={enhanced} onChange={e=>setRemoveRule(e.target.checked)}/><span><strong>Убрать линию под подписью</strong><small>{enhanced?'Входит в улучшенную обработку.':'Проверьте результат: части штриха на линии могут исчезнуть.'}</small></span></label>
   {kind==='signature'&&method==='upload'&&<label className="sw-enhance"><input type="checkbox" checked={enhanced} onChange={e=>{setEnhanced(e.target.checked);setEnhancedResult(null);setEnhanceError('')}}/><span><strong>Улучшенная обработка</strong><small>Очищает фон от линий бланка и мелких точек, подчёркивает края штрихов. Выделенный фрагмент отправится на сервер и не сохраняется там.</small></span></label>}
   {enhanced&&<p className="sw-enhance-status" role="status">{enhanceError||(!enhancedReady?'Улучшаем подпись…':'Готово: изображение выше обновлено.')}{enhanceError&&<> <button type="button" onClick={()=>setEnhanceAttempt(n=>n+1)}>Повторить</button></>}</p>}
   {error&&<p className="sw-error" role="alert">{error}</p>}
   <div className="sw-footer"><button type="button" className="sw-outline" onClick={()=>{setCrop(detectImage(img,kind==='stamp'));setStrength(0);setRemoveRule(false);setEnhanced(false);setError('')}}>Сбросить</button><button type="button" className="sw-primary" disabled={!resultPreview||(enhanced&&!enhancedReady)} onClick={()=>{setError('');setCompare(50);setStep(3)}}>Далее</button></div>
  </div>}
  {step===3&&<div className="sw-body"><div className="sw-heading"><h2 id="sw-title">Сохранить результат</h2><p>Подпись или печать можно использовать сейчас и сохранить для следующих документов.</p></div><div className="sw-comparison" style={{'--compare':compare+'%'}}><div className="sw-comparison-after"><img src={resultPreview} alt="Результат обработки"/></div><div className="sw-comparison-before"><img src={beforePreview} alt="Исходный выделенный фрагмент"/></div><span className="sw-compare-label sw-compare-before-label">До</span><span className="sw-compare-label sw-compare-after-label">После</span><div className="sw-compare-divider" aria-hidden="true"><span>‹ ›</span></div><input type="range" min="0" max="100" value={compare} onChange={e=>setCompare(+e.target.value)} aria-label="Сравнение до и после обработки"/></div><p className="sw-compare-help">Передвиньте ползунок, чтобы сравнить с исходным изображением.</p><div className="sw-save-fields"><label>Название {remember&&'*'}<input value={name} maxLength={50} placeholder={kind==='stamp'?'Например: Печать компании':'Например: Подпись директора'} onChange={e=>setName(e.target.value)}/></label><label>Ширина, мм<input type="number" min="5" max="150" value={widthMm} onChange={e=>setWidthMm(e.target.value)} onBlur={()=>setWidthMm(v=>clamp(+v||50,5,150))}/></label></div><p className="sw-dimensions">Размер: {widthMm} × {heightMm.toFixed(1)} мм. Пропорции сохраняются.</p><label className="sw-remember"><input type="checkbox" checked={remember} disabled={saveOnly} onChange={e=>setRemember(e.target.checked)}/><span><strong>{account.user?'Сохранить в аккаунте':'Сохранить в браузере'}</strong><small>{account.user?'Подпись будет доступна на других устройствах после входа.':'Подпись будет доступна на этом устройстве для следующих документов.'}</small></span></label>{!saveOnly&&<p className="sw-dimensions">Для разового использования снимите галочку.</p>}{error&&<p className="sw-error" role="alert">{error}</p>}<div className="sw-footer"><button type="button" className="sw-outline" onClick={()=>{setError('');setStep(2)}}>Назад</button><button type="button" className="sw-primary" disabled={busy} onClick={save}>{busy?'Сохраняем…':'Сохранить'}</button></div></div>}
 </section></div>;
}
