const origin='https://xn--80ataleboo.xn--p1ai';
const pages={
 '/': ['Конторка — подписать и заполнить документ онлайн','Добавьте подпись, печать или текст в PDF, Word, Excel и фотографии. Скачайте готовый документ в PDF. Одно скачивание бесплатно после регистрации.'],
 '/policy':['Политика конфиденциальности — Конторка','Как Конторка обрабатывает и защищает персональные данные пользователей сервиса.'],
 '/consent':['Согласие на обработку персональных данных — Конторка','Условия согласия на обработку персональных данных в сервисе Конторка.'],
 '/account-consent':['Согласие на обработку данных для аккаунта — Конторка','Условия обработки данных для создания и использования аккаунта в Конторке.'],
 '/analytics-consent':['Согласие на аналитику — Конторка','Условия обработки данных для аналитики посещений сервиса Конторка.'],
 '/offer':['Публичная оферта — Конторка','Условия предоставления платного доступа к сервису Конторка.'],
 '/details':['Реквизиты — Конторка','Реквизиты исполнителя и контактные данные сервиса Конторка.'],
 '/admin':['Панель администратора — Конторка',''],
};
const escape=s=>s.replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fallback='<main><h1>Подписывайте документы онлайн</h1><p>Заполните документ, добавьте подпись или печать и скачайте готовый PDF.</p><h2>Возможности редактора</h2><p>Добавляйте текст, подпись и печать, убирайте фон подписи, скрывайте данные и обрабатывайте страницы документа. Поддерживаются PDF, Word, Excel и фотографии.</p><h2>Условия и ограничения</h2><p>Одно скачивание бесплатно после регистрации. Для дальнейшей работы доступны платные тарифы с ограничением числа скачиваний.</p><p>Конторка добавляет графическое изображение подписи или печати. Оно не подтверждает личность подписанта и не является квалифицированной электронной подписью.</p><p>Для работы редактора включите JavaScript.</p><p><a href="/policy">Политика конфиденциальности</a> · <a href="/offer">Публичная оферта</a> · <a href="/details">Реквизиты</a></p></main>';
const websiteData={ '@context':'https://schema.org','@type':'WebSite',name:'Конторка.рф',url:origin+'/',description:'Онлайн-сервис для заполнения документов и добавления графической подписи или печати.' };
export function renderSearchPage(path,template){
 const normalized=path.replace(/\/+$/,'')||'/',page=pages[normalized];
 if(!page)return null;
 const [title,description]=page;
 let html=template.replace(/<title>[^<]*<\/title>/,`<title>${escape(title)}</title>`).replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${escape(description)}">`);
 if(normalized!=='/admin')html=html.replace('</head>',`<link rel="canonical" href="${origin}${normalized}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${origin}${normalized}"></head>`);
 if(normalized==='/'){html=html.replace('</head>',`<script type="application/ld+json">${JSON.stringify(websiteData).replace(/</g,'\\u003c')}</script></head>`);html=html.replace('<div id="root"></div>',`<div id="root">${fallback}</div>`)}
 return html;
}
