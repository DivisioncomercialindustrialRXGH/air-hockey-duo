/** Air Hockey DUO — Cross Arena beta renderer; no gameplay authority here. */
import {CROSS_PATH,CROSS_GOALS,CROSS_SEATS,CROSS_C} from './engine/cross.js?v=5.5.0-cross.1';
const BLUE='#4fe6ff',PINK='#ff4c99';
export function drawCrossBoard(ctx,seat){
  ctx.save();
  const size=900;
  const backdrop=ctx.createRadialGradient(450,450,90,450,450,700);
  backdrop.addColorStop(0,'#13284b');backdrop.addColorStop(1,'#030d1e');
  ctx.fillStyle=backdrop;ctx.fillRect(0,0,size,size);
  ctx.lineWidth=1;ctx.strokeStyle='rgba(90,180,245,.08)';
  for(let q=0;q<=size;q+=50){ctx.beginPath();ctx.moveTo(q,0);ctx.lineTo(q,size);ctx.moveTo(0,q);ctx.lineTo(size,q);ctx.stroke();}
  ctx.translate(CROSS_C,CROSS_C);
  ctx.rotate([Math.PI,0,Math.PI/2,-Math.PI/2][seat]||0);
  ctx.translate(-CROSS_C,-CROSS_C);
  ctx.beginPath();
  ctx.moveTo(...CROSS_PATH[0]);for(let i=1;i<CROSS_PATH.length;i++)ctx.lineTo(...CROSS_PATH[i]);ctx.closePath();
  ctx.save();ctx.clip();
  ctx.fillStyle='#071b31';ctx.fillRect(0,0,900,900);
  const zones=[
    {x:300,y:0,w:300,h:310,blue:true},
    {x:300,y:590,w:300,h:310,blue:true},
    {x:0,y:300,w:310,h:300,blue:false},
    {x:590,y:300,w:310,h:300,blue:false}
  ];
  for(const z of zones){
    const glow=ctx.createLinearGradient(z.x,z.y,z.x+z.w,z.y+z.h);
    glow.addColorStop(0,z.blue?'rgba(20,162,255,.23)':'rgba(255,38,124,.22)');
    glow.addColorStop(1,z.blue?'rgba(20,162,255,.06)':'rgba(255,38,124,.06)');
    ctx.fillStyle=glow;ctx.fillRect(z.x,z.y,z.w,z.h);
  }
  ctx.strokeStyle='rgba(116,209,243,.28)';ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(450,450,114,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='rgba(165,222,255,.14)';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(450,300);ctx.lineTo(450,600);ctx.moveTo(300,450);ctx.lineTo(600,450);ctx.stroke();
  ctx.beginPath();ctx.arc(450,450,28,0,Math.PI*2);ctx.stroke();
  ctx.restore();
  // The border is drawn as individual segments; no invisible bar over a goal.
  ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowColor='#44bbfa';ctx.shadowBlur=12;
  ctx.strokeStyle='#6593bd';ctx.lineWidth=10;
  const mouth=112;
  for(let i=0;i<CROSS_PATH.length;i++){
    const a=CROSS_PATH[i],b=CROSS_PATH[(i+1)%CROSS_PATH.length];
    const top=a[1]===0&&b[1]===0,bot=a[1]===900&&b[1]===900;
    const left=a[0]===0&&b[0]===0,right=a[0]===900&&b[0]===900;
    const vertical=left||right,goal=top||bot||left||right;
    const paths=goal?(vertical?[
      [a,[a[0],Math.max(0,Math.min(900,450+(a[1]<b[1]?-mouth:mouth)))]],
      [[b[0],Math.max(0,Math.min(900,450+(a[1]<b[1]?mouth:-mouth)))],b]
    ]:[
      [a,[Math.max(0,Math.min(900,450+(a[0]<b[0]?-mouth:mouth))),a[1]]],
      [[Math.max(0,Math.min(900,450+(a[0]<b[0]?mouth:-mouth))),b[1]],b]
    ]):[[a,b]];
    for(const [p,q] of paths){ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();}
  }
  ctx.shadowBlur=0;
  for(const goal of CROSS_GOALS){
    ctx.strokeStyle=goal.seat<2?BLUE:PINK;
    ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=16;ctx.lineWidth=13;
    ctx.beginPath();ctx.moveTo(...goal.a);ctx.lineTo(...goal.b);ctx.stroke();
    ctx.shadowBlur=0;ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.75)';ctx.stroke();
  }
  // Names in the physical sectors; UI overlays remain screen-oriented.
  for(const [i,p] of [[0,[450,85]],[1,[450,815]],[2,[110,450]],[3,[790,450]]]){
    ctx.fillStyle=i<2?'rgba(105,233,255,.55)':'rgba(255,128,190,.54)';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 24px system-ui';
    ctx.fillText(CROSS_SEATS[i].name.toUpperCase(),...p);
  }
  ctx.restore();
  ctx.save();ctx.textAlign='center';ctx.font='900 21px system-ui';ctx.fillStyle='rgba(189,230,255,.85)';
  ctx.fillText('TU PORTERÍA',450,861);
  ctx.restore();
}
