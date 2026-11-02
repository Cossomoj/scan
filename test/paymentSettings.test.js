import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setupPaymentSettings} from '../server/paymentSettings.js';

test('payment API secret is encrypted at rest and can be preserved on update',()=>{
 const dir=mkdtempSync(join(tmpdir(),'payment-settings-test-')),db=new DatabaseSync(':memory:');
 try{const settings=setupPaymentSettings(db,dir);assert.equal(settings.get(),null);settings.save({publicId:'test_api_12345',secret:'example-secret-value'});assert.ok(!db.prepare('SELECT secret FROM payment_settings').get().secret.includes('example-secret-value'));settings.save({publicId:'test_api_67890'});assert.deepEqual(settings.get(),{publicId:'test_api_67890',secret:'example-secret-value'});assert.throws(()=>settings.save({publicId:'not a valid id',secret:'secret'}));assert.deepEqual(setupPaymentSettings(db,dir).get(),settings.get())}finally{db.close();unlinkSync(join(dir,'payment-settings-key'));rmdirSync(dir)}
});
