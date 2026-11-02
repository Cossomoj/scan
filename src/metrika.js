const COUNTER = 114023353;
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid'];
let lastView = '';

// The editor changes application state without changing the browser URL.
// Report only fixed virtual paths, never filenames or private signing links.
export function recordMetrikaView(stage) {
  if (typeof window.ym !== 'function' || (stage !== 'home' && stage !== 'editor')) return;

  const url = new URL(stage === 'editor' ? '/editor' : '/', window.location.origin);
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
      options.referer = referrer.origin + referrer.pathname;
    } catch {}
  }
  window.ym(COUNTER, 'hit', url.href, options);
  lastView = url.href;
}
