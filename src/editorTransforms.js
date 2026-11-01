export function scanFilter(name,strength='medium'){
 const k={weak:0.55,medium:1,strong:1.6}[strength]||1;
 if(name==='mono')return `grayscale(1) contrast(${1+3*k}) brightness(${1+.03*k})`;
 if(name==='gray')return `grayscale(1) contrast(${1+.28*k}) brightness(${1+.04*k})`;
 if(name==='color')return `contrast(${1+.22*k}) saturate(${1+.18*k}) brightness(${1+.03*k})`;
 if(name==='copy')return `grayscale(1) contrast(${1+1.3*k}) brightness(${1+.10*k})`;
 return 'none';
}
export function cropBoxFromViewport(view,region){
 const a=view.convertToPdfPoint(region.x*view.width,region.y*view.height),b=view.convertToPdfPoint((region.x+region.w)*view.width,(region.y+region.h)*view.height);
 return {x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1])};
}
export function validQuad(points){
 if(!Array.isArray(points)||points.length!==4||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))return false;
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
 const turns=points.map((p,i)=>cross(p,points[(i+1)%4],points[(i+2)%4]));
 return turns.every(v=>v>.0025);
}
export function warpImageData(source,points){
 if(!validQuad(points))throw Error('Расположите четыре угла по порядку, не пересекая стороны.');
 const [p0,p1,p2,p3]=points,{width:sw,height:sh,data}=source;
 const dist=(a,b)=>Math.hypot((a.x-b.x)*sw,(a.y-b.y)*sh);
 const width=Math.max(1,Math.round((dist(p0,p1)+dist(p3,p2))/2)),height=Math.max(1,Math.round((dist(p0,p3)+dist(p1,p2))/2));
 if(width<10||height<10||width*height>12000000)throw Error('Выберите область подходящего размера.');
 const dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y,den=dx1*dy2-dx2*dy1;
 if(Math.abs(den)<1e-9)throw Error('Не удалось выровнять страницу. Проверьте положение углов.');
 const g=(dx3*dy2-dx2*dy3)/den,h=(dx1*dy3-dx3*dy1)/den,a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x,c=p0.x,d=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y,f=p0.y,out=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++){const v=height===1?0:y/(height-1);for(let x=0;x<width;x++){const u=width===1?0:x/(width-1),z=g*u+h*v+1,sx=Math.max(0,Math.min(sw-1,((a*u+b*v+c)/z)*(sw-1))),sy=Math.max(0,Math.min(sh-1,((d*u+e*v+f)/z)*(sh-1))),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(sw-1,x0+1),y1=Math.min(sh-1,y0+1),fx=sx-x0,fy=sy-y0,di=(y*width+x)*4,i00=(y0*sw+x0)*4,i10=(y0*sw+x1)*4,i01=(y1*sw+x0)*4,i11=(y1*sw+x1)*4;for(let k=0;k<4;k++)out[di+k]=data[i00+k]*(1-fx)*(1-fy)+data[i10+k]*fx*(1-fy)+data[i01+k]*(1-fx)*fy+data[i11+k]*fx*fy}}
 return {width,height,data:out};
}
