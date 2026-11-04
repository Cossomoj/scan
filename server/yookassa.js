const PAYMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseYooAmount(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)\.\d{2}$/.test(value)) return null;
  const [rubles, kopecks] = value.split('.');
  const amount = Number(rubles) * 100 + Number(kopecks);
  return Number.isSafeInteger(amount) ? amount : null;
}
export const validYooId = value => typeof value === 'string' && PAYMENT_ID.test(value);
export const yooAmount = kopecks => (Math.floor(kopecks / 100) + '.' + String(kopecks % 100).padStart(2, '0'));

export function createYooClient(settings, fetchImpl = fetch) {
  const auth = Buffer.from(settings.shopId + ':' + settings.secret).toString('base64');
  return async (path, {method = 'GET', body, idempotenceKey} = {}) => {
    const headers = {Authorization: 'Basic ' + auth, Accept: 'application/json'};
    if (body) headers['Content-Type'] = 'application/json';
    if (idempotenceKey) headers['Idempotence-Key'] = idempotenceKey;
    const response = await fetchImpl('https://api.yookassa.ru/v3' + path, {
      method, headers, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const error = Error('ЮKassa не приняла запрос. Проверьте настройки магазина.');
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
}

export function createTestPaymentPayload(order, email) {
  const value = yooAmount(order.amount);
  const description = order.kind === 'daily' ? 'Дневной тариф Конторка на 24 часа' : order.kind === 'monthly' ? 'Тариф Конторка на 30 дней' : 'Тариф Конторка на 365 дней';
  return {
    amount: {value, currency: 'RUB'},
    capture: true,
    confirmation: {type: 'redirect', return_url: 'https://xn--80ataleboo.xn--p1ai/?payment_return=' + order.id},
    description,
    metadata: {order_id: order.id, user_id: order.userId},
    receipt: {customer: {email}, items: [{
      description, quantity: '1.00', amount: {value, currency: 'RUB'},
      vat_code: 1, payment_mode: 'full_prepayment', payment_subject: 'service',
    }]},
  };
}

export function createSettlementReceipt(order, email, paymentId) {
  const payment = createTestPaymentPayload(order, email);
  const amount = {value: yooAmount(order.amount), currency: 'RUB'};
  return {
    type: 'payment',
    payment_id: paymentId,
    send: true,
    customer: {email},
    items: payment.receipt.items.map(item => ({...item, payment_mode: 'full_payment'})),
    settlements: [{type: 'prepayment', amount}],
  };
}

export function safeConfirmationUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    return ['yookassa.ru', 'yoomoney.ru'].some(host => url.hostname === host || url.hostname.endsWith('.' + host));
  } catch { return false; }
}

export function matchesYooPayment(payment, order) {
  return !!(payment && order && validYooId(payment.id) && payment.test === (order.test_mode === 1) &&
    payment.metadata?.order_id === order.id && payment.metadata?.user_id === order.user_id &&
    payment.amount?.currency === 'RUB' && parseYooAmount(payment.amount?.value) === order.amount &&
    (order.test_mode === 1 || order.test_mode === 0));
}
