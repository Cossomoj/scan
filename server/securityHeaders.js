// The editor uses inline style attributes for object positioning and blob/data
// URLs for previews and the PDF worker. Yandex hosts are limited to the
// published Metrica endpoint list; payment itself uses a browser redirect.
const metricaHosts = [
 'mc.yandex.ru','mc.yandex.az','mc.yandex.by','mc.yandex.co.il','mc.yandex.com',
 'mc.yandex.com.am','mc.yandex.com.ge','mc.yandex.com.tr','mc.yandex.ee',
 'mc.yandex.fr','mc.yandex.kg','mc.yandex.kz','mc.yandex.lt','mc.yandex.lv',
 'mc.yandex.md','mc.yandex.tj','mc.yandex.tm','mc.yandex.uz',
 'mc.webvisor.com','mc.webvisor.org',
];
const httpsMetrica = metricaHosts.map(host=>`https://${host}`).join(' ');
const wssMetrica = metricaHosts.map(host=>`wss://${host}`).join(' ');
export const contentSecurityPolicy = [
 "default-src 'self'",
 `script-src 'self' 'wasm-unsafe-eval' ${httpsMetrica} https://yastatic.net`,
 "style-src 'self' 'unsafe-inline'",
 `img-src 'self' data: blob: ${httpsMetrica} https://yastatic.net`,
 "font-src 'self' data: blob:",
 `connect-src 'self' ${httpsMetrica} ${wssMetrica}`,
 "worker-src 'self' blob:",
 `frame-src 'self' blob: ${httpsMetrica}`,
 "frame-ancestors 'none'",
 "object-src 'none'",
 "base-uri 'self'",
 "form-action 'self'",
].join('; ');

export function securityHeaders({production=process.env.NODE_ENV==='production'}={}){
 return (_req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cache-Control':'no-store','Content-Security-Policy':contentSecurityPolicy});
  if(production)res.set('Strict-Transport-Security','max-age=31536000');
  next();
 };
}
