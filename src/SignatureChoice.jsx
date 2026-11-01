import React,{useEffect,useRef,useState} from 'react';
import './signature-choice.css';

function ChoiceIcon({name}){
 const paths={upload:<><path d="M12 16V4m-4 4 4-4 4 4M5 16v3h14v-3"/></>,crop:<><path d="M7 3v13a2 2 0 0 0 2 2h12M3 7h13a2 2 0 0 1 2 2v12"/></>,draw:<><path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14zM4 14l5 5"/></>,sample:<><path d="M3 15c3-5 5-7 7-5s-1 5 1 5 4-5 6-4 1 3 4 2"/></>};
 return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function SignatureChoice({onClose,onAction,onStandard}){
 const dialog=useRef(null),close=useRef(null),[working,setWorking]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const previous=document.activeElement;close.current?.focus();return()=>previous?.focus?.()},[]);
 const key=e=>{if(e.key==='Escape'&&!working){e.preventDefault();onClose();return}if(e.key==='Tab'){const nodes=[...dialog.current.querySelectorAll('button:not(:disabled)')];if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
 const choose=async id=>{if(working)return;if(id!=='sample'){onAction(id);return}setWorking(true);setError('');try{await onStandard()}catch(e){setError(e.message||'Не удалось добавить образец. Попробуйте ещё раз.')}finally{setWorking(false)}};
 const choices=[['upload','Загрузить фото','Загрузите изображение подписи или печати.'],['crop','Вырезать со страницы','Выделите подпись или печать на открытом документе.'],['draw','Нарисовать','Нарисуйте подпись мышью, пальцем или стилусом.'],['sample','Стандартная подпись','Добавьте готовый образец — его можно заменить.']];
 return <div className="signature-choice-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!working)onClose()}}><section ref={dialog} className="signature-choice" role="dialog" aria-modal="true" aria-labelledby="signature-choice-title" aria-describedby="signature-choice-description" onKeyDown={key}>
  <header><h2 id="signature-choice-title">Добавьте свою подпись</h2><button ref={close} className="signature-choice-close" type="button" aria-label="Закрыть" disabled={working} onClick={onClose}>×</button></header>
  <div className="signature-choice-body"><p id="signature-choice-description">Чтобы подписать документ, выберите удобный способ.</p><div className="signature-choice-list">{choices.map(([id,title,description])=><button type="button" className="signature-choice-option" key={id} disabled={working} onClick={()=>choose(id)}><span className="signature-choice-icon"><ChoiceIcon name={id}/></span><span><strong>{working&&id==='sample'?'Добавляем образец…':title}</strong><small>{description}</small></span><span className="signature-choice-arrow" aria-hidden="true">→</span></button>)}</div>{error&&<p className="signature-choice-error" role="alert">{error}</p>}</div>
 </section></div>
}
