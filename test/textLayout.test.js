import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitText} from '../src/textLayout.js';

test('grows short text and scales long text to the remaining page width',()=>{
 assert.deepEqual(fitText(100,400,20),{width:108,aspect:5.4,fontScale:1});
 const long=fitText(1000,200,20);
 assert.equal(long.width,200);assert.equal(long.aspect,10);
 assert.ok(long.fontScale*1000<=192.00001);
 const empty=fitText(0,200,20);assert.equal(empty.fontScale,1);assert.equal(empty.width,70);
});
