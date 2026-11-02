export function setupPrivacy(app,db,{clock=Date.now}={}) {
 db.exec('CREATE TABLE IF NOT EXISTS analytics_consents (id TEXT PRIMARY KEY,revision TEXT NOT NULL,granted_at INTEGER NOT NULL,revoked_at INTEGER)');
 app.post('/api/privacy/analytics-consent',(req,res)=>{
  const origin=req.get('origin');if(origin){try{if(new URL(origin).host!==req.get('host'))return res.sendStatus(403)}catch{return res.sendStatus(403)}}
  const {id,action,revision}=req.body||{};
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||revision!=='2026-11-03-analytics-v1'||!['grant','revoke'].includes(action))return res.sendStatus(400);
  if(action==='grant'){
   const existing=db.prepare('SELECT revoked_at FROM analytics_consents WHERE id=?').get(id);
   if(existing?.revoked_at!==undefined&&existing.revoked_at!==null)return res.sendStatus(409);
   db.prepare('INSERT OR IGNORE INTO analytics_consents(id,revision,granted_at) VALUES (?,?,?)').run(id,revision,clock());
  }else db.prepare('UPDATE analytics_consents SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND revision=?').run(clock(),id,revision);
  res.json({ok:true});
 });
}
