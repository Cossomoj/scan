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
