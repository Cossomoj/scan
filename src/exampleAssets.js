// Synthetic, session-only assets for the training document. They are never saved
// to the visitor's browser library or account.
export function createExampleAssets(){
 const signature=document.createElement('canvas');signature.width=480;signature.height=150;
 const pen=signature.getContext('2d');pen.strokeStyle='#182028';pen.lineWidth=5;pen.lineCap='round';pen.lineJoin='round';pen.beginPath();pen.moveTo(24,101);pen.bezierCurveTo(68,85,94,25,113,34);pen.bezierCurveTo(131,43,80,110,93,107);pen.bezierCurveTo(112,102,145,45,158,54);pen.bezierCurveTo(173,64,132,106,143,106);pen.bezierCurveTo(156,107,177,64,190,66);pen.bezierCurveTo(205,69,180,103,190,103);pen.bezierCurveTo(202,104,223,70,235,72);pen.bezierCurveTo(249,74,229,101,240,101);pen.bezierCurveTo(253,100,273,80,285,84);pen.bezierCurveTo(297,88,289,96,303,96);pen.bezierCurveTo(320,96,347,82,381,85);pen.moveTo(30,121);pen.bezierCurveTo(122,106,264,108,432,103);pen.stroke();
 const stamp=document.createElement('canvas');stamp.width=stamp.height=700;
 const ink=stamp.getContext('2d');ink.strokeStyle=ink.fillStyle='#2456a0';ink.lineWidth=8;ink.beginPath();ink.arc(350,350,315,0,2*Math.PI);ink.stroke();ink.lineWidth=3;ink.beginPath();ink.arc(350,350,291,0,2*Math.PI);ink.stroke();ink.beginPath();ink.arc(350,350,211,0,2*Math.PI);ink.stroke();
 const arcText=(text,r,center,step,bottom)=>{ink.font=bottom?'600 31px Arial':'600 36px Arial';ink.textAlign='center';ink.textBaseline='middle';[...text].forEach((char,i)=>{const angle=center+(i-(text.length-1)/2)*step*(bottom?-1:1);ink.save();ink.translate(350+Math.cos(angle)*r,350+Math.sin(angle)*r);ink.rotate(angle+(bottom?-Math.PI/2:Math.PI/2));ink.fillText(char,0,0);ink.restore()})};
 arcText('КОНТОРКА.РФ',250,-Math.PI/2,.113,false);arcText('ОБРАЗЕЦ ПЕЧАТИ',250,Math.PI/2,.108,true);ink.textAlign='center';ink.font='600 34px Arial';ink.fillText('ДЛЯ',350,337);ink.font='600 31px Arial';ink.fillText('ДОКУМЕНТОВ',350,382);ink.beginPath();ink.arc(110,350,8,0,Math.PI*2);ink.arc(590,350,8,0,Math.PI*2);ink.fill();
 const asset=(id,name,kind,canvas,widthMm,heightMm)=>{const image=canvas.toDataURL('image/png');return {id,name,kind,image,sourceImage:image,strength:0,widthMm,heightMm,temporaryExample:true}};
 return [asset('example-stamp','Образец печати','stamp',stamp,45,45),asset('example-signature','Образец подписи','signature',signature,50,15)];
}
