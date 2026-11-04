import React, {useEffect, useState} from 'react';
import '@fontsource-variable/inter';
import {createRoot} from 'react-dom/client';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import DocumentEditor from './DocumentEditor.jsx';
import Landing from './Landing.jsx';
import {createExamplePdf} from './examplePdf.js';
import {AccountProvider} from './Account.jsx';
import UploadDialog from './UploadDialog.jsx';
import {prepareDocument} from './prepareDocument.js';
import {recordMetrikaView} from './metrika.js';
import FeedbackDialog from './FeedbackDialog.jsx';
import Policy from './Policy.jsx';
import Consent from './Consent.jsx';
import {Offer,Requisites} from './Offer.jsx';
import PrivacyDocuments from './PrivacyDocuments.jsx';
import PrivacyBanner from './PrivacyBanner.jsx';
import Admin from './Admin.jsx';
import './style.css';
import './editor.css';
import './kontorka-theme.css';
import './editor-layout.css';

pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;

function App(){
 const [file,setFile]=useState(null),[bytes,setBytes]=useState(null),[stage,setStage]=useState('home'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uploadOpen,setUploadOpen]=useState(false),[exampleDocument,setExampleDocument]=useState(false),[feedbackOpen,setFeedbackOpen]=useState(false),[documentVersion,setDocumentVersion]=useState(0);
 useEffect(()=>{recordMetrikaView(stage)},[stage]);
 const pick=async(f,isExample=false)=>{if(!f){setError('Выберите один файл.');return}setBusy(true);setError('');try{const prepared=await prepareDocument(f);setDocumentVersion(v=>v+1);setExampleDocument(isExample);setFile(prepared.file);setBytes(prepared.bytes);setUploadOpen(false);setStage('editor');window.scrollTo(0,0)}catch(e){setError(e.message||'Не удалось открыть файл. Попробуйте снова.')}finally{setBusy(false)}};
 const choose=()=>{setError('');setUploadOpen(true)};
 const home=()=>{window.scrollTo(0,0);setStage('home');setError('');setFile(null);setBytes(null);setExampleDocument(false)};
 const example=async()=>{setBusy(true);setError('');try{await pick(await createExamplePdf(),true)}catch{setError('Не удалось открыть пример. Попробуйте ещё раз или выберите свой PDF.')}finally{setBusy(false)}};
 return <div className={stage==='home'?'metrika-view':'metrika-view ym-hide-content ym-disable-keys ym-disable-submit ym-disable-clickmap'}>
  {stage==='home'&&<Landing onChoose={choose} onDropFile={f=>{setUploadOpen(true);pick(f)}} onExample={example} onFeedback={()=>setFeedbackOpen(true)} busy={busy} error={uploadOpen?'':error}/>}
  {uploadOpen&&<UploadDialog onClose={()=>{setUploadOpen(false);setError('')}} onSelect={f=>pick(f)} busy={busy} error={error}/>}
  {stage==='editor'&&<DocumentEditor key={documentVersion} onNewDocument={()=>{setError('');setUploadOpen(true)}} file={file.name} bytes={bytes} onBack={home} onFeedback={()=>setFeedbackOpen(true)} isExample={exampleDocument}/>}
  {error&&!uploadOpen&&stage==='editor'&&<div className="toast" role="alert">{error}<button onClick={()=>setError('')}>×</button></div>}
  {feedbackOpen&&<FeedbackDialog onClose={()=>setFeedbackOpen(false)}/>}
 </div>;
}
const publicPath=location.pathname.replace(/\/+$/,'');
createRoot(document.getElementById('root')).render(<>{location.pathname==='/admin'?<Admin/>:publicPath==='/policy'?<Policy/>:publicPath==='/consent'?<Consent/>:publicPath==='/account-consent'?<PrivacyDocuments kind="account"/>:publicPath==='/analytics-consent'?<PrivacyDocuments kind="analytics"/>:publicPath==='/offer'?<Offer/>:publicPath==='/details'?<Requisites/>:<AccountProvider><App/></AccountProvider>}<PrivacyBanner/></>);
