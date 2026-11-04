import React from 'react';

const fmt=n=>new Intl.NumberFormat('ru-RU').format(n||0);
const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format((n||0)/100);

export default function AdminPaymentStats({payments,subscriptions}){
 const plans=subscriptions||{total:0,daily:0,monthly:0,yearly:0,queued:0};
 return <>
  <section className="admin-section"><div><h2>Оплаты</h2><p>Подтверждённые платежи без вычета возвратов; тестовые не учитываются.</p></div><div className="admin-periods admin-payment-periods">{[['Сегодня','today'],['На этой неделе','week'],['В этом месяце','month']].map(([label,key])=><div key={key}><span>{label}</span><strong>{fmt(payments?.[key]?.count)}</strong><small>{money(payments?.[key]?.amount)}</small></div>)}</div></section>
  <section className="admin-section"><div><h2>Действующие тарифы</h2><p>Аккаунты с действующим сроком и доступными скачиваниями, без пользователей в архиве.</p></div><div className="admin-periods admin-plan-periods"><div><span>Всего</span><strong>{fmt(plans.total)}</strong></div><div><span>Дневной</span><strong>{fmt(plans.daily)}</strong></div><div><span>Месячный</span><strong>{fmt(plans.monthly)}</strong></div><div><span>Годовой</span><strong>{fmt(plans.yearly)}</strong></div></div>{plans.total>0?<div className="admin-plan-chart" aria-label="Сравнение действующих тарифов">{[['Дневной',plans.daily],['Месячный',plans.monthly],['Годовой',plans.yearly]].map(([name,value])=><div className="admin-plan-chart-row" key={name}><span>{name}</span><div className="admin-plan-chart-track" aria-hidden="true"><i style={{width:(value/Math.max(plans.daily||0,plans.monthly,plans.yearly)*100)+'%'}}/></div><strong>{fmt(value)}</strong></div>)}</div>:<p className="admin-plans-empty">Подключённых тарифов пока нет.</p>}{plans.queued>0&&<p className="admin-plans-queue">Тарифов в очереди: {fmt(plans.queued)}. Они начнут действовать после текущих.</p>}</section>
 </>;
}
