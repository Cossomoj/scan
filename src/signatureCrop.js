const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

// Coordinates are relative to the original image; opposite corner stays fixed.
export function resizeSignatureCrop(crop,corner,dx,dy,square,imageWidth,imageHeight){
 const east=corner.includes('e'),south=corner.includes('s');
 const anchorX=east?crop.x:crop.x+crop.w,anchorY=south?crop.y:crop.y+crop.h;
 const maxW=east?1-anchorX:anchorX,maxH=south?1-anchorY:anchorY;
 let w=clamp(crop.w+(east?dx:-dx),.04,maxW),h=clamp(crop.h+(south?dy:-dy),.04,maxH);
 if(square){
  const maxSide=Math.min(maxW*imageWidth,maxH*imageHeight);
  const minSide=Math.min(maxSide,Math.max(.04*imageWidth,.04*imageHeight));
  const proposed=Math.abs(dx*imageWidth)>=Math.abs(dy*imageHeight)?w*imageWidth:h*imageHeight;
  const side=clamp(proposed,minSide,maxSide);w=side/imageWidth;h=side/imageHeight;
 }
 return {x:east?anchorX:anchorX-w,y:south?anchorY:anchorY-h,w,h};
}
