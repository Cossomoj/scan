const COUNTER = 114023353;
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid'];
export const ANALYTICS_KEY = 'kontorka.analytics.v1';
export const ANALYTICS_REVISION = '2026-11-03-analytics-v1';
let lastView = '';
let currentStage = 'home';
let loaded = false;

export function analyticsChoice() {
  try { const value=JSON.parse(localStorage.getItem(ANALYTICS_KEY)||'null');return value?.choice==='allowed'||value?.choice==='denied'?value:null } catch { return null }
}
export function analyticsContext() {
  return window.location.hostname==='xn--80ataleboo.xn--p1ai' && !/^\/admin\/?$/.test(window.location.pathname) && !/^#\/(?:sign|owner)\//.test(window.location.hash);
}
export function startMetrika() {
  if(loaded||analyticsChoice()?.choice!=='allowed'||!analyticsContext())return;
  window['disableYaCounter'+COUNTER]=false;
  window.ym=window.ym||function(){(window.ym.a=window.ym.a||[]).push(arguments)};
  window.ym.l=Date.now();
  const script=document.createElement('script');script.async=true;script.src='https://mc.yandex.ru/metrika/tag.js?id='+COUNTER;script.dataset.kontorkaMetrika='';document.head.append(script);
  loaded=true;window.ym(COUNTER,'init',{defer:true,webvisor:true,clickmap:true,ecommerce:'dataLayer',accurateTrackBounce:true,trackLinks:true});recordMetrikaView(currentStage);
}
export function stopMetrika() {
  if(loaded&&typeof window.ym==='function')window.ym(COUNTER,'destruct');
  window['disableYaCounter'+COUNTER]=true;
  document.querySelectorAll('script[data-kontorka-metrika]').forEach(el=>el.remove());
  delete window.ym;loaded=false;lastView='';
}

// The editor changes application state without changing the browser URL.
// Report only fixed virtual paths, never filenames or private signing links.
export function recordMetrikaView(stage) {
  if (!['home', 'editor', 'policy', 'consent', 'offer', 'details', 'account-consent', 'analytics-consent'].includes(stage)) return;
  currentStage=stage;
  if (!analyticsContext() || analyticsChoice()?.choice!=='allowed' || typeof window.ym !== 'function') return;

  const url = new URL(stage === 'home' ? '/' : '/' + stage, window.location.origin);
  if (stage === 'home') {
    const current = new URL(window.location.href);
    for (const key of CAMPAIGN_KEYS) {
      if (current.searchParams.has(key)) url.searchParams.set(key, current.searchParams.get(key));
    }
  }
  const options = {title: stage === 'editor' ? 'Редактор документов — Конторка' : document.title};
  if (lastView) {
    options.referer = lastView;
  } else if (document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      options.referer = referrer.origin + '/';
    } catch {}
  }
  window.ym(COUNTER, 'hit', url.href, options);
  lastView = url.href;
}
