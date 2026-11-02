import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {recordMetrikaView} from '../src/metrika.js';

test('SPA views use fixed paths and never include private URL or referrer data', () => {
  const calls = [];
  global.window = {
    location: new URL('https://xn--80ataleboo.xn--p1ai/?utm_source=search&token=secret#/owner/123/secret'),
    ym: (...args) => calls.push(args),
  };
  global.document = {title: 'Конторка', referrer: 'https://example.com/landing?email=private#token'};
  try {
    recordMetrikaView('home');
    recordMetrikaView('editor');
    recordMetrikaView('created');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(call => call[2]), [
      'https://xn--80ataleboo.xn--p1ai/?utm_source=search',
      'https://xn--80ataleboo.xn--p1ai/editor',
    ]);
    assert.equal(calls[0][3].referer, 'https://example.com/landing');
    assert.equal(calls[1][3].referer, 'https://xn--80ataleboo.xn--p1ai/?utm_source=search');
    assert.ok(!JSON.stringify(calls).includes('secret'));
    assert.ok(!JSON.stringify(calls).includes('private'));
  } finally {
    delete global.window;
    delete global.document;
  }
});

test('counter is not loaded for admin or private signing links', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  function run(pathname, hash = '', hostname = 'xn--80ataleboo.xn--p1ai') {
    const inserted = [];
    const document = {
      scripts: [],
      createElement: () => ({}),
      getElementsByTagName: () => [{parentNode: {insertBefore: node => inserted.push(node)}}],
    };
    const context = {document, location: {pathname, hash, hostname}};
    context.window = context;
    vm.runInNewContext(script, context);
    return {inserted, context};
  }
  assert.equal(run('/admin').inserted.length, 0);
  assert.equal(run('/', '#/sign/id/secret').inserted.length, 0);
  assert.equal(run('/', '#/owner/id/secret').inserted.length, 0);
  assert.equal(run('/', '', 'zapdf.ru').inserted.length, 0);
  const normal = run('/');
  assert.equal(normal.inserted.length, 1);
  assert.equal(normal.inserted[0].src, 'https://mc.yandex.ru/metrika/tag.js?id=114023353');
  assert.equal(normal.context.ym.a[0][0], 114023353);
  assert.equal(normal.context.ym.a[0][1], 'init');
  assert.equal(normal.context.ym.a[0][2].defer, true);
});
