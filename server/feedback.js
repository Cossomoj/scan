import nodemailer from 'nodemailer';
import {validEmail} from './account.js';

const TOPICS = new Map([
  ['question', 'Вопрос по работе сервиса'],
  ['bug', 'Сообщить об ошибке'],
  ['idea', 'Идея для продукта'],
  ['refund', 'Возврат средств'],
  ['other', 'Другое'],
]);
const RECIPIENT = 'maksim@kuchermg.ru';

export function setupFeedback(app, {sendMail, clock = Date.now} = {}) {
  const env = process.env;
  const configured = !!(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM);
  const transport = configured ? nodemailer.createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT), secure: Number(env.SMTP_PORT) === 465,
    requireTLS: Number(env.SMTP_PORT) !== 465, auth: {user: env.SMTP_USER, pass: env.SMTP_PASSWORD},
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  }) : null;
  const send = sendMail || (message => transport.sendMail(message));
  const attempts = new Map();
  const cleanup = () => {
    const now = clock();
    for (const [key, bucket] of attempts) if (bucket.until <= now) attempts.delete(key);
  };
  const timer = setInterval(cleanup, 60 * 60 * 1000);
  timer.unref();

  app.post('/api/feedback', async (req, res) => {
    const origin = req.get('origin');
    if (origin) {
      try {
        if (new URL(origin).host !== req.get('host')) return res.status(403).json({error: 'Запрос отклонён.'});
      } catch { return res.status(403).json({error: 'Запрос отклонён.'}); }
    }
    const {topic, consent} = req.body || {};
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!TOPICS.has(topic)) return res.status(400).json({error: 'Выберите тему обращения.'});
    if (!validEmail(email)) return res.status(400).json({error: 'Укажите корректную электронную почту.'});
    if (!text || text.length > 5000) return res.status(400).json({error: 'Напишите сообщение длиной до 5000 символов.'});
    if (consent !== true) return res.status(400).json({error: 'Подтвердите согласие на обработку данных для ответа.'});
    if (!sendMail && !configured) return res.status(503).json({error: 'Отправка временно недоступна. Напишите нам на support@конторка.рф.'});

    const now = clock();
    let bucket = attempts.get(req.ip);
    if (!bucket || bucket.until <= now) bucket = {count: 0, until: now + 60 * 60 * 1000};
    if (bucket.count >= 5) return res.status(429).json({error: 'Слишком много обращений. Попробуйте позже.'});
    bucket.count++;
    attempts.set(req.ip, bucket);
    try {
      await send({
        from: {name: 'конторка.рф', address: env.SMTP_FROM || 'no-reply@конторка.рф'},
        to: RECIPIENT,
        replyTo: email,
        subject: 'Обратная связь — ' + TOPICS.get(topic),
        text: 'Тема: ' + TOPICS.get(topic) + '\nПочта для ответа: ' + email + '\n\n' + text,
      });
      res.json({ok: true});
    } catch {
      res.status(503).json({error: 'Не удалось отправить обращение. Попробуйте ещё раз или напишите на support@конторка.рф.'});
    }
  });
}
