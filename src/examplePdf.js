import {PDFDocument} from 'pdf-lib';

// Synthetic, public example. No customer data or stored signatures are used.
export async function createExamplePdf() {
  await document.fonts.load('500 24px Manrope');
  const canvas=document.createElement('canvas');canvas.width=1190;canvas.height=1684;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1190,1684);
  const text=(value,x,y,size=24,color='#242332',weight=500)=>{ctx.font=`${weight} ${size}px Manrope, Arial, sans-serif`;ctx.fillStyle=color;ctx.fillText(value,x,y)};
  const line=y=>{ctx.strokeStyle='#c9c7d0';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(100,y);ctx.lineTo(1090,y);ctx.stroke()};
  text('ЛИСТ / УЧЕБНЫЙ ДОКУМЕНТ',100,110,20,'#625c70',700);
  text('Попробуйте редактор',100,235,52,'#242332',700);
  text('Этот пример не является заявлением или договором.',100,300);
  text('Добавьте текст, подпись и галочку, затем скачайте PDF.',100,345);
  text('Имя и фамилия',100,480,21,'#625c70');line(565);
  text('Ваш комментарий',100,665,21,'#625c70');line(755);line(835);
  ctx.strokeStyle='#625c70';ctx.strokeRect(100,950,26,26);
  text('Я попробовал(а) инструменты редактора',145,973,25);
  text('Дата',100,1170,21,'#625c70');text('Подпись',680,1170,21,'#625c70');
  ctx.beginPath();ctx.moveTo(100,1280);ctx.lineTo(500,1280);ctx.moveTo(680,1280);ctx.lineTo(1090,1280);ctx.stroke();
  text('Все данные в этом документе учебные.',100,1510,20,'#625c70');
  text('Для возврата на главную нажмите «Новый документ».',100,1550,20,'#625c70');
  const pdf=await PDFDocument.create(), page=pdf.addPage([595,842]);
  page.drawImage(await pdf.embedPng(canvas.toDataURL('image/png')),{x:0,y:0,width:595,height:842});
  return new File([await pdf.save()], 'Учебный документ.pdf', {type:'application/pdf'});
}
