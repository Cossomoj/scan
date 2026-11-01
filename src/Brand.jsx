import React from 'react';
import './brand.css';

export function BrandMark(){return <img src="/kontorka-icon.svg" alt="" aria-hidden="true"/>}
export default function Brand({className='home-brand'}){return <a href="/" className={className} aria-label="Конторка — на главную"><span className="zapdf-mark"><BrandMark/></span><span className="zapdf-name">конторка</span></a>}
