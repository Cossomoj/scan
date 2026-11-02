import {randomUUID} from 'node:crypto';

// All monetary amounts are stored as integer kopecks.
export const PLANS = Object.freeze({
 monthly: {title:'Месячный', price:24900, documents:20, days:30},
 yearly: {title:'Годовой', price:149900, documents:100, days:365},
});
export const DOCUMENT_PRICE = 1000;
export const MIN_TOPUP = 5000;

export function setupBilling(db,{clock=Date.now}={}) {
 db.exec(`CREATE TABLE IF NOT EXISTS billing_wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
  plan TEXT, remaining INTEGER NOT NULL DEFAULT 0 CHECK(remaining >= 0), expires INTEGER
 );
 CREATE TABLE IF NOT EXISTS billing_ledger (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created INTEGER NOT NULL,
  kind TEXT NOT NULL, amount INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '', request_id TEXT,
  UNIQUE(user_id,request_id)
 );
 CREATE TABLE IF NOT EXISTS billing_orders (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
  amount INTEGER NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL,
  transaction_id TEXT UNIQUE, test_mode INTEGER NOT NULL DEFAULT 0
 );
 CREATE TABLE IF NOT EXISTS billing_refunds (
  transaction_id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES billing_orders(id),
  user_id TEXT NOT NULL REFERENCES users(id), amount INTEGER NOT NULL, created INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0, test_mode INTEGER NOT NULL DEFAULT 0
 );
 CREATE TABLE IF NOT EXISTS billing_plan_queue (
  order_id TEXT PRIMARY KEY REFERENCES billing_orders(id), user_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL, created INTEGER NOT NULL
 );
 CREATE TRIGGER IF NOT EXISTS billing_new_user AFTER INSERT ON users BEGIN
  INSERT INTO billing_wallets(user_id,balance) VALUES (NEW.id,1000);
  INSERT INTO billing_ledger(id,user_id,created,kind,amount,detail)
    VALUES ('welcome:' || NEW.id,NEW.id,NEW.created,'welcome',1000,'Бонус при регистрации');
 END;`);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
 const ensure=userId=>{db.prepare('INSERT OR IGNORE INTO billing_wallets(user_id) VALUES (?)').run(userId);return db.prepare('SELECT * FROM billing_wallets WHERE user_id=?').get(userId)};
 const state=userId=>{let w=ensure(userId),active=!!(w.plan&&w.expires>clock()&&w.remaining>0);const pending=db.prepare('SELECT COUNT(*) count,COALESCE(SUM(amount),0) amount FROM billing_refunds WHERE user_id=? AND resolved=0 AND test_mode=0').get(userId);if(!active&&!pending.count){const next=db.prepare('SELECT rowid,* FROM billing_plan_queue WHERE user_id=? ORDER BY created,rowid LIMIT 1').get(userId);if(next){const p=PLANS[next.plan];if(!p)throw Error('Некорректный тариф в очереди.');db.prepare('UPDATE billing_wallets SET plan=?,remaining=?,expires=? WHERE user_id=?').run(next.plan,p.documents,clock()+p.days*86400000,userId);db.prepare('DELETE FROM billing_plan_queue WHERE order_id=?').run(next.order_id);w=ensure(userId);active=true}}const queued=db.prepare('SELECT count(*) n FROM billing_plan_queue WHERE user_id=?').get(userId).n;return {balance:w.balance,plan:active?w.plan:null,remaining:active?w.remaining:0,expires:active?w.expires:null,queued,review:pending.count>0,refundPending:pending.amount}};
 const debit=(userId,requestId,fingerprint='')=>transaction(()=>{
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId||''))throw Error('Некорректный идентификатор операции.');
  const prior=db.prepare('SELECT kind,detail FROM billing_ledger WHERE user_id=? AND request_id=?').get(userId,requestId);
  if(prior){if(prior.detail!==fingerprint)throw Error('Идентификатор операции уже использован для другого документа.');return {kind:prior.kind,...state(userId),repeated:true}}
  if(state(userId).review){const e=Error('Операция приостановлена после возврата. Обратитесь в поддержку.');e.code='REFUND_REVIEW';throw e}
  const w=ensure(userId);let kind;
  if(w.plan&&w.expires>clock()&&w.remaining>0){kind='document_plan';db.prepare('UPDATE billing_wallets SET remaining=remaining-1 WHERE user_id=?').run(userId)}
  else if(w.balance>=DOCUMENT_PRICE){kind='document_balance';db.prepare('UPDATE billing_wallets SET balance=balance-? WHERE user_id=?').run(DOCUMENT_PRICE,userId)}
  else {const e=Error('Недостаточно средств для скачивания документа.');e.code='INSUFFICIENT_FUNDS';throw e}
  db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,?)').run(randomUUID(),userId,clock(),kind,kind==='document_balance'?-DOCUMENT_PRICE:0,fingerprint,requestId);
  return {kind,...state(userId),repeated:false};
 });
 const adjust=(userId,{balance,plan,resolveRefunds})=>transaction(()=>{
  const old=ensure(userId);
  if(balance!==undefined){if(!Number.isSafeInteger(balance)||balance<0||balance>100000000)throw Error('Укажите корректный баланс.');db.prepare('UPDATE billing_wallets SET balance=? WHERE user_id=?').run(balance,userId);db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,NULL)').run(randomUUID(),userId,clock(),'admin_balance',balance-old.balance,'Изменение администратором')}
  if(plan!==undefined){if(plan!==null&&!Object.hasOwn(PLANS,plan))throw Error('Неизвестный тариф.');const p=PLANS[plan];db.prepare('UPDATE billing_wallets SET plan=?,remaining=?,expires=? WHERE user_id=?').run(plan,p?.documents||0,p?clock()+p.days*86400000:null,userId);db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,NULL)').run(randomUUID(),userId,clock(),'admin_plan',0,plan||'Тариф отключён')}
  if(resolveRefunds===true){db.prepare('UPDATE billing_refunds SET resolved=1 WHERE user_id=? AND test_mode=0').run(userId);db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,NULL)').run(randomUUID(),userId,clock(),'admin_refund_review',0,'Возврат проверен администратором')}
  return state(userId);
 });
 const order=(userId,kind,amount,testMode=false)=>transaction(()=>{
  ensure(userId);let sum;if(kind==='topup'){if(!Number.isSafeInteger(amount)||amount<MIN_TOPUP||amount>10000000)throw Error('Минимальное пополнение — 50 ₽.');sum=amount}else if(Object.hasOwn(PLANS,kind))sum=PLANS[kind].price;else throw Error('Неизвестный тариф.');
  const id=randomUUID();db.prepare('INSERT INTO billing_orders VALUES (?,?,?,?,?,?,NULL,?)').run(id,userId,kind,sum,'pending',clock(),testMode?1:0);return {id,userId,kind,amount:sum,testMode};
 });
 const complete=(id,transactionId,{userId,amount,testMode})=>transaction(()=>{
  const o=db.prepare('SELECT * FROM billing_orders WHERE id=?').get(id);
  if(!o||o.user_id!==userId||o.amount!==amount||!!o.test_mode!==!!testMode||!transactionId)throw Error('Параметры платежа не совпадают.');
  if((o.status==='paid'||o.status==='test_paid')&&o.transaction_id===transactionId)return {repeated:true};
  if(o.status!=='pending')throw Error('Заказ уже обработан.');
  if(db.prepare('SELECT 1 FROM billing_orders WHERE transaction_id=?').get(transactionId))throw Error('Платёж уже обработан.');
  db.prepare('UPDATE billing_orders SET status=?,transaction_id=? WHERE id=?').run(testMode?'test_paid':'paid',transactionId,id);
  if(testMode)return {repeated:false,testMode:true};
  ensure(userId);if(o.kind==='topup')db.prepare('UPDATE billing_wallets SET balance=balance+? WHERE user_id=?').run(o.amount,userId);else {if(!PLANS[o.kind])throw Error('Неизвестный тариф.');db.prepare('INSERT INTO billing_plan_queue VALUES (?,?,?,?)').run(o.id,userId,o.kind,clock());state(userId)}
  db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,?)').run(randomUUID(),userId,clock(),o.kind==='topup'?'topup':'plan_purchase',o.kind==='topup'?o.amount:0,o.kind,'payment:'+id);
  return {repeated:false,...state(userId)};
 });
 const getOrder=(id,userId)=>{const o=db.prepare('SELECT id,kind,amount,status FROM billing_orders WHERE id=? AND user_id=?').get(id,userId);return o||null};
 const refund=(paymentTransactionId,refundTransactionId,amount)=>transaction(()=>{
  if(!/^\d{1,30}$/.test(paymentTransactionId||'')||!/^\d{1,30}$/.test(refundTransactionId||'')||!Number.isSafeInteger(amount)||amount<=0)throw Error('Некорректные данные возврата.');
  const existing=db.prepare('SELECT r.*,o.transaction_id payment_id FROM billing_refunds r JOIN billing_orders o ON o.id=r.order_id WHERE r.transaction_id=?').get(refundTransactionId);if(existing){if(existing.amount!==amount||existing.payment_id!==paymentTransactionId)throw Error('Возврат не совпадает с ранее обработанным.');return {repeated:true}}
  const o=db.prepare('SELECT * FROM billing_orders WHERE transaction_id=?').get(paymentTransactionId);if(!o||!['paid','test_paid'].includes(o.status))throw Error('Платёж не найден.');
  const total=db.prepare('SELECT COALESCE(SUM(amount),0) n FROM billing_refunds WHERE order_id=?').get(o.id).n;if(total+amount>o.amount)throw Error('Сумма возвратов превышает платёж.');
  db.prepare('INSERT INTO billing_refunds VALUES (?,?,?,?,?,?,?)').run(refundTransactionId,o.id,o.user_id,amount,clock(),o.test_mode?1:0,o.test_mode);
  if(!o.test_mode&&o.kind!=='topup')db.prepare('DELETE FROM billing_plan_queue WHERE order_id=?').run(o.id);
  db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,?)').run(randomUUID(),o.user_id,clock(),'refund_review',0,'Возврат '+amount+' коп.','refund:'+refundTransactionId);
  return {repeated:false,testMode:!!o.test_mode};
 });
 return {state,debit,adjust,order,complete,getOrder,refund};
}
