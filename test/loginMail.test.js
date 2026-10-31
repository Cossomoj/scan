import {test} from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {createLoginMessage} from '../server/loginMail.js';

test('login email has the branded sender and a readable matching code in both formats',async()=>{
 const message=createLoginMessage('reader@example.test','123456','no-reply@zapdf.ru');
 assert.deepEqual(message.from,{name:'ZaPDF',address:'no-reply@zapdf.ru'});
 assert.equal(message.subject,'Код входа в ZaPDF');
 assert.match(message.text,/123456/);assert.match(message.html,/123456/);
 assert.doesNotMatch(message.html,/https?:\/\//);
 assert.throws(()=>createLoginMessage('reader@example.test','<script>','no-reply@zapdf.ru'));
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
 const result=await transport.sendMail(message),raw=result.message.toString('utf8');
 assert.match(raw,/From: ZaPDF <no-reply@zapdf\.ru>/);
 assert.match(raw,/Content-Type: multipart\/alternative/);
 assert.match(raw,/Content-Type: text\/plain/);assert.match(raw,/Content-Type: text\/html/);
});
