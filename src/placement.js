// Map a clockwise screen angle to a PDF image transform around its centre.
export function imagePlacement(center,width,height,pageRotation,angle=0){
 const rotation=pageRotation-angle,r=rotation*Math.PI/180;
 return {x:center[0]-width/2*Math.cos(r)+height/2*Math.sin(r),y:center[1]-width/2*Math.sin(r)-height/2*Math.cos(r),rotation};
}
