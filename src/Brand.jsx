import React from 'react';
import './brand.css';

// Shared mark: a folded document and a single signing stroke.
export function BrandMark(){return <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="1" y="1" width="38" height="38" rx="11" fill="#5844bb"/><path d="M12 8.5h10l6 6v13a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3v-16a3 3 0 0 1 3-3Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/><path d="M22 8.5v6h6M13.5 19h9M13.5 23h4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="m20 25 2.2 2.2L28 21.5" stroke="#ffb5a6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
export default function Brand({className='home-brand'}){return <a href="/" className={className} aria-label="ZaPDF — на главную"><span className="zapdf-mark"><BrandMark/></span><span className="zapdf-name">Za<span>PDF</span></span></a>}
