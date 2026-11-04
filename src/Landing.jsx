import React, {useEffect, useRef, useState} from 'react';
import {AccountButton,useAccount} from './Account.jsx';
import {Pricing,useBillingStatus} from './Billing.jsx';
import Brand from './Brand.jsx';
import './landing.css';
import './footer.css';
import './landing-demo.css';
import './landing-features.css';
import './landing-hero.css';
import './landing-faq.css';
import './landing-menu.css';

function Glyph({name, ...props}) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/></>,
    file: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8 13h8M8 17h5"/></>,
    pen: <><path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14zM4 14l5 5"/></>,
    text: <><path d="M4 6V4h16v2M12 4v16M8 20h8"/></>,
    clean: <><path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2zM20 17v4m-2-2h4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></>,
    move: <><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></>,
    cover: <><path d="M4 8h16v5H4zM7 17h10"/></>,
    crop: <><path d="M6 3v13a2 2 0 0 0 2 2h13M3 6h13a2 2 0 0 1 2 2v13"/></>,
    filter: <><path d="M5 7h14v10H5zM3 11h18M8 3v4m8-4v4M8 17v4m8-4v4"/></>,
    pages: <><path d="M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 16h6"/></>,
    menu: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    down: <path d="m7 10 5 5 5-5"/>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function CapabilitiesMenu({onChoose,onDemo,busy}) {
  const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const outside=e=>{if(!root.current?.contains(e.target))setOpen(false)};
    const escape=e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus()}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
  },[open]);
  const choose=()=>{setOpen(false);onChoose()};
  const demo=tool=>{setOpen(false);onDemo(tool)};
  return <div className="home-capabilities" ref={root} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false)}}>
    <button ref={trigger} type="button" className="capabilities-trigger" aria-label="Возможности" aria-expanded={open} aria-controls="capabilities-panel" onClick={()=>setOpen(v=>!v)}><Glyph name="menu" className="capabilities-mobile-icon"/><span>Возможности</span><Glyph name="down" className="capabilities-chevron"/></button>
    {open&&<div id="capabilities-panel" className="capabilities-panel">
      <div className="capabilities-column"><h2>Возможности</h2><a className="capabilities-all" href="#features" onClick={()=>setOpen(false)}>Все возможности <Glyph name="arrow"/></a><div className="capabilities-actions">{['Подписать PDF','Подписать Word','Подписать Excel','Поставить печать','Нарисовать подпись'].map(label=><button type="button" key={label} disabled={busy} onClick={choose}>{label}<Glyph name="arrow"/></button>)}</div></div>
      <div className="capabilities-column capabilities-tools"><h2>Инструменты</h2><a className="capabilities-all" href="#try" onClick={()=>setOpen(false)}>Все инструменты <Glyph name="arrow"/></a>
        {[['filter','filter','Эффект сканера','Попробуйте фильтр страницы'],['signature','clean','Подпись без фона','Настройте прозрачность'],['extract','crop','Вырезать со страницы','Выделите подпись или печать']].map(([tool,icon,label,description])=><a className="capabilities-tool" href="#try" key={tool} onClick={()=>demo(tool)}><Glyph name={icon}/><span><strong>{label}</strong><small>{description}</small></span><Glyph name="arrow"/></a>)}
        <p>Выберите инструмент и попробуйте его на учебном примере.</p>
      </div>
    </div>}
  </div>;
}


