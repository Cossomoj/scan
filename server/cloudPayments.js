import {createHmac,timingSafeEqual} from 'node:crypto';

// CloudPayments signs the exact URL-encoded request body using Content-HMAC.
export function validCloudPaymentsSignature(raw,header,secret){
 if(!Buffer.isBuffer(raw)||typeof header!=='string'||typeof secret!=='string'||!secret)return false;
 const expected=createHmac('sha256',secret).update(raw).digest();
 let received;try{received=Buffer.from(header,'base64')}catch{return false}
 return received.length===expected.length&&timingSafeEqual(received,expected);
}

export function parseCloudPaymentsBody(raw){
 const params=new URLSearchParams(raw.toString('utf8')),payload={};
 for(const [key,value] of params){if(Object.hasOwn(payload,key))throw Error('Duplicate parameter');payload[key]=value}
 return payload;
}
export function parseAmount(value){if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value||''))return null;const parts=value.split('.'),amount=Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0'));return Number.isSafeInteger(amount)?amount:null}

export function validateCloudPaymentsOrder(db,payload){
 const order=db.prepare('SELECT * FROM billing_orders WHERE id=?').get(payload.InvoiceId||'');
 if(!order)return {code:10};
 if(payload.AccountId!==order.user_id)return {code:11};
 const amount=parseAmount(payload.Amount);
 if(amount===null||amount!==order.amount||payload.Currency!=='RUB')return {code:12};
 if(!['0','1'].includes(payload.TestMode)||Number(payload.TestMode)!==order.test_mode)return {code:13};
 if(!['pending','paid','test_paid'].includes(order.status))return {code:13};
 return {code:0,order,amount};
}
