const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PNG_DATA_LENGTH = 1_300_000;
const SVG_ELEMENTS = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','clipPath','mask','linearGradient','radialGradient','stop','title','desc']);

export async function rotateSignatureImage(image,turns) {
  const n=((turns%4)+4)%4;
  if(!n) throw new Error('Укажите направление поворота.');
  const canvas=document.createElement('canvas'),w=image.naturalWidth,h=image.naturalHeight;
  canvas.width=n%2?h:w;canvas.height=n%2?w:h;
  const ctx=canvas.getContext('2d');
  if(n===1){ctx.translate(h,0);ctx.rotate(Math.PI/2)}
  else if(n===2){ctx.translate(w,h);ctx.rotate(Math.PI)}
  else {ctx.translate(0,w);ctx.rotate(-Math.PI/2)}
  ctx.drawImage(image,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  canvas.width=canvas.height=1;
  if(!blob)throw new Error('Не удалось повернуть изображение.');
  const url=URL.createObjectURL(blob),rotated=new Image();
  try{await new Promise((resolve,reject)=>{rotated.onload=resolve;rotated.onerror=reject;rotated.src=url});rotated.release=()=>URL.revokeObjectURL(url);return rotated}
  catch(error){URL.revokeObjectURL(url);throw error}
}

function safeSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.doctype || doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Не удалось открыть SVG.');
  for (const element of [doc.documentElement, ...doc.documentElement.querySelectorAll('*')]) {
    if (!SVG_ELEMENTS.has(element.localName)) throw new Error('SVG содержит неподдерживаемые элементы. Сохраните подпись как PNG или JPG.');
    for (const attr of element.attributes) {
      const name = attr.name.toLowerCase(), value = attr.value.toLowerCase();
      if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
      if (name.startsWith('on') || name.endsWith('href') || name === 'xml:base' ||
          /@import|expression\s*\(|javascript:|data:|https?:|file:/i.test(value) ||
          /url\s*\(\s*['"]?(?!#)/i.test(value)) {
        throw new Error('SVG содержит внешние ссылки или неподдерживаемые элементы. Сохраните подпись как PNG или JPG.');
      }
    }
  }
  return new Blob([new XMLSerializer().serializeToString(doc.documentElement)], {type:'image/svg+xml'});
}

export async function loadSignatureImage(file) {
  if (!file || file.size > MAX_FILE_SIZE) throw new Error('Выберите изображение размером не более 10 МБ.');
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let source;
  if (name.endsWith('.png') && bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)) {
    source = new Blob([bytes], {type:'image/png'});
  } else if (/\.jpe?g$/.test(name) && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) {
    source = new Blob([bytes], {type:'image/jpeg'});
  } else if (name.endsWith('.webp') && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') {
    source = new Blob([bytes], {type:'image/webp'});
  } else if (name.endsWith('.svg')) {
    source = safeSvg(new TextDecoder().decode(bytes));
  } else {
    throw new Error('Выберите изображение PNG, JPG, WebP или SVG.');
  }
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Не удалось открыть изображение.'));image.src=url});
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 16000 || image.naturalHeight > 16000 || image.naturalWidth * image.naturalHeight > 25000000) {
      throw new Error('Изображение слишком большое. Уменьшите его и попробуйте снова.');
    }
    image.release=()=>URL.revokeObjectURL(url);
    return image;
  } catch(error) { URL.revokeObjectURL(url); throw error; }
}

export async function signatureFileToPng(file) {
  const image = await loadSignatureImage(file);
  try {
    // Keep the same 8:3 canvas as drawn signatures without stretching the uploaded image.
    for (const width of [800,600,400]) {
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*3/8);
      const scale=Math.min(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
      const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
      canvas.getContext('2d').drawImage(image,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
      const png=canvas.toDataURL('image/png');
      if(png.length<=MAX_PNG_DATA_LENGTH)return png;
    }
    throw new Error('Не удалось уменьшить изображение подписи.');
  } finally { image.release(); }
}
