export function fitText(measured, available, height){
 const space=Math.max(1,available),width=Math.min(space,Math.max(Math.min(70,space),measured+8));
 return {width,aspect:width/height,fontScale:measured?Math.min(1,Math.max(.001,(width-8)/measured)):1};
}
