import React,{useEffect,useRef,useState} from 'react';
import './upload-dialog.css';

export default function UploadDialog({onClose,onSelect,busy,error}){
  const input=useRef(null),close=useRef(null),pick=useRef(null),[dragging,setDragging]=useState(false);
  useEffect(()=>{const previous=document.activeElement;close.current?.focus();const key=e=>{if(e.key==='Escape'&&!busy)onClose()};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus()}},[busy,onClose]);
  const take=files=>{setDragging(false);if(files?.length===1)onSelect(files[0]);else if(files?.length>1)onSelect(null)};
  return <div className="upload-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
    <section className="upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title" aria-describedby="upload-description" aria-busy={busy} onKeyDown={e=>{if(e.key==='Tab'&&!busy){if(e.shiftKey&&e.target===close.current){e.preventDefault();pick.current?.focus()}else if(!e.shiftKey&&e.target===pick.current){e.preventDefault();close.current?.focus()}}}}>
      <button ref={close} className="upload-close" onClick={onClose} disabled={busy} aria-label="Закрыть">×</button>
      <div className="upload-heading"><h1 id="upload-title">Загрузите документ</h1><p id="upload-description">Подпишите PDF, фото или скан прямо в браузере</p></div>
      <div className={'upload-dropzone'+(dragging?' is-dragging':'')} onDragEnter={e=>{e.preventDefault();setDragging(true)}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';setDragging(true)}} onDragLeave={e=>{e.preventDefault();if(!e.currentTarget.contains(e.relatedTarget))setDragging(false)}} onDrop={e=>{e.preventDefault();if(!busy)take(e.dataTransfer.files)}}>
        <div className="upload-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V3m-4 4 4-4 4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></div>
        <h2>{busy?'Открываем документ…':'Перетащите документ сюда'}</h2><p>{busy?'Пожалуйста, подождите':'или выберите файл на устройстве'}</p>
        <button ref={pick} type="button" className="upload-pick" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Загрузка…':'Выбрать файл'} <span aria-hidden="true">↗</span></button>
        <input ref={input} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,application/pdf,image/jpeg,image/png" onChange={e=>{take(e.target.files);e.target.value=''}}/>
        <div className="upload-formats" aria-label="Поддерживаемые форматы"><span>PDF</span><span>JPG · PNG</span><span>DOC · DOCX</span><span>XLS · XLSX</span><span>до 50 МБ</span></div>
      </div>
      {error&&<p className="upload-error" role="alert">{error}</p>}
      <p className="upload-privacy"><span aria-hidden="true">◈</span><span>PDF и фотографии остаются в браузере. Word и Excel временно отправляются для преобразования в PDF и удаляются после обработки.</span></p>
    </section>
  </div>;
}
