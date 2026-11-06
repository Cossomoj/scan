import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSearchPage} from '../server/seo.js';

test('search pages expose accurate metadata and the home page has useful HTML before JavaScript',()=>{
 const template=readFileSync('index.html','utf8');
 const home=renderSearchPage('/',template);
 assert.match(home,/<h1>Подписывайте документы онлайн<\/h1>/);
 assert.match(home,/Одно скачивание бесплатно после регистрации/);
 assert.match(home,/<link rel="canonical" href="https:\/\/xn--80ataleboo\.xn--p1ai\/">/);
 const policy=renderSearchPage('/policy/',template);
 assert.match(policy,/<title>Политика конфиденциальности — Конторка<\/title>/);
 assert.match(policy,/rel="canonical" href="https:\/\/xn--80ataleboo\.xn--p1ai\/policy"/);
 assert.doesNotMatch(policy,/<h1>Подписывайте документы онлайн<\/h1>/);
 assert.equal(renderSearchPage('/nesushchestvuyushchaya-stranitsa',template),null);
});
