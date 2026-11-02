import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setupPaymentSettings} from '../server/paymentSettings.js';

test('YooKassa keys are encrypted, scoped to the shop and separate from legacy settings',()=>{
 const dir=mkdtempSync(join(tmpdir(),'payment-settings-test-')),db=new DatabaseSync(':memory:');
 try{const settings=setupPaymentSettings(db,dir);db.prepare('INSERT INTO payment_settings VALUES (1,?,?)').run('old','old secret');assert.equal(settings.get(),null);
  settings.save({shopId:'123456',mode:'test',secret:'test_example-secret'});assert.ok(!db.prepare('SELECT secret FROM yookassa_settings').get().secret.includes('test_example-secret'));
  settings.save({shopId:'123456',mode:'test'});assert.deepEqual(settings.get(),{shopId:'123456',mode:'test',secret:'test_example-secret'});
  assert.throws(()=>settings.save({shopId:'123457',mode:'test'}));assert.throws(()=>settings.save({shopId:'123456',mode:'live',secret:'test_example-secret'}));
  assert.deepEqual(setupPaymentSettings(db,dir).get(),settings.get());assert.equal(db.prepare('SELECT public_id FROM payment_settings').get().public_id,'old');
 }finally{db.close();unlinkSync(join(dir,'payment-settings-key'));rmdirSync(dir)}
});
