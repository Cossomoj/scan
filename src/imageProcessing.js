export function findInkBounds({data,width,height},square=false){
  let x0=width,y0=height,x1=-1,y1=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4, max=Math.max(data[i],data[i+1],data[i+2]), min=Math.min(data[i],data[i+1],data[i+2]);
    if(data[i+3]>30&&(max<190 || (max<235 && max-min>35))){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
  }
  if(x1<0)return {x:.05,y:.05,w:.9,h:.9};
  const pad=Math.max(4,Math.round(Math.max(x1-x0,y1-y0)*.08));
  x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(width,x1+pad);y1=Math.min(height,y1+pad);
  if(square){const side=Math.min(Math.max(x1-x0,y1-y0),width,height),cx=(x0+x1)/2,cy=(y0+y1)/2;x0=Math.max(0,Math.min(width-side,cx-side/2));y0=Math.max(0,Math.min(height-side,cy-side/2));x1=x0+side;y1=y0+side}
  return {x:x0/width,y:y0/height,w:(x1-x0)/width,h:(y1-y0)/height};
}
export function removePaper(imageData,strength){
  const d=imageData.data, amount=Math.max(0,Math.min(100,Number(strength)));
  if(amount===0)return imageData;
  const threshold=12+amount*1.55;
  for(let i=0;i<d.length;i+=4){const darkness=255-Math.min(d[i],d[i+1],d[i+2]);const alpha=Math.min(1,Math.max(0,(darkness-threshold*.2)/(threshold*.8)));d[i+3]=Math.round(d[i+3]*alpha)}
  return imageData;
}
export function previewImage(img,crop,strength,maxWidth=900){
  const sx=Math.round(crop.x*img.naturalWidth),sy=Math.round(crop.y*img.naturalHeight);
  const sw=Math.max(1,Math.round(crop.w*img.naturalWidth)),sh=Math.max(1,Math.round(crop.h*img.naturalHeight));
  const scale=Math.min(1,maxWidth/sw,700/sh),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);ctx.putImageData(removePaper(pixels,strength),0,0);
  return canvas.toDataURL('image/png');
}
export function detectImage(img,square=false){
  const canvas=document.createElement('canvas'),s=Math.min(1,1000/Math.max(img.naturalWidth,img.naturalHeight));
  canvas.width=Math.max(1,Math.round(img.naturalWidth*s));canvas.height=Math.max(1,Math.round(img.naturalHeight*s));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return findInkBounds(ctx.getImageData(0,0,canvas.width,canvas.height),square);
}
