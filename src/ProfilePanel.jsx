import React,{useEffect,useState} from 'react';
import {listSignatures} from './signatureStore.js';
import {BillingAccount,useBillingStatus} from './Billing.jsx';
import './profile.css';

export default function ProfilePanel({user,onAdd}){
 const [assets,setAssets]=useState(null),[error,setError]=useState(''),[billing]=useBillingStatus();
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{
   try{const items=await listSignatures();if(active){setAssets(items.filter(item=>item.kind==='signature'||item.kind==='stamp'));setError('')}}
   catch{if(active){setAssets([]);setError('Не удалось загрузить подписи. Закройте профиль и попробуйте снова.')}}
  };
  refresh();
  window.addEventListener('account-assets-changed',refresh);
  return ()=>{active=false;window.removeEventListener('account-assets-changed',refresh)};
 },[user.email]);
 const year=Number.isFinite(user.created)?new Date(user.created).getFullYear():null;
 return <div className="profile-content">
  <header className="profile-identity">
   <span className="profile-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg></span>
   <div className="profile-title"><h2 id="account-title">Мой профиль</h2><p>{year?`В Конторке с ${year} года`:'Ваш аккаунт Конторки'}</p></div>
   <div className="profile-contact"><span>Почта для связи</span><strong className="ym-hide-content">{user.email}</strong><p>На эту почту приходят коды для входа и чеки об оплате.</p></div>
  </header>
  <div className="profile-summary">
   <div><strong>{billing?.downloads??'—'}</strong><span>скачиваний по тарифу</span></div>
   <div><strong>{assets?.length??'—'}</strong><span>подписей и печатей</span></div>
  </div>
  <div className="profile-main">
   <section className="profile-library" aria-labelledby="profile-library-title">
    <div className="profile-section-heading"><div><h3 id="profile-library-title">Мои подписи и печати</h3><p>Доступны на всех устройствах после входа.</p></div>{assets&&<span>{assets.length} сохранено</span>}</div>
    {error&&<p className="profile-error" role="alert">{error}</p>}
    {assets===null?<p className="profile-loading" role="status">Загружаем сохранённое…</p>:<div className="profile-assets">
     {assets.map(item=><div className="profile-asset" key={item.id}><div className="profile-image"><img src={item.image} alt=""/></div><span title={item.name}>{item.name|| (item.kind==='stamp'?'Печать':'Подпись')}</span></div>)}
     <button className="profile-add" type="button" onClick={onAdd}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Добавить</span></button>
    </div>}
   </section>
   <BillingAccount status={billing}/>
  </div>
 </div>;
}
