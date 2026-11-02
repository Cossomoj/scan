import {createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

const hash=s=>createHash('sha256').update(s).digest('hex');
const cookie=req=>/(?:^|;\s*)zapdf_admin=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie||'')?.[1]||'';
export function setupAdmin(app,db,{clock=Date.now,credential=process.env.ADMIN_CREDENTIAL,production=process.env.NODE_ENV==='production',billing,paymentSettings}={}){
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='archived_at'))db.exec('ALTER TABLE users ADD COLUMN archived_at INTEGER');
 db.exec(`CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_attempts (ip TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS admin_attempts_created ON admin_attempts(created);
 CREATE TABLE IF NOT EXISTS download_days (day INTEGER PRIMARY KEY,count INTEGER NOT NULL);`);
 const secure=production?'; Secure':'';
 let failedLogins=0,loginLocked=false;
 const origin=(req,res,next)=>{const o=req.get('origin');if(o){try{if(new URL(o).host!==req.get('host'))return res.sendStatus(403)}catch{return res.sendStatus(403)}}next()};
 app.use('/api/admin',origin);app.use('/api/metrics',origin);
 const auth=(req,res,next)=>{const token=cookie(req);if(!token||!db.prepare('SELECT 1 FROM admin_sessions WHERE token_hash=? AND expires>?').get(hash(token),clock()))return res.status(401).json({error:'Войдите в кабинет администратора.'});next()};
 app.post('/api/admin/login',(req,res)=>{
  const time=clock();if(loginLocked)return res.status(429).json({error:'Вход заблокирован после пяти неверных попыток. Перезапустите сервер.'});
  const [salt,digest]=(credential||'').split(':');const password=req.body?.password,login=req.body?.login;
  let valid=false;if(/^[a-f0-9]{32}$/.test(salt||'')&&/^[a-f0-9]{64}$/.test(digest||'')&&typeof password==='string'&&password.length<=256){const actual=scryptSync(password,Buffer.from(salt,'hex'),32);valid=timingSafeEqual(actual,Buffer.from(digest,'hex'))&&login==='Max'}
  if(!valid){failedLogins++;db.prepare('DELETE FROM admin_attempts WHERE created<?').run(time-86400000);db.prepare('INSERT INTO admin_attempts VALUES (?,?)').run(req.ip,time);if(failedLogins>=5){loginLocked=true;return res.status(429).json({error:'Вход заблокирован после пяти неверных попыток. Перезапустите сервер.'})}return res.status(401).json({error:'Неверный логин или пароль.'})}
  failedLogins=0;
  db.prepare('DELETE FROM admin_attempts WHERE ip=?').run(req.ip);db.prepare('DELETE FROM admin_sessions WHERE expires<?').run(time);
  const raw=randomBytes(32).toString('base64url');db.prepare('INSERT INTO admin_sessions VALUES (?,?)').run(hash(raw),time+8*3600000);
  res.setHeader('Set-Cookie',`zapdf_admin=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`);res.json({ok:true});
 });
 app.post('/api/admin/logout',auth,(req,res)=>{db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(hash(cookie(req)));res.setHeader('Set-Cookie',`zapdf_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);res.json({ok:true})});
 app.get('/api/admin/session',auth,(_req,res)=>res.json({ok:true}));
 app.post('/api/metrics/download',(_req,res)=>{const day=Math.floor((clock()+10800000)/86400000)*86400000-10800000;db.prepare('INSERT INTO download_days VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1').run(day);res.sendStatus(204)});
 app.get('/api/admin/stats',auth,(_req,res)=>{
  const today=Math.floor((clock()+10800000)/86400000)*86400000-10800000,d=new Date(today+10800000),weekday=(d.getUTCDay()+6)%7,week=today-weekday*86400000,month=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)-10800000;
  const count=(table,column,start)=>Number(db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}>=?`).get(start).n);
  const downloads=start=>Number(db.prepare('SELECT COALESCE(SUM(count),0) n FROM download_days WHERE day>=?').get(start).n);
  const paymentCounts=start=>billing?db.prepare('SELECT COALESCE(SUM(count),0) count,COALESCE(SUM(amount),0) amount FROM billing_payment_days WHERE day>=? AND day<=?').get(start,today):{count:0,amount:0};
  const plans=billing?db.prepare("SELECT COALESCE(SUM(CASE WHEN w.plan='monthly' THEN 1 ELSE 0 END),0) monthly,COALESCE(SUM(CASE WHEN w.plan='yearly' THEN 1 ELSE 0 END),0) yearly FROM billing_wallets w JOIN users u ON u.id=w.user_id WHERE u.archived_at IS NULL AND w.expires>? AND w.remaining>0").get(clock()):{monthly:0,yearly:0};
  const queued=billing?Number(db.prepare('SELECT COUNT(*) n FROM billing_plan_queue q JOIN users u ON u.id=q.user_id WHERE u.archived_at IS NULL').get().n):0;
  res.json({users:{total:Number(db.prepare('SELECT COUNT(*) n FROM users').get().n),today:count('users','created',today),week:count('users','created',week),month:count('users','created',month)},downloads:{total:downloads(0),today:downloads(today),week:downloads(week),month:downloads(month)},payments:{today:paymentCounts(today),week:paymentCounts(week),month:paymentCounts(month)},subscriptions:{monthly:plans.monthly,yearly:plans.yearly,total:plans.monthly+plans.yearly,queued}});
 });
 app.get('/api/admin/clients',auth,(req,res)=>{const page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page,10)||1)),q=typeof req.query.q==='string'?req.query.q.trim().slice(0,254):'',query='%'+q.replace(/[\\%_]/g,'\\$&')+'%',archived=req.query.status==='archived',filter=archived?'IS NOT NULL':'IS NULL';const total=Number(db.prepare(`SELECT COUNT(*) n FROM users WHERE archived_at ${filter} AND email LIKE ? ESCAPE '\\'`).get(query).n);const users=db.prepare(`SELECT u.id,u.email,u.created,u.last_seen,u.archived_at,
 (SELECT COUNT(*) FROM account_assets a WHERE a.user_id=u.id AND json_extract(a.data,'$.kind') IN ('signature','stamp')) signatures,
 (SELECT COUNT(*) FROM account_assets a WHERE a.user_id=u.id AND json_extract(a.data,'$.kind')='text') texts
 FROM users u WHERE u.archived_at ${filter} AND u.email LIKE ? ESCAPE '\\' ORDER BY u.created DESC LIMIT 50 OFFSET ?`).all(query,(page-1)*50).map(u=>({...u,billing:billing?.state(u.id)}));res.json({users,total,page,pages:Math.ceil(total/50)})});
 const tableExists=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 app.post('/api/admin/clients/:id/archive',auth,(req,res)=>{const u=db.prepare('SELECT id,email,archived_at FROM users WHERE id=?').get(req.params.id);if(!u)return res.status(404).json({error:'Пользователь не найден.'});if(u.archived_at!==null)return res.status(409).json({error:'Пользователь уже в архиве.'});db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET archived_at=? WHERE id=?').run(clock(),u.id);if(tableExists('account_sessions'))db.prepare('DELETE FROM account_sessions WHERE user_id=?').run(u.id);if(tableExists('account_codes'))db.prepare('DELETE FROM account_codes WHERE email=?').run(u.email);db.exec('COMMIT');res.json({ok:true})}catch(e){db.exec('ROLLBACK');throw e}});
 app.post('/api/admin/clients/:id/restore',auth,(req,res)=>{const result=db.prepare('UPDATE users SET archived_at=NULL WHERE id=? AND archived_at IS NOT NULL').run(req.params.id);if(!result.changes)return res.status(404).json({error:'Пользователь не найден в архиве.'});res.json({ok:true})});
 app.delete('/api/admin/clients/:id',auth,(req,res)=>{const u=db.prepare('SELECT id,email FROM users WHERE id=?').get(req.params.id);if(!u)return res.status(404).json({error:'Пользователь не найден.'});db.exec('BEGIN IMMEDIATE');try{if(tableExists('billing_orders')&&db.prepare("SELECT 1 FROM billing_orders WHERE user_id=? AND status='pending' AND test_mode=0 LIMIT 1").get(u.id)){db.exec('ROLLBACK');return res.status(409).json({error:'Есть ожидающий платёж. Дождитесь его завершения перед удалением.'})}for(const name of ['billing_refunds','billing_plan_queue','billing_orders','billing_ledger','billing_wallets','account_assets','account_sessions'])if(tableExists(name))db.prepare(`DELETE FROM ${name} WHERE user_id=?`).run(u.id);if(tableExists('account_codes'))db.prepare('DELETE FROM account_codes WHERE email=?').run(u.email);if(tableExists('account_rate'))db.prepare('DELETE FROM account_rate WHERE key=?').run('send-email:'+hash(u.email));db.prepare('DELETE FROM users WHERE id=?').run(u.id);db.exec('COMMIT');res.json({ok:true})}catch(e){db.exec('ROLLBACK');throw e}});
 if(billing)app.post('/api/admin/clients/:id/billing',auth,(req,res)=>{if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(req.params.id))return res.status(404).json({error:'Пользователь не найден.'});const body=req.body||{};if(body.balance===undefined&&body.plan===undefined&&body.resolveRefunds!==true)return res.status(400).json({error:'Укажите баланс или тариф.'});try{return res.json(billing.adjust(req.params.id,{balance:body.balance,plan:body.plan,resolveRefunds:body.resolveRefunds}))}catch(e){return res.status(400).json({error:e.message})}});
 if(paymentSettings){app.get('/api/admin/payment-settings',auth,(_req,res)=>{const settings=paymentSettings.get();res.json({shopId:settings?.shopId||'',mode:settings?.mode||'test',configured:!!settings})});app.put('/api/admin/payment-settings',auth,(req,res)=>{try{res.json(paymentSettings.save(req.body||{}))}catch(e){res.status(400).json({error:e.message})}})}
 return {auth,origin};
}
