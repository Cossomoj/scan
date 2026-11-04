import {randomUUID} from 'node:crypto';

// All monetary amounts are stored as integer kopecks.
export const PLANS = Object.freeze({
 daily: {title:'Дневной', price:5000, documents:null, days:1},
 monthly: {title:'Месячный', price:24900, documents:20, days:30},
 yearly: {title:'Годовой', price:149900, documents:100, days:365},
});

export function setupBilling(db,{clock=Date.now}={}) {
 db.exec(`CREATE TABLE IF NOT EXISTS billing_wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
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
  transaction_id TEXT UNIQUE, test_mode INTEGER NOT NULL DEFAULT 0,
  receipt_mode TEXT NOT NULL DEFAULT 'full_prepayment'
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
 CREATE TABLE IF NOT EXISTS billing_receipt_jobs (
  order_id TEXT PRIMARY KEY REFERENCES billing_orders(id),
  created INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  receipt_id TEXT,
  first_attempt INTEGER,
  last_attempt INTEGER
 );
 CREATE TABLE IF NOT EXISTS billing_payment_days (
  day INTEGER PRIMARY KEY, count INTEGER NOT NULL, amount INTEGER NOT NULL
 );
 CREATE TABLE IF NOT EXISTS billing_migrations (name TEXT PRIMARY KEY);
 DROP TRIGGER IF EXISTS billing_new_user;`);
 // Remove the old wallet data while preserving paid-order history and plans.
 db.exec('BEGIN IMMEDIATE');
 try{
  // Orders created before this migration were sent with full prepayment.
  if(!db.prepare('PRAGMA table_info(billing_orders)').all().some(column=>column.name==='receipt_mode')){
   db.exec("ALTER TABLE billing_orders ADD COLUMN receipt_mode TEXT NOT NULL DEFAULT 'full_prepayment'");
  }
  if(db.prepare("PRAGMA table_info(billing_wallets)").all().some(column=>column.name==='balance')){
   db.exec('ALTER TABLE billing_wallets DROP COLUMN balance');
  }
  db.prepare("DELETE FROM billing_ledger WHERE kind IN ('welcome','admin_balance','document_balance')").run();
  db.prepare("UPDATE billing_orders SET status='canceled' WHERE kind='topup' AND status='pending'").run();
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}};
 const paymentDay=time=>Math.floor((time+10800000)/86400000)*86400000-10800000;
 const addPayment=(time,amount)=>db.prepare('INSERT INTO billing_payment_days(day,count,amount) VALUES (?,1,?) ON CONFLICT(day) DO UPDATE SET count=count+1,amount=amount+excluded.amount').run(paymentDay(time),amount);
 transaction(()=>{
  if(db.prepare("SELECT 1 FROM billing_migrations WHERE name='payment_days_v1'").get())return;
  const previous=db.prepare("SELECT o.amount,COALESCE(l.created,o.created) paid_at FROM billing_orders o LEFT JOIN billing_ledger l ON l.user_id=o.user_id AND l.request_id='payment:'||o.id WHERE o.status='paid' AND o.test_mode=0").all();
  for(const payment of previous)addPayment(payment.paid_at,payment.amount);
  db.prepare("INSERT INTO billing_migrations(name) VALUES ('payment_days_v1')").run();
 });
 const ensure=userId=>{db.prepare('INSERT OR IGNORE INTO billing_wallets(user_id) VALUES (?)').run(userId);return db.prepare('SELECT * FROM billing_wallets WHERE user_id=?').get(userId)};
 const state=userId=>{let w=ensure(userId),active=!!(w.plan&&w.expires>clock()&&(w.plan==='daily'||w.remaining>0));const pending=db.prepare('SELECT COUNT(*) count,COALESCE(SUM(amount),0) amount FROM billing_refunds WHERE user_id=? AND resolved=0 AND test_mode=0').get(userId);if(!active&&!pending.count){const next=db.prepare('SELECT rowid,* FROM billing_plan_queue WHERE user_id=? ORDER BY created,rowid LIMIT 1').get(userId);if(next){const p=PLANS[next.plan];if(!p)throw Error('Некорректный тариф в очереди.');db.prepare('UPDATE billing_wallets SET plan=?,remaining=?,expires=? WHERE user_id=?').run(next.plan,p.documents??0,clock()+p.days*86400000,userId);if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='yookassa_payments'").get()&&db.prepare('SELECT 1 FROM yookassa_payments WHERE order_id=?').get(next.order_id))db.prepare("INSERT OR IGNORE INTO billing_receipt_jobs(order_id,created) SELECT id,? FROM billing_orders WHERE id=? AND test_mode=0 AND receipt_mode='full_prepayment'").run(clock(),next.order_id);db.prepare('DELETE FROM billing_plan_queue WHERE order_id=?').run(next.order_id);w=ensure(userId);active=true}}const queued=db.prepare('SELECT count(*) n FROM billing_plan_queue WHERE user_id=?').get(userId).n;return {plan:active?w.plan:null,remaining:active?(w.plan==='daily'?null:w.remaining):0,expires:active?w.expires:null,queued,review:pending.count>0,refundPending:pending.amount}};
 const stateTransaction=userId=>{db.exec('SAVEPOINT billing_state');try{const result=state(userId);db.exec('RELEASE billing_state');return result}catch(error){db.exec('ROLLBACK TO billing_state; RELEASE billing_state');throw error}};
 const debit=(userId,requestId,fingerprint='')=>transaction(()=>{
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId||''))throw Error('Некорректный идентификатор операции.');
  const prior=db.prepare('SELECT kind,detail FROM billing_ledger WHERE user_id=? AND request_id=?').get(userId,requestId);
  if(prior){if(prior.detail!==fingerprint)throw Error('Идентификатор операции уже использован для другого документа.');return {kind:prior.kind,...stateTransaction(userId),repeated:true}}
  if(stateTransaction(userId).review){const e=Error('Операция приостановлена после возврата. Обратитесь в поддержку.');e.code='REFUND_REVIEW';throw e}
  const w=ensure(userId);let kind;
  if(w.plan&&w.expires>clock()&&(w.plan==='daily'||w.remaining>0)){kind='document_plan';if(w.plan!=='daily')db.prepare('UPDATE billing_wallets SET remaining=remaining-1 WHERE user_id=?').run(userId)}
  else {const e=Error('Для скачивания выберите тариф.');e.code='INSUFFICIENT_FUNDS';throw e}
  db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,?)').run(randomUUID(),userId,clock(),kind,0,fingerprint,requestId);
  return {kind,...stateTransaction(userId),repeated:false};
 });
 const adjust=(userId,{plan,resolveRefunds})=>transaction(()=>{
  ensure(userId);
  if(plan!==undefined){if(plan!==null&&!Object.hasOwn(PLANS,plan))throw Error('Неизвестный тариф.');const p=PLANS[plan];db.prepare('UPDATE billing_wallets SET plan=?,remaining=?,expires=? WHERE user_id=?').run(plan,p?.documents??0,p?clock()+p.days*86400000:null,userId);db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,NULL)').run(randomUUID(),userId,clock(),'admin_plan',0,plan||'Тариф отключён')}
  if(resolveRefunds===true){db.prepare('UPDATE billing_refunds SET resolved=1 WHERE user_id=? AND test_mode=0').run(userId);db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,NULL)').run(randomUUID(),userId,clock(),'admin_refund_review',0,'Возврат проверен администратором')}
  return stateTransaction(userId);
 });
 const order=(userId,kind,amount,testMode=false)=>transaction(()=>{
  ensure(userId);let sum;if(Object.hasOwn(PLANS,kind))sum=PLANS[kind].price;else throw Error('Неизвестный тариф.');
  const id=randomUUID(),receiptMode='full_payment';db.prepare('INSERT INTO billing_orders (id,user_id,kind,amount,status,created,test_mode,receipt_mode) VALUES (?,?,?,?,?,?,?,?)').run(id,userId,kind,sum,'pending',clock(),testMode?1:0,receiptMode);return {id,userId,kind,amount:sum,testMode,receiptMode};
 });
 const complete=(id,transactionId,{userId,amount,testMode})=>transaction(()=>{
  const o=db.prepare('SELECT * FROM billing_orders WHERE id=?').get(id);
  if(!o||o.user_id!==userId||o.amount!==amount||!!o.test_mode!==!!testMode||!transactionId)throw Error('Параметры платежа не совпадают.');
  if((o.status==='paid'||o.status==='test_paid')&&o.transaction_id===transactionId)return {repeated:true};
  if(o.status!=='pending')throw Error('Заказ уже обработан.');
  if(db.prepare('SELECT 1 FROM billing_orders WHERE transaction_id=?').get(transactionId))throw Error('Платёж уже обработан.');
  db.prepare('UPDATE billing_orders SET status=?,transaction_id=? WHERE id=?').run(testMode?'test_paid':'paid',transactionId,id);
  if(testMode)return {repeated:false,testMode:true};
  if(!PLANS[o.kind])throw Error('Неизвестный тариф.');
  ensure(userId);db.prepare('INSERT INTO billing_plan_queue VALUES (?,?,?,?)').run(o.id,userId,o.kind,clock());stateTransaction(userId)
  const paidAt=clock();db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,?)').run(randomUUID(),userId,paidAt,'plan_purchase',0,o.kind,'payment:'+id);addPayment(paidAt,o.amount);
  return {repeated:false,...stateTransaction(userId)};
 });
 const getOrder=(id,userId)=>{const o=db.prepare('SELECT id,kind,amount,status FROM billing_orders WHERE id=? AND user_id=?').get(id,userId);return o||null};
 const downloads=userId=>Number(db.prepare("SELECT COUNT(*) n FROM billing_ledger WHERE user_id=? AND kind='document_plan'").get(userId).n);
 const refund=(paymentTransactionId,refundTransactionId,amount)=>transaction(()=>{
  const validId=value=>/^(?:\d{1,30}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(value||'');
  if(!validId(paymentTransactionId)||!validId(refundTransactionId)||!Number.isSafeInteger(amount)||amount<=0)throw Error('Некорректные данные возврата.');
  const existing=db.prepare('SELECT r.*,o.transaction_id payment_id FROM billing_refunds r JOIN billing_orders o ON o.id=r.order_id WHERE r.transaction_id=?').get(refundTransactionId);if(existing){if(existing.amount!==amount||existing.payment_id!==paymentTransactionId)throw Error('Возврат не совпадает с ранее обработанным.');return {repeated:true}}
  const o=db.prepare('SELECT * FROM billing_orders WHERE transaction_id=?').get(paymentTransactionId);if(!o||!['paid','test_paid'].includes(o.status))throw Error('Платёж не найден.');
  const total=db.prepare('SELECT COALESCE(SUM(amount),0) n FROM billing_refunds WHERE order_id=?').get(o.id).n;if(total+amount>o.amount)throw Error('Сумма возвратов превышает платёж.');
  db.prepare('INSERT INTO billing_refunds VALUES (?,?,?,?,?,?,?)').run(refundTransactionId,o.id,o.user_id,amount,clock(),o.test_mode?1:0,o.test_mode);
  if(!o.test_mode&&o.kind!=='topup')db.prepare('DELETE FROM billing_plan_queue WHERE order_id=?').run(o.id);
  db.prepare('INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,?)').run(randomUUID(),o.user_id,clock(),'refund_review',0,'Возврат '+amount+' коп.','refund:'+refundTransactionId);
  return {repeated:false,testMode:!!o.test_mode};
 });
 return {state:stateTransaction,debit,adjust,order,complete,getOrder,refund,downloads};
}
