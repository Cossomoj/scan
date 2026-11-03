import React,{useState} from 'react';

const metrics={users:{label:'Регистрации',description:'Созданные аккаунты, которые сейчас есть в базе, включая архивные.'},downloads:{label:'Скачивания',description:'Нажатия на скачивание, учтённые сервисом.'},payments:{label:'Оплаты',description:'Подтверждённые оплаты; тестовые исключены, возвраты не вычтены.'}};
const number=n=>new Intl.NumberFormat('ru-RU').format(n);
const day=n=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'Europe/Moscow'}).format(n);

export default function AdminCharts({series}){
 const [metric,setMetric]=useState('users'),[period,setPeriod]=useState(30);
 if(!Array.isArray(series)||!series.length)return <section className="admin-section"><h2>Динамика</h2><p>Данные для графика пока недоступны.</p></section>;
 const rows=series.slice(-period),values=rows.map(row=>Number.isFinite(row[metric])?row[metric]:null),known=values.filter(value=>value!==null),missing=known.length!==values.length,maximum=Math.max(1,...known),sum=known.reduce((a,b)=>a+b,0),ticks=[...new Set([0,Math.ceil(maximum/2),maximum])].sort((a,b)=>b-a);
 const left=0,right=668,top=2,bottom=142,plotWidth=right-left,slot=plotWidth/rows.length,bar=Math.min(28,slot*.66),y=value=>bottom-value/maximum*(bottom-top),axisWidth=Math.max(38,number(maximum).length*7+12);
 return <section className="admin-section admin-trends" aria-labelledby="admin-trends-title"><div className="admin-trends-heading"><div><h2 id="admin-trends-title">Динамика по дням</h2><p>Московское время · {missing?'по доступным дням':'всего за период'}: <strong>{known.length?number(sum):'—'}</strong></p></div><div className="admin-chart-switch" role="group" aria-label="Период графика">{[7,30].map(n=><button key={n} type="button" aria-pressed={period===n} onClick={()=>setPeriod(n)}>{n} дней</button>)}</div></div>
  <div className="admin-chart-switch admin-metric-switch" role="group" aria-label="Показатель">{Object.entries(metrics).map(([key,item])=><button key={key} type="button" aria-pressed={metric===key} onClick={()=>setMetric(key)}>{item.label}</button>)}</div>
  <p className="admin-chart-description">{metrics[metric].description}</p>
  <div className="admin-chart-plot"><div className="admin-chart-axis" style={{flexBasis:axisWidth}} aria-hidden="true">{ticks.map(t=><span key={t} style={{top:`${(1-t/maximum)*100}%`}}>{number(t)}</span>)}</div><svg className="admin-chart-svg" viewBox="0 0 668 144" preserveAspectRatio="none" role="img" aria-label={`${metrics[metric].label} по дням за ${rows.length} дней. Точные значения доступны в таблице ниже.`}>
   {ticks.map(t=><line key={t} x1={left} x2={right} y1={y(t)} y2={y(t)} className="admin-chart-grid"/>)}
   {rows.map((row,i)=>values[i]===null?<rect key={row.day} x={left+i*slot+(slot-bar)/2} y={bottom-3} width={bar} height="3" className="admin-chart-missing"><title>{day(row.day)}: нет данных</title></rect>:<rect key={row.day} x={left+i*slot+(slot-bar)/2} y={y(values[i])} width={bar} height={bottom-y(values[i])} rx="2" className="admin-chart-bar"><title>{day(row.day)}: {number(values[i])}</title></rect>)}
  </svg>{known.length===0?<p className="admin-chart-empty" style={{left:axisWidth}}>За этот период нет данных</p>:sum===0&&<p className="admin-chart-empty" style={{left:axisWidth}}>За доступные дни операций нет</p>}</div>
  <div className="admin-chart-dates" style={{marginLeft:axisWidth}} aria-hidden="true"><span>{day(rows[0].day)}</span><span>{day(rows[Math.floor((rows.length-1)/2)].day)}</span><span>{day(rows.at(-1).day)}</span></div>
  {missing&&<p className="admin-chart-coverage" style={{marginLeft:axisWidth}}>Серые отметки — дни, за которые нет подтверждённых данных.</p>}<details className="admin-chart-data"><summary>Значения по дням</summary><div><table><thead><tr><th>Дата</th><th>{metrics[metric].label}</th></tr></thead><tbody>{rows.map((row,i)=><tr key={row.day}><td>{day(row.day)}</td><td>{values[i]===null?'Нет данных':number(values[i])}</td></tr>)}</tbody></table></div></details>
 </section>;
}
