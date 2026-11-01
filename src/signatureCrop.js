const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

// Coordinates are relative to the original image; opposite corner stays fixed.
export function resizeSignatureCrop(crop,corner,dx,dy){
 const east=corner.includes('e'),south=corner.includes('s');
 const anchorX=east?crop.x:crop.x+crop.w,anchorY=south?crop.y:crop.y+crop.h;
 const maxW=east?1-anchorX:anchorX,maxH=south?1-anchorY:anchorY;
 const w=clamp(crop.w+(east?dx:-dx),Math.min(.04,maxW),maxW);
 const h=clamp(crop.h+(south?dy:-dy),Math.min(.04,maxH),maxH);
 return {x:east?anchorX:anchorX-w,y:south?anchorY:anchorY-h,w,h};
}
