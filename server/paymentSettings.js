import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Keep the key in the persistent data directory, separate from the database.
export function setupPaymentSettings(db,dataDir){
 const keyPath=join(dataDir,'payment-settings-key');let key;
 try{key=readFileSync(keyPath)}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32);try{writeFileSync(keyPath,key,{flag:'wx',mode:0o600})}catch(err){if(err.code!=='EEXIST')throw err;key=readFileSync(keyPath)}}
 if(key.length!==32)throw Error('Invalid payment settings key');
 db.exec('CREATE TABLE IF NOT EXISTS payment_settings (id INTEGER PRIMARY KEY CHECK(id=1), public_id TEXT NOT NULL, secret TEXT NOT NULL)');
 db.exec("CREATE TABLE IF NOT EXISTS yookassa_settings (id INTEGER PRIMARY KEY CHECK(id=1), shop_id TEXT NOT NULL, secret TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('test','live')))");
 const encrypt=value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64')};
 const decrypt=value=>{const data=Buffer.from(value,'base64');const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8')};
 const get=()=>{const row=db.prepare('SELECT * FROM yookassa_settings WHERE id=1').get();return row?{shopId:row.shop_id,secret:decrypt(row.secret),mode:row.mode}:null};
 const save=({shopId,secret,mode})=>{
  if(typeof shopId!=='string'||!/^\d{3,16}$/.test(shopId))throw Error('Укажите числовой shopId ЮKassa.');
  if(!['test','live'].includes(mode))throw Error('Выберите режим магазина.');
  const old=get();
  if(!secret&&old&&old.shopId===shopId&&old.mode===mode)secret=old.secret;
  if(typeof secret!=='string'||secret.length<8||secret.length>512||/[\s:]/.test(secret))throw Error('Укажите секретный ключ ЮKassa.');
  if(mode==='test'&&!secret.startsWith('test_'))throw Error('Для тестового магазина нужен ключ, начинающийся с test_.');
  if(mode==='live'&&!secret.startsWith('live_'))throw Error('Для рабочего магазина нужен ключ, начинающийся с live_.');
  db.prepare('INSERT INTO yookassa_settings VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET shop_id=excluded.shop_id,secret=excluded.secret,mode=excluded.mode').run(shopId,encrypt(secret),mode);
  return {shopId,mode,configured:true};
 };
 return {get,save};
}
