const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Resize relative to the opposite corner, including when the cover is rotated.
export function resizeCover(item,corner,dx,dy,pageWidth,pageHeight){
 const sx=corner.includes('e')?1:-1,sy=corner.includes('s')?1:-1;
 const angle=(item.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const oldWidth=item.width*pageWidth,oldHeight=item.height*pageHeight;
 const localX=c*dx+s*dy,localY=-s*dx+c*dy;
 const maxWidth=angle===0?(sx>0?(1-item.x)*pageWidth:(item.x+item.width)*pageWidth):pageWidth;
 const maxHeight=angle===0?(sy>0?(1-item.y)*pageHeight:(item.y+item.height)*pageHeight):pageHeight;
 const width=clamp(oldWidth+sx*localX,pageWidth*.03,maxWidth);
 const height=clamp(oldHeight+sy*localY,pageHeight*.02,maxHeight);
 const centerX=(item.x+item.width/2)*pageWidth,centerY=(item.y+item.height/2)*pageHeight;
 const ax=-sx*oldWidth/2,ay=-sy*oldHeight/2;
 const anchorX=centerX+c*ax-s*ay,anchorY=centerY+s*ax+c*ay;
 const nx=sx*width/2,ny=sy*height/2;
 const x=clamp((anchorX+c*nx-s*ny-width/2)/pageWidth,0,1-width/pageWidth);
 const y=clamp((anchorY+s*nx+c*ny-height/2)/pageHeight,0,1-height/pageHeight);
 return {x,y,width:width/pageWidth,height:height/pageHeight,aspect:width/height};
}
