import React, {useEffect, useRef, useState} from 'react';
import {useAccount} from './Account.jsx';
import './feedback.css';

export default function FeedbackDialog({onClose}) {
  const {user} = useAccount();
  const [topic, setTopic] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const close = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    return () => { document.body.style.overflow = oldOverflow; previous?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape' && !working) { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab' || !dialog.current) return;
      const nodes = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(node => node.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, working]);

  const submit = async event => {
    event.preventDefault();
    if (working) return;
    setError('');
    setWorking(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({topic, email, message, consent}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось отправить обращение. Попробуйте ещё раз.');
      setSent(true);
    } catch (e) {
      setError(e.message || 'Не удалось отправить обращение. Проверьте соединение и попробуйте ещё раз.');
    } finally { setWorking(false); }
  };

  return <div className="feedback-overlay ym-hide-content ym-disable-clickmap" onMouseDown={event => {if (event.target === event.currentTarget && !working) onClose()}}>
    <section ref={dialog} className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title" aria-describedby="feedback-intro">
      <header className="feedback-header">
        <div><h2 id="feedback-title">Обратная связь</h2><p id="feedback-intro">Расскажите, чем мы можем помочь.</p></div>
        <button ref={close} className="feedback-close" type="button" onClick={onClose} disabled={working} aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </header>
      {sent ? <div className="feedback-success" role="status">
        <span className="feedback-success-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6"/></svg></span>
        <h3>Обращение отправлено</h3>
        <p>Ответим на указанную вами почту.</p>
        <button type="button" className="feedback-submit" onClick={onClose}>Готово</button>
      </div> : <form className="feedback-form ym-disable-submit" onSubmit={submit}>
        <label htmlFor="feedback-topic">Тема обращения</label>
        <select id="feedback-topic" required value={topic} onChange={event => setTopic(event.target.value)}>
          <option value="">Выберите тему</option>
          <option value="question">Вопрос по работе сервиса</option>
          <option value="bug">Сообщить об ошибке</option>
          <option value="idea">Идея для продукта</option>
          <option value="refund">Возврат средств</option>
          <option value="other">Другое</option>
        </select>
        <label htmlFor="feedback-email">Электронная почта</label>
        <input id="feedback-email" className="ym-disable-keys" type="email" autoComplete="email" required maxLength={254} placeholder="name@example.ru" value={email} onChange={event => setEmail(event.target.value)}/>
        <label htmlFor="feedback-message">Сообщение</label>
        <textarea id="feedback-message" className="ym-disable-keys" required maxLength={5000} rows={4} placeholder="Опишите ваш вопрос или предложение" value={message} onChange={event => setMessage(event.target.value)}/>
        <div className="feedback-count" aria-live="off">{message.length} / 5000</div>
        <div className="feedback-consent"><input id="feedback-consent" type="checkbox" required aria-label="Даю согласие на обработку персональных данных для ответа на обращение" checked={consent} onChange={event => setConsent(event.target.checked)}/><span><label htmlFor="feedback-consent">Даю </label><a href="/consent" target="_blank" rel="noopener noreferrer">согласие на обработку персональных данных</a><label htmlFor="feedback-consent"> для ответа на обращение. Ознакомился с </label><a href="/policy" target="_blank" rel="noopener noreferrer">политикой конфиденциальности</a>.</span></div>
        {error && <p className="feedback-error" role="alert">{error}</p>}
        <button type="submit" className="feedback-submit" disabled={working}>{working ? 'Отправляем…' : 'Отправить'}</button>
        <p className="feedback-alternative">Или напишите на <a href="mailto:support@xn--80ataleboo.xn--p1ai">support@конторка.рф</a></p>
      </form>}
    </section>
  </div>;
}