function DemoSignature() {
  return <svg viewBox="0 0 180 70" fill="none" aria-hidden="true"><path d="M7 51C23 40 40 14 48 16c8 3-10 34-16 36-7 2 17-29 25-29 11 1-15 30-8 29 8-2 18-30 23-31 6-1-5 30-9 34-3 2 12-24 20-22 8 2-4 17 1 19 6 1 12-22 20-20 7 1-5 20 1 20 6 0 14-17 18-17 5 0-2 13 4 14 7 2 13-9 22-6M17 60c36-11 95-13 150-9M101 12c9-9 21-7 22-2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

const demoTools = [
  {id:'signature', icon:'pen', title:'Подпись'},
  {id:'text', icon:'text', title:'Текст'},
  {id:'cover', icon:'cover', title:'Замазка'},
  {id:'extract', icon:'crop', title:'Вырезать'},
  {id:'filter', icon:'filter', title:'Фильтр'},
  {id:'pages', icon:'pages', title:'Страницы'},
];

function EditorDemo({onExample, busy, requestedTool}) {
  const [tool,setTool]=useState('signature'), [angle,setAngle]=useState(-8), [strength,setStrength]=useState(100), [name,setName]=useState('Анна Смирнова'), [position,setPosition]=useState({x:60,y:66});
  const [covered,setCovered]=useState(false), [filter,setFilter]=useState('none');
  const page=useRef(null), drag=useRef(null);
  useEffect(()=>{if(requestedTool?.name)setTool(requestedTool.name)},[requestedTool]);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const move=e=>{
    if(!drag.current||drag.current.id!==e.pointerId)return;
    const rect=page.current.getBoundingClientRect();
    setPosition({x:clamp(drag.current.x+(e.clientX-drag.current.px)/rect.width*100,5,60),y:clamp(drag.current.y+(e.clientY-drag.current.py)/rect.height*100,16,66)});
  };
  const reset=()=>{setAngle(-8);setStrength(100);setName('Анна Смирнова');setPosition({x:60,y:66});setCovered(false);setFilter('none')};
  return <section className="home-demo" id="try" aria-labelledby="demo-title">
    <div className="demo-topline"><div><h2 id="demo-title">Попробуйте редактор</h2><p>Посмотрите, как работать с документом.</p></div><span>Учебный пример · изменения не сохраняются</span></div>
    <div className="demo-workspace">
      <div className="demo-editor-bar"><span><Glyph name="file"/> Пример.pdf</span><button type="button" disabled={busy} onClick={onExample}>Открыть редактор <Glyph name="arrow"/></button></div>
      <div className="demo-editor-body">
        <nav className="demo-tools" aria-label="Инструменты учебного редактора">{demoTools.map(t=><button key={t.id} type="button" aria-pressed={tool===t.id} onClick={()=>setTool(t.id)}><Glyph name={t.icon}/><span>{t.title}</span></button>)}</nav>
        <div className="demo-sidebar">
          {tool==='signature'&&<><h3>Подписи и печати</h3><p className="demo-tip">Подпись можно переместить, изменить её наклон и убрать фон.</p><div className="demo-sign-card"><span><DemoSignature/></span><div><strong>Подпись</strong><small>Уже на документе</small></div></div><label className="demo-side-control">Наклон <output>{angle}°</output><input type="range" min="-30" max="30" value={angle} onChange={e=>setAngle(+e.target.value)}/></label><label className="demo-side-control">Удаление фона <output>{strength}%</output><input type="range" min="0" max="100" value={strength} onChange={e=>setStrength(+e.target.value)}/></label></>}
          {tool==='text'&&<><h3>Текст</h3><p className="demo-tip">Заполняйте документ прямо на странице и сохраняйте часто используемый текст.</p><label className="demo-field">Имя в документе<input aria-label="Текст в учебном документе" value={name} maxLength={40} onChange={e=>setName(e.target.value)} placeholder="Введите имя и фамилию"/></label><p className="demo-side-note">Измените текст, чтобы увидеть результат справа.</p></>}
          {tool==='cover'&&<><h3>Замазка</h3><p className="demo-tip">Закройте нужную область документа цветной плашкой.</p><button className="demo-panel-action" type="button" onClick={()=>setCovered(v=>!v)}>{covered?'Убрать замазку':'Добавить замазку'}</button><p className="demo-side-note">В редакторе плашку можно перемещать и менять её размер.</p></>}
          {tool==='extract'&&<><h3>Вырезать со страницы</h3><p className="demo-tip">Выделите подпись или печать на скане, чтобы сохранить её в библиотеку.</p><ol className="demo-instructions"><li>Выделите область на странице.</li><li>Уберите фон и сохраните изображение.</li></ol><p className="demo-side-note">Попробуйте на учебном PDF в полном редакторе.</p></>}
          {tool==='filter'&&<><h3>Фильтр страницы</h3><p className="demo-tip">Фильтр применяется ко всей странице вместе с отметками.</p><div className="demo-filter-list" role="group" aria-label="Фильтр учебной страницы">{[['none','Без фильтра'],['mono','Чёрно-белый скан'],['gray','Серый скан'],['color','Цветной скан'],['copy','Ксерокопия']].map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div></>}
          {tool==='pages'&&<><h3>Страницы</h3><p className="demo-tip">Добавляйте страницы, меняйте их порядок и поворачивайте.</p><div className="demo-page-card"><Glyph name="file"/><span><strong>Страница 1</strong><small>Пример.pdf</small></span><b>1 / 1</b></div><p className="demo-side-note">Все действия со страницами доступны в полном редакторе.</p></>}
          <button className="home-text-action demo-open" disabled={busy} onClick={onExample}>Открыть полный редактор <Glyph name="arrow"/></button>
        </div>
        <div className="demo-preview">
          <div className="demo-document-bar"><span>Страница 1 из 1</span><button type="button" className="demo-reset" onClick={reset} aria-label="Сбросить пример" title="Сбросить пример"><Glyph name="reset"/></button></div>
          <div className={'demo-paper demo-filter-'+filter} ref={page}>
            <div className="demo-paper-head"><strong>КОНТОРКА / ПРИМЕР</strong><span>01</span></div>
            <h3>Заявление</h3><p className="demo-paper-intro">Всё важное — в одном документе.</p>
            <div className="demo-name-row"><span>Имя и фамилия</span><div className="demo-name-value">{name||'Имя и фамилия'}</div>{covered&&<div className="demo-cover" aria-label="Пример замазки"/>}</div>
            <p className="demo-paper-note">Этот документ создан для знакомства с редактором.<br/>Здесь можно попробовать инструменты без своего файла.</p>
            <div className="demo-paper-signline"><span>Дата<br/><b>31 октября 2026</b></span><span>Подпись<br/><b className="demo-sign-rule"/></span></div>
            <button type="button" className={'demo-signature '+(tool==='signature'?'is-selected':'')} style={{left:position.x+'%',top:position.y+'%',transform:`rotate(${angle}deg)`,backgroundColor:`rgb(224 218 205 / ${1-strength/100})`}}
              aria-label="Переместить учебную подпись. Используйте стрелки на клавиатуре" title="Перетащите подпись или используйте стрелки"
              onPointerDown={e=>{if(drag.current||!e.isPrimary||e.button!==0)return;e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,px:e.clientX,py:e.clientY,...position}}}
              onPointerMove={move} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onLostPointerCapture={()=>drag.current=null}
              onKeyDown={e=>{const delta={ArrowLeft:[-2,0],ArrowRight:[2,0],ArrowUp:[0,-2],ArrowDown:[0,2]}[e.key];if(delta){e.preventDefault();setPosition(p=>({x:clamp(p.x+delta[0],5,60),y:clamp(p.y+delta[1],16,66)}))}}}>
              <DemoSignature/>{tool==='signature'&&<span className="demo-drag-label"><Glyph name="move"/> Перетащите</span>}
            </button>
          </div>
          <div className="demo-preview-footer"><span>Учебный документ</span><span>1 / 1</span><span>50%</span></div>
        </div>
      </div>
    </div>
  </section>;
}

const features = [
  {image:'stamp', title:'Печать на документ', description:'Загрузите изображение печати, уберите фон и разместите её на странице.'},
  {image:'draw', title:'Подпись от руки', description:'Распишитесь мышью, пальцем или стилусом. Выберите цвет и толщину линии.'},
  {image:'cover', title:'Замазка данных', description:'Закройте нужную область цветной плашкой и проверьте результат перед отправкой.'},
  {image:'text', title:'Текст на документ', description:'Впишите имя, дату или ответ в анкете. Настройте шрифт, цвет и размер.'},
  {image:'extract', title:'Вырезать со страницы', description:'Выделите подпись или печать на скане и сохраните для других документов.'},
  {image:'office', title:'Word и Excel в PDF', description:'Откройте DOC, DOCX, XLS или XLSX, чтобы заполнить и подписать как PDF.'},
];

function FeatureGallery(){
  return <section className="home-features" id="features" aria-labelledby="features-title">
    <div className="features-heading"><h2 id="features-title">Всё для работы<br/>с документами</h2><p>От подписи и заполнения до обработки страниц — всё в одном редакторе.</p></div>
    <div className="features-grid">{features.map(feature=><article className="feature-card" key={feature.image}>
      <div className={'feature-preview feature-preview-'+feature.image}><img src={'/feature-previews/'+feature.image+'.png'+(feature.image==='stamp'?'?v=2':'')} alt="" loading="lazy" decoding="async"/></div>
      <div className="feature-copy"><h3>{feature.title}</h3><p>{feature.description}</p></div>
    </article>)}</div>
  </section>;
}

function getQuestions(billing,onFeedback) {
  return [
    ['legal', 'Законно ли ставить электронную печать на документ?', <>Конторка добавляет графическое изображение подписи или печати. Оно не подтверждает личность подписанта и не является квалифицированной электронной подписью (КЭП). Примет ли документ получатель, зависит от его вида, применимых требований и договорённостей сторон. Если требуется КЭП, используйте соответствующий способ подписания.</>],
    ['security', 'Это безопасно?', <>{billing?.enabled?'PDF и фотографии обрабатываются в браузере при редактировании. Для формирования готового PDF документ и изменения временно передаются на сервер.':'При самостоятельной работе PDF и фотографии обрабатываются в браузере на вашем устройстве.'} При включении улучшенной обработки подписи выбранный фрагмент временно передаётся на сервер и не сохраняется. Word и Excel временно отправляются на сервер для преобразования в PDF; временные файлы удаляются после обработки.<br/><br/>Сохранённые подписи и тексты остаются в браузере или, после входа, в аккаунте. Если вы используете ссылки для подписания другими людьми, документ хранится на сервере до 7 дней.</>],
    ['formats', 'Какие форматы поддерживаются?', <><strong>Документы:</strong> PDF, JPG, JPEG, PNG, DOC, DOCX, XLS и XLSX. Размер файла — до 50 МБ, в PDF — до 100 страниц. Word и Excel преобразуются в PDF на сервере.<br/><br/><strong>Подписи и печати:</strong> PNG, JPG, JPEG, WebP и SVG, до 10 МБ. Итоговый документ скачивается в формате PDF.</>],
    ['pricing', 'Нужно ли платить за скачивание?', <>{billing?.enabled?<>После входа каждому аккаунту доступно одно бесплатное скачивание. Затем можно выбрать платный тариф с подходящим лимитом скачиваний. Если платный тариф уже действует, бесплатное скачивание сохранится до его окончания. <a href="#pricing">Посмотреть тарифы</a>.</>:'Пока скачивание доступно бесплатно и без регистрации. Условия тарифов указаны выше.'}</>],
    ['prices', 'Почему наши цены ниже, чем у конкурентов?', <>{billing?.enabled?'Вы можете выбрать дневной, месячный или годовой тариф с подходящим лимитом скачиваний. Все действующие цены и условия указаны в разделе тарифов выше.':'Сейчас скачивание документов бесплатно и без регистрации. Условия будущих тарифов указаны выше.'}</>],
    ['feedback', 'Не хватает какого-то функционала, чтобы пользоваться сервисом?', <>Расскажите, что вам нужно улучшить или добавить. Оставьте обращение через <button className="faq-feedback-link" type="button" onClick={onFeedback}>форму обратной связи</button> или напишите на <a href="mailto:support@xn--80ataleboo.xn--p1ai">support@конторка.рф</a>.</>],
  ];
}

export default function Landing({onChoose,onDropFile,onExample,onFeedback,busy,error}) {
  const [dragging,setDragging]=useState(false), [dropError,setDropError]=useState(''), [requestedTool,setRequestedTool]=useState(null);
  const {user,openAccount}=useAccount(),[billing]=useBillingStatus();
  const questions=getQuestions(billing,onFeedback);
  const onDrop=e=>{e.preventDefault();setDragging(false);if(busy)return;const files=e.dataTransfer.files;if(files.length!==1){setDropError('Перетащите один файл. Остальные страницы можно добавить в редакторе.');return}setDropError('');onDropFile(files[0])};
  const choose=mode=>{setDropError('');onChoose(mode)};
  return <div className="landing">
    <a className="home-skip" href="#main">Перейти к содержимому</a>
    <header className="home-header"><Brand/><nav aria-label="Главное меню"><CapabilitiesMenu busy={busy} onChoose={()=>choose('self')} onDemo={name=>setRequestedTool({name})}/><a className="home-nav-link" href="#how">Как это работает</a><a className="home-nav-link" href="#questions">Вопросы</a></nav><AccountButton/><button className="home-header-action" disabled={busy} onClick={()=>choose('self')}>Открыть документ <Glyph name="arrow"/></button></header>
    <main id="main">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <h1 id="home-title">Подписывайте<br/><span>документы онлайн.</span></h1>
          <p>Заполните документ, добавьте подпись или печать и скачайте готовый PDF.</p>
          <ul className="home-benefits"><li><Glyph name="check"/>PDF, Word, Excel и фотографии</li><li><Glyph name="check"/>Без принтера и сканера</li></ul>
          <button className="home-button home-hero-action" disabled={busy} onClick={()=>choose('self')}>Подписать документ <Glyph name="arrow"/></button>
        </div>
        <div className={'home-upload '+(dragging?'is-dragging':'')} onDragEnter={e=>{e.preventDefault();if(e.dataTransfer.types.includes('Files'))setDragging(true)}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect=busy?'none':'copy'}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragging(false)}} onDrop={onDrop} aria-busy={busy}>
          <div className="home-upload-icon"><Glyph name="upload" width="30" height="30"/></div><h2>{busy?'Открываем документ…':dragging?'Отпустите файл здесь':'Начните с документа'}</h2><p>Перетащите файл сюда<br/>{' '}или выберите его на устройстве</p>
          <button className="home-button" disabled={busy} onClick={()=>choose('self')}><Glyph name="plus"/>{busy?'Подождите…':'Выбрать документ'}<Glyph name="arrow"/></button>
          <div className="home-upload-formats" aria-label="Поддерживаемые форматы"><span>PDF</span><span>Word</span><span>Excel</span><span>JPG · PNG</span><span>до 50 МБ</span></div>
          <div className="home-example-link"><button className="home-text-action" disabled={busy} onClick={onExample}>Нет файла? Открыть учебный PDF <Glyph name="arrow"/></button></div>
          {(error||dropError)&&<p className="home-error" role="alert">{dropError||error}</p>}
        </div>
      </section>
      <EditorDemo onExample={onExample} busy={busy} requestedTool={requestedTool}/>
      <FeatureGallery/>
      <section className="home-how" id="how" aria-labelledby="how-title"><div className="home-section-intro"><h2 id="how-title">Три шага.<br/>И документ готов.</h2><p>Заявление, анкета или договор —<br/>всё делается в одном окне.</p></div><ol className="home-steps"><li><span>1</span><div><h3>Откройте документ</h3><p>Выберите файл на компьютере или телефоне. Страницы появятся в редакторе.</p></div></li><li><span>2</span><div><h3>Добавьте нужное</h3><p>Подпись, печать, текст или галочку. Перемещайте элементы и меняйте их размер.</p></div></li><li><span>3</span><div><h3>Скачайте результат</h3><p>Нажмите «Скачать PDF». Документ с вашими изменениями сохранится на устройство.</p></div></li></ol></section>
      <Pricing user={user} openAccount={openAccount} onStartFree={()=>choose('self')}/>
      <section className="home-faq" id="questions" aria-labelledby="questions-title"><div className="faq-intro"><h2 id="questions-title">Всё, что хочется уточнить</h2><p>Ответы о документах, подписях и работе сервиса.</p></div><div className="faq-list">{questions.map(([id,q,a])=><details key={id} id={'question-'+id}><summary><span>{q}</span><Glyph name="plus"/></summary><p>{a}</p></details>)}</div></section>
      <section className="home-bottom"><h2>Осталось только подписать.</h2><button className="home-button" disabled={busy} onClick={()=>choose('self')}>Открыть документ <Glyph name="arrow"/></button></section>
    </main>
    <footer className="home-footer">
      <div className="footer-grid">
        <div className="footer-about"><Brand/><p>Подпись, печать и заполнение документов прямо в браузере.</p><div className="footer-support"><span>Поддержка: <a href="mailto:support@xn--80ataleboo.xn--p1ai">support@конторка.рф</a></span><button type="button" onClick={onFeedback}>Обратная связь <Glyph name="arrow"/></button></div></div>
        <nav className="footer-column" aria-label="Возможности"><h2>Возможности</h2><a href="#how">Все возможности</a>{['Подписать PDF','Подписать Word','Подписать Excel','Поставить печать','Нарисовать подпись'].map(label=><button type="button" key={label} disabled={busy} onClick={()=>choose('self')}>{label}</button>)}</nav>
        <nav className="footer-column" aria-label="Инструменты"><h2>Инструменты</h2>{['Эффект сканера','Подпись без фона','Вырезать подпись со страницы','Добавить текст'].map(label=><button type="button" key={label} disabled={busy} onClick={()=>choose('self')}>{label}</button>)}</nav>
        <nav className="footer-column" aria-label="Документы"><h2>Документы</h2><a href="/policy">Политика конфиденциальности</a><a href="/consent">Согласие на обработку ПДн</a><a href="/offer">Публичная оферта</a><a href="/details">Реквизиты</a>{window.location.hostname==='xn--80ataleboo.xn--p1ai'&&<button type="button" onClick={()=>window.dispatchEvent(new Event('open-privacy-settings'))}>Настройки cookie</button>}</nav>
      </div>
      <div className="footer-bottom"><span>Визуальная подпись не заменяет квалифицированную электронную подпись.</span><span>© {new Date().getFullYear()} Конторка</span></div>
    </footer>
  </div>;
}
