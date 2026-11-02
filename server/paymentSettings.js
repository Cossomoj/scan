import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Keep the key in the persistent data directory, separate from the database.
export function setupPaymentSettings(db,dataDir){
 const keyPath=join(dataDir,'payment-settings-key');let key;
 try{key=readFileSync(keyPath)}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32);try{writeFileSync(keyPath,key,{flag:'wx',mode:0o600})}catch(err){if(err.code!=='EEXIST')throw err;key=readFileSync(keyPath)}}
 if(key.length!==32)throw Error('Invalid payment settings key');
 db.exec('CREATE TABLE IF NOT EXISTS payment_settings (id INTEGER PRIMARY KEY CHECK(id=1), public_id TEXT NOT NULL, secret TEXT NOT NULL)');
 const encrypt=value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64')};
 const decrypt=value=>{const data=Buffer.from(value,'base64');const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8')};
 const get=()=>{const row=db.prepare('SELECT * FROM payment_settings WHERE id=1').get();return row?{publicId:row.public_id,secret:decrypt(row.secret)}:null};
 const save=({publicId,secret})=>{if(typeof publicId!=='string'||!/^[-_a-zA-Z0-9]{5,200}$/.test(publicId))throw Error('Укажите корректный Public ID.');const old=get();if(!secret)secret=old?.secret;if(typeof secret!=='string'||secret.length<5||secret.length>512)throw Error('Укажите API Secret.');db.prepare('INSERT INTO payment_settings VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET public_id=excluded.public_id,secret=excluded.secret').run(publicId,encrypt(secret));return {publicId,configured:true}};
 return {get,save};
}
