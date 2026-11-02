import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {setupFeedback} from '../server/feedback.js';

test('feedback validates input, sends to the owner and permits a direct reply', async t => {
  const messages = [], consents = [];
  const app = express();
  app.use(express.json());
  setupFeedback(app, {sendMail: async message => messages.push(message),recordConsent:(...args)=>consents.push(args)});
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  const send = (body, origin = base) => fetch(base + '/api/feedback', {
    method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin},
    body: JSON.stringify(body),
  });
  const valid = {topic: 'bug', email: 'reader@example.com', message: 'Не открывается файл', consent: true};
  assert.equal((await send({...valid, consent: false})).status, 400);
  assert.equal((await send({...valid, email: 'test@example.com\r\nBcc:other@example.com'})).status, 400);
  assert.equal((await send({...valid, topic: 'arbitrary'})).status, 400);
  assert.equal((await send({...valid, message: 'x'.repeat(5001)})).status, 400);
  assert.equal((await send(valid, 'https://unrelated.example')).status, 403);
  assert.equal(messages.length, 0);
  assert.equal((await send(valid)).status, 200);
  assert.equal(messages[0].to, 'maksim@kuchermg.ru');
  assert.equal(messages[0].replyTo, 'reader@example.com');
  assert.deepEqual(consents[0],['reader@example.com','feedback','2026-11-03-feedback-v1']);
  assert.match(messages[0].subject, /Сообщить об ошибке/);
  assert.match(messages[0].text, /Не открывается файл/);
  assert.match(messages[0].text, /Согласие: предоставлено в форме обратной связи, редакция от 03\.11\.2026/);
  for (let i = 0; i < 4; i++) assert.equal((await send(valid)).status, 200);
  assert.equal((await send(valid)).status, 429);
  assert.equal(messages.length, 5);
});

test('feedback reports an error when mail delivery fails', async t => {
  const app = express();
  app.use(express.json());
  setupFeedback(app, {sendMail: async () => {throw new Error('smtp failure')}});
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/feedback', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({topic: 'idea', email: 'reader@example.com', message: 'Предложение', consent: true}),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Не удалось отправить/);
});
