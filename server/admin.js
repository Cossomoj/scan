import {createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

const hash=s=>createHash('sha256').update(s).digest('hex');
const cookie=req=>/(?:^|;\s*)zapdf_admin=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie||'')?.[1]||'';
export function setupAdmin(app,db,{clock=Date.now,credential=process.env.ADMIN_CREDENTIAL,production=process.env.NODE_ENV==='production'}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_attempts (ip TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS admin_attempts_created ON admin_attempts(created);
 CREATE TABLE IF NOT EXISTS download_days (day INTEGER PRIMARY KEY,count INTEGER NOT NULL);`);
 const secure=production?'; Secure':'';
 const origin=(req,res,next)=>{const o=req.get('origin');if(o){try{if(new URL(o).host!==req.get('host'))return res.sendStatus(403)}catch{return res.sendStatus(403)}}next()};
 app.use('/api/admin',origin);app.use('/api/metrics',origin);
 const auth=(req,res,next)=>{const token=cookie(req);if(!token||!db.prepare('SELECT 1 FROM admin_sessions WHERE token_hash=? AND expires>?').get(hash(token),clock()))return res.status(401).json({error:'Войдите в кабинет администратора.'});next()};
 app.post('/api/admin/login',(req,res)=>{
  const time=clock();db.prepare('DELETE FROM admin_attempts WHERE created<?').run(time-86400000);
  const attempts=db.prepare('SELECT COUNT(*) n FROM admin_attempts WHERE ip=? AND created>?').get(req.ip,time-15*60000).n;
  const global=db.prepare('SELECT COUNT(*) n FROM admin_attempts WHERE created>?').get(time-15*60000).n;
  if(attempts>=5||global>=50)return res.status(429).json({error:'Слишком много попыток. Повторите через 15 минут.'});
  const [salt,digest]=(credential||'').split(':');const password=req.body?.password,login=req.body?.login;
  let valid=false;if(/^[a-f0-9]{32}$/.test(salt||'')&&/^[a-f0-9]{64}$/.test(digest||'')&&typeof password==='string'&&password.length<=256){const actual=scryptSync(password,Buffer.from(salt,'hex'),32);valid=timingSafeEqual(actual,Buffer.from(digest,'hex'))&&login==='Max'}
  if(!valid){db.prepare('INSERT INTO admin_attempts VALUES (?,?)').run(req.ip,time);return res.status(401).json({error:'Неверный логин или пароль.'})}
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
  res.json({users:{total:Number(db.prepare('SELECT COUNT(*) n FROM users').get().n),today:count('users','created',today),week:count('users','created',week),month:count('users','created',month)},downloads:{total:downloads(0),today:downloads(today),week:downloads(week),month:downloads(month)}});
 });
 app.get('/api/admin/clients',auth,(req,res)=>{const page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page,10)||1)),q=typeof req.query.q==='string'?req.query.q.trim().slice(0,254):'',query='%'+q.replace(/[\\%_]/g,'\\$&')+'%';const total=Number(db.prepare("SELECT COUNT(*) n FROM users WHERE email LIKE ? ESCAPE '\\'").get(query).n);const users=db.prepare(`SELECT u.email,u.created,u.last_seen,
 (SELECT COUNT(*) FROM account_assets a WHERE a.user_id=u.id AND json_extract(a.data,'$.kind') IN ('signature','stamp')) signatures,
 (SELECT COUNT(*) FROM account_assets a WHERE a.user_id=u.id AND json_extract(a.data,'$.kind')='text') texts
 FROM users u WHERE u.email LIKE ? ESCAPE '\\' ORDER BY u.created DESC LIMIT 50 OFFSET ?`).all(query,(page-1)*50);res.json({users,total,page,pages:Math.ceil(total/50)})});
}
