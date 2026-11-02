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
  const {data:d,width,height}=imageData, amount=Math.max(0,Math.min(100,Number(strength)));
  if(amount===0)return imageData;
  // Estimate the colour of the paper rather than assuming it is pure white.
  const hist=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];let count=0;
  for(let i=0;i<d.length;i+=4)if(d[i+3]>128){for(let c=0;c<3;c++)hist[c][d[i+c]]++;count++}
  // A mostly transparent image has no opaque paper to sample: sampling only
  // its coloured strokes would mistake the ink itself for the background.
  const paper=count<d.length/8?[255,255,255]:hist.map(h=>{let total=0;for(let v=0;v<256;v++){total+=h[v];if(total>=count*.9)return v}return 255});
  const threshold=8+amount*1.2;
  // Thin, long grey printed rules are background, even if darker than the paper.
  // Restrict this to narrow horizontal bands so that broad grey ink is retained.
  const lineRows=new Uint8Array(height||0);
  if(width&&height&&width>=30){
    const candidates=new Uint8Array(height),gapLimit=Math.max(2,Math.floor(width*.02));
    for(let y=0;y<height;y++){let start=-1,last=-1;for(let x=0;x<=width;x++){
      const i=(y*width+x)*4,r=d[i],g=d[i+1],b=d[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
      const grey=x<width&&d[i+3]>128&&min>=65&&max<230&&max-min<=18;
      if(grey){if(start<0)start=x;last=x}
      if(start>=0&&(x===width||x-last>gapLimit)){if(last-start+1>=Math.max(25,width*.35))candidates[y]=1;start=-1;last=-1}
    }}
    for(let y=0;y<height;){if(!candidates[y]){y++;continue}let end=y+1;while(end<height&&candidates[end])end++;if(end-y<=Math.max(3,Math.ceil(height*.04)))lineRows.fill(1,y,end);y=end}
  }
  for(let i=0;i<d.length;i+=4){
    const difference=Math.max(paper[0]-d[i],paper[1]-d[i+1],paper[2]-d[i+2]);
    let opacity=Math.min(1,Math.max(0,(difference-threshold*.35)/(threshold*.65)));
    if(width&&lineRows[Math.floor(i/4/width)]){const max=Math.max(d[i],d[i+1],d[i+2]),min=Math.min(d[i],d[i+1],d[i+2]);if(min>=65&&max<230&&max-min<=18)opacity*=Math.max(0,1-amount/35)}
    d[i+3]=Math.round(d[i+3]*opacity);
  }
  return imageData;
}
// Remove long, thin, neutral rules while keeping coloured ink and dark strokes
// that continue through the rule. The optional treatment is intentionally
// conservative: signatures and printed rules can otherwise be indistinguishable.
export function removeSignatureRule(imageData){
  const {data:d,width,height}=imageData;
  if(!width||!height||width<30||height<6)return imageData;
  const neutral=(x,y)=>{if(x<0||x>=width||y<0||y>=height)return false;const i=(y*width+x)*4,r=d[i],g=d[i+1],b=d[i+2];return d[i+3]>50&&Math.max(r,g,b)<165&&Math.max(r,g,b)-Math.min(r,g,b)<=24};
  const ruleFringe=(x,y)=>{const i=(y*width+x)*4,r=d[i],g=d[i+1],b=d[i+2];return d[i+3]>30&&Math.max(r,g,b)<230&&Math.max(r,g,b)-Math.min(r,g,b)<=24};
  const ink=(x,y)=>{if(x<0||x>=width||y<0||y>=height)return false;const i=(y*width+x)*4;return d[i+3]>65&&Math.min(d[i],d[i+1],d[i+2])<190};
  const candidates=new Uint8Array(height),spans=Array.from({length:height},()=>[]),gap=Math.max(2,Math.floor(width*.05)),minimum=Math.max(25,Math.round(width*.35));
  const edgeMargin=Math.max(2,Math.ceil(width*.01)),edgeMinimum=Math.max(25,Math.round(width*.10));
  for(let y=0;y<height;y++){
    let start=-1,last=-1;
    for(let x=0;x<=width;x++){
      if(x<width&&neutral(x,y)){if(start<0)start=x;last=x}
      if(start>=0&&(x===width||x-last>gap)){
        const length=last-start+1,atEdge=start<edgeMargin||last>=width-edgeMargin;
        if(length>=minimum||(atEdge&&length>=edgeMinimum)){candidates[y]=1;spans[y].push([start,last])}
        start=-1;last=-1;
      }
    }
  }
  const maxBand=Math.max(3,Math.ceil(height*.035));
  for(let y=0;y<height;){
    if(!candidates[y]){y++;continue}
    let end=y+1;while(end<height&&candidates[end])end++;
    if(end-y<=maxBand){
      const reach=Math.max(2,Math.min(5,Math.ceil(height*.025)));
      for(let x=0;x<width;x++){
        let above=0,below=0;
        // Ignore the immediate antialiased edge of the printed rule. Preserve
        // a crossing only when ink continues on multiple rows on both sides.
        for(let offset=2;offset<=reach+1;offset++){
          let upper=false,lower=false;
          for(let dx=-1;dx<=1;dx++){
            if(ink(x+dx,y-offset))upper=true;
            if(ink(x+dx,end-1+offset))lower=true;
          }
          if(upper)above++;if(lower)below++;
        }
        if(above>=2&&below>=2)continue;
        let inRule=false;
        for(let row=y;row<end&&!inRule;row++)inRule=spans[row].some(([left,right])=>x>=left&&x<=right);
        if(inRule)for(let row=Math.max(0,y-2);row<Math.min(height,end+2);row++)if(ruleFringe(x,row))d[(row*width+x)*4+3]=0;
      }
    }
    y=end;
  }
  return imageData;
}
export function previewImage(img,crop,strength,maxWidth=900,removeRule=false){
  const sx=Math.round(crop.x*img.naturalWidth),sy=Math.round(crop.y*img.naturalHeight);
  const sw=Math.max(1,Math.round(crop.w*img.naturalWidth)),sh=Math.max(1,Math.round(crop.h*img.naturalHeight));
  const scale=Math.min(1,maxWidth/sw,700/sh),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);removePaper(pixels,strength);if(removeRule)removeSignatureRule(pixels);ctx.putImageData(pixels,0,0);
  return canvas.toDataURL('image/png');
}
export function detectImage(img,square=false){
  const canvas=document.createElement('canvas'),s=Math.min(1,1000/Math.max(img.naturalWidth,img.naturalHeight));
  canvas.width=Math.max(1,Math.round(img.naturalWidth*s));canvas.height=Math.max(1,Math.round(img.naturalHeight*s));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return findInkBounds(ctx.getImageData(0,0,canvas.width,canvas.height),square);
}
