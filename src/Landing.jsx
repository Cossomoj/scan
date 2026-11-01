import React, {useRef, useState} from 'react';
import {AccountButton} from './Account.jsx';
import Brand from './Brand.jsx';
import './landing.css';
import './footer.css';

function Glyph({name, ...props}) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/></>,
    file: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8 13h8M8 17h5"/></>,
    pen: <><path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14zM4 14l5 5"/></>,
    text: <><path d="M4 6V4h16v2M12 4v16M8 20h8"/></>,
    clean: <><path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2zM20 17v4m-2-2h4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/></>,
    link: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 1) scale(.9)"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></>,
    move: <><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}


function DemoSignature() {
  return <svg viewBox="0 0 180 70" fill="none" aria-hidden="true"><path d="M7 51C23 40 40 14 48 16c8 3-10 34-16 36-7 2 17-29 25-29 11 1-15 30-8 29 8-2 18-30 23-31 6-1-5 30-9 34-3 2 12-24 20-22 8 2-4 17 1 19 6 1 12-22 20-20 7 1-5 20 1 20 6 0 14-17 18-17 5 0-2 13 4 14 7 2 13-9 22-6M17 60c36-11 95-13 150-9M101 12c9-9 21-7 22-2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

const demoTools = [
  {id:'signature', icon:'pen', title:'Подпись', subtitle:'Разместите там, где нужно', heading:'Ваша подпись. На своём месте.', description:'Загрузите фото или нарисуйте подпись. Меняйте размер и наклон прямо на документе.'},
  {id:'text', icon:'text', title:'Текст', subtitle:'Заполните пустые строки', heading:'Печатайте прямо в документе.', description:'Имя, дата или ответ в анкете — просто выберите место и введите текст. Шаблон сохранять необязательно.'},
  {id:'background', icon:'clean', title:'Убрать фон', subtitle:'Оставьте только подпись', heading:'Бумажный фон — под контролем.', description:'Уберите светлый фон с фотографии подписи или печати. Настройте результат на самом документе.'},
];

function EditorDemo({onExample, busy}) {
  const [tool,setTool]=useState('signature'), [angle,setAngle]=useState(-8), [strength,setStrength]=useState(100), [name,setName]=useState('Анна Смирнова'), [position,setPosition]=useState({x:60,y:66});
  const page=useRef(null), drag=useRef(null);
  const active=demoTools.find(t=>t.id===tool);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const move=e=>{
    if(!drag.current||drag.current.id!==e.pointerId)return;
    const rect=page.current.getBoundingClientRect();
    setPosition({x:clamp(drag.current.x+(e.clientX-drag.current.px)/rect.width*100,5,60),y:clamp(drag.current.y+(e.clientY-drag.current.py)/rect.height*100,16,66)});
  };
  const reset=()=>{setAngle(-8);setStrength(100);setName('Анна Смирнова');setPosition({x:60,y:66})};
  return <section className="home-demo" id="try" aria-labelledby="demo-title">
    <div className="demo-topline"><h2 id="demo-title">Попробуйте прямо здесь</h2><span>Учебный пример · изменения не сохраняются</span></div>
    <div className="demo-workspace">
      <div className="demo-sidebar">
        <div className="demo-tools" role="group" aria-label="Инструменты примера">{demoTools.map(t=><button key={t.id} type="button" aria-pressed={tool===t.id} onClick={()=>setTool(t.id)}><Glyph name={t.icon}/><span><strong>{t.title}</strong><small>{t.subtitle}</small></span><Glyph name="arrow"/></button>)}</div>
        <div className="demo-explanation"><h3>{active.heading}</h3><p>{active.description}</p></div>
        <button className="home-text-action demo-open" disabled={busy} onClick={onExample}>Открыть полный редактор <Glyph name="arrow"/></button>
      </div>
      <div className="demo-preview">
        <div className="demo-document-bar"><span><Glyph name="file"/> Пример.pdf</span><button type="button" className="demo-reset" onClick={reset} aria-label="Сбросить пример" title="Сбросить пример"><Glyph name="reset"/></button></div>
        <div className="demo-paper" ref={page}>
          <div className="demo-paper-head"><strong>КОНТОРКА / ПРИМЕР</strong><span>01</span></div>
          <h3>Заявление</h3><p className="demo-paper-intro">Всё важное — в одном документе.</p>
          <div className="demo-name-row"><span>Имя и фамилия</span>{tool==='text'?<input aria-label="Текст в учебном документе" value={name} maxLength={40} onChange={e=>setName(e.target.value)} placeholder="Введите имя и фамилию"/>:<div className="demo-name-value">{name||'Имя и фамилия'}</div>}</div>
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
        <div className="demo-controls">
          {tool==='signature'&&<label>Наклон подписи <input type="range" min="-30" max="30" value={angle} onChange={e=>setAngle(+e.target.value)}/><output>{angle}°</output></label>}
          {tool==='background'&&<label>Удаление фона <input type="range" min="0" max="100" value={strength} onChange={e=>setStrength(+e.target.value)}/><output>{strength}%</output></label>}
          {tool==='text'&&<p><Glyph name="text"/> Нажмите на имя в документе и введите своё.</p>}
        </div>
      </div>
    </div>
  </section>;
}

const questions = [
  ['Нужно регистрироваться или платить?', 'Нет. Откройте PDF, внесите изменения и скачайте результат. Для работы с документом аккаунт и оплата не нужны.'],
  ['Как добавить свою подпись или печать?', 'В редакторе нажмите «Подпись / печать». Нарисуйте подпись мышью или пальцем либо загрузите изображение PNG, JPG, WebP или SVG. После добавления можно убрать светлый фон, изменить размер и наклон.'],
  ['Можно просто заполнить анкету текстом?', 'Да. Нажмите «Добавить текст», выберите место на странице и печатайте. Сохранять шаблон не нужно. Часто используемый текст можно отдельно сохранить в «Мои тексты». В скачанном PDF добавленный текст будет изображением, поэтому поиск по нему не работает. Исходный текст PDF сервис не редактирует.'],
  ['Где хранится мой документ?', 'Когда вы заполняете и подписываете PDF сами, он обрабатывается в вашем браузере. Без входа подписи и тексты сохраняются в браузере, а после входа — в аккаунте на сервере. Для приглашения других документ загружается на сервер и хранится 7 дней. Передача фото подписи с телефона тоже использует сервер.'],
  ['Какие файлы можно открыть?', 'PDF, JPG, PNG, Word и Excel размером до 50 МБ и до 100 страниц. Word и Excel преобразуются в PDF на сервере и удаляются после обработки. Для приглашения других нужен PDF до 20 МБ без поворота и обрезки страниц.'],
  ['Это электронная подпись?', 'Сервис добавляет в PDF изображение вашей подписи или печати. Это не квалифицированная электронная подпись (КЭП). Если получатель требует КЭП, понадобится другой способ подписания.'],
];

export default function Landing({onChoose,onDropFile,onExample,busy,error}) {
  const [dragging,setDragging]=useState(false), [dropError,setDropError]=useState('');
  const onDrop=e=>{e.preventDefault();setDragging(false);if(busy)return;const files=e.dataTransfer.files;if(files.length!==1){setDropError('Перетащите один файл. Остальные страницы можно добавить в редакторе.');return}setDropError('');onDropFile(files[0])};
  const choose=mode=>{setDropError('');onChoose(mode)};
  return <div className="landing">
    <a className="home-skip" href="#main">Перейти к содержимому</a>
    <header className="home-header"><Brand/><nav aria-label="Главное меню"><a href="#how">Как это работает</a><a href="#questions">Вопросы</a></nav><AccountButton/><button className="home-header-action" disabled={busy} onClick={()=>choose('self')}>Открыть PDF <Glyph name="arrow"/></button></header>
    <main id="main">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-intro"><h1 id="home-title">Ваш PDF.<br/>Ваша <span>подпись.</span></h1><p>Заполняйте и подписывайте документы онлайн.<br className="desktop-break"/> Без принтера, сканера и лишних действий.</p><div className="home-assurances"><span><Glyph name="check"/> Бесплатно</span><span><Glyph name="check"/> Без регистрации</span></div></div>
        <div className={'home-upload '+(dragging?'is-dragging':'')} onDragEnter={e=>{e.preventDefault();if(e.dataTransfer.types.includes('Files'))setDragging(true)}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect=busy?'none':'copy'}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragging(false)}} onDrop={onDrop} aria-busy={busy}>
          <div className="home-upload-icon"><Glyph name="upload" width="30" height="30"/></div><h2>{busy?'Открываем документ…':dragging?'Отпустите файл здесь':'Начните с документа'}</h2><p>Перетащите файл сюда<br/>{' '}или выберите его на устройстве</p>
          <button className="home-button" disabled={busy} onClick={()=>choose('self')}><Glyph name="plus"/>{busy?'Подождите…':'Открыть документ'}<Glyph name="arrow"/></button>
          <small>PDF, фото, Word, Excel · до 50 МБ</small>
          <div className="home-example-link"><button className="home-text-action" disabled={busy} onClick={onExample}>Нет файла? Открыть учебный PDF <Glyph name="arrow"/></button></div>
          {(error||dropError)&&<p className="home-error" role="alert">{dropError||error}</p>}
        </div>
      </section>
      <EditorDemo onExample={onExample} busy={busy}/>
      <section className="home-how" id="how" aria-labelledby="how-title"><div className="home-section-intro"><h2 id="how-title">Три шага.<br/>И документ готов.</h2><p>Заявление, анкета или договор —<br/>всё делается в одном окне.</p></div><ol className="home-steps"><li><span>1</span><div><h3>Откройте PDF</h3><p>Выберите файл на компьютере или телефоне. Страницы появятся в редакторе.</p></div></li><li><span>2</span><div><h3>Добавьте нужное</h3><p>Подпись, печать, текст или галочку. Перемещайте элементы и меняйте их размер.</p></div></li><li><span>3</span><div><h3>Скачайте результат</h3><p>Нажмите «Скачать PDF». Документ с вашими изменениями сохранится на устройство.</p></div></li></ol></section>
      <section className="home-more" aria-label="Дополнительные возможности"><div className="home-local"><Glyph name="shield" width="34" height="34"/><h2>Ваш файл.<br/>Ваш браузер.</h2><p>При самостоятельном заполнении и подписании PDF обрабатывается на вашем устройстве.</p><p className="home-fine-print">Скачайте готовый документ перед закрытием страницы.</p></div><div className="home-invite"><Glyph name="link" width="34" height="34"/><h2>Нужна подпись<br/>другого человека?</h2><p>Укажите участников и передайте каждому личную ссылку. Они смогут подписать документ по очереди.</p><button className="home-text-action" disabled={busy} onClick={()=>choose('others')}>Пригласить подписантов <Glyph name="arrow"/></button><small>Для этого PDF загружается на сервер на 7 дней.</small></div></section>
      <section className="home-faq" id="questions" aria-labelledby="questions-title"><h2 id="questions-title">Всё, что хочется уточнить</h2><div>{questions.map(([q,a],i)=><details key={q} id={'question-'+i}><summary>{q}<Glyph name="plus"/></summary><p>{a}</p></details>)}</div></section>
      <section className="home-bottom"><h2>Осталось только подписать.</h2><button className="home-button" disabled={busy} onClick={()=>choose('self')}>Открыть мой PDF <Glyph name="arrow"/></button></section>
    </main>
    <footer className="home-footer">
      <div className="footer-grid">
        <div className="footer-about"><Brand/><p>Подпись, печать и заполнение документов прямо в браузере.</p><a href="#questions">Помощь с документом <Glyph name="arrow"/></a></div>
        <nav className="footer-column" aria-label="Возможности"><h2>Возможности</h2><a href="#how">Все возможности</a>{['Подписать PDF','Подписать Word','Подписать Excel','Поставить печать','Нарисовать подпись'].map(label=><button type="button" key={label} disabled={busy} onClick={()=>choose('self')}>{label}</button>)}</nav>
        <nav className="footer-column" aria-label="Инструменты"><h2>Инструменты</h2>{['Эффект сканера','Подпись без фона','Вырезать подпись со страницы','Добавить текст'].map(label=><button type="button" key={label} disabled={busy} onClick={()=>choose('self')}>{label}</button>)}</nav>
        <nav className="footer-column" aria-label="О документах"><h2>О документах</h2>{[['Форматы файлов',4],['Хранение документов',3],['Электронная подпись',5],['Частые вопросы',null]].map(([label,index])=><a key={label} href={index===null?'#questions':'#question-'+index} onClick={()=>{if(index!==null){const item=document.getElementById('question-'+index);if(item)item.open=true}}}>{label}</a>)}</nav>
      </div>
      <div className="footer-bottom"><span>Визуальная подпись не заменяет квалифицированную электронную подпись.</span><span>© {new Date().getFullYear()} Конторка</span></div>
    </footer>
  </div>;
}
