const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

// Rotate the selection along with the image without changing the chosen pixels.
export function rotateSignatureCrop(crop,turns){
 let result={...crop};
 for(let i=0,n=((turns%4)+4)%4;i<n;i++)result={x:1-result.y-result.h,y:result.x,w:result.h,h:result.w};
 return result;
}

// Coordinates are relative to the original image; opposite corner stays fixed.
export function resizeSignatureCrop(crop,corner,dx,dy){
 const east=corner.includes('e'),south=corner.includes('s');
 const anchorX=east?crop.x:crop.x+crop.w,anchorY=south?crop.y:crop.y+crop.h;
 const maxW=east?1-anchorX:anchorX,maxH=south?1-anchorY:anchorY;
 const w=clamp(crop.w+(east?dx:-dx),Math.min(.04,maxW),maxW);
 const h=clamp(crop.h+(south?dy:-dy),Math.min(.04,maxH),maxH);
 return {x:east?anchorX:anchorX-w,y:south?anchorY:anchorY-h,w,h};
}
