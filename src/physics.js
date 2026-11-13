/** Shared deterministic physics for the Cloudflare room authority. */
export const W = 500, H = 900;
export const PADDLE_R = 37, PUCK_R = 16, GOAL_HALF = 94;
export const WIN_SCORE = 7, TICK_RATE = 60, SEND_RATE = 20;
// El control persigue el dedo rápido, pero su energía de impacto está limitada por separado.
const MAX_PADDLE_SPEED = 4800, MAX_IMPACT_SPEED = 820, MAX_PUCK_SPEED = 1600;
const RADII = { S: 12, M: 16, L: 23 };
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const DEFAULT_SETTINGS = Object.freeze({ mode: 'duel', tournamentSize: 8, puckSize: 'M', maxScore: 7, timeLimit: 120, powers: true });
export const TOURNAMENT_CAP = 32;
export const teamSize = room => room.settings.mode === 'duo' ? 2 : room.settings.mode === 'teams' ? 4 : 1;
export const teamOf = (room, seat) => ['teams','duo'].includes(room.settings.mode) ? (seat < teamSize(room) ? 0 : 1) : room.settings.mode === 'tournament' ? (room.activeSeats?.[0] === seat ? 0 : room.activeSeats?.[1] === seat ? 1 : -1) : seat;
export const paddleSeat = (room, index) => room.settings.mode === 'tournament' ? room.activeSeats?.[index] : index;
export const activePaddle = (room, seat) => room.settings.mode === 'tournament' ? room.activeSeats?.indexOf(seat) ?? -1 : seat;
export const seatsRequired = room => room.settings.mode === 'teams' ? 8 : room.settings.mode === 'duo' ? 4 : room.settings.mode === 'tournament' ? room.settings.tournamentSize : 2;
export function sanitizeSettings(value = {}) {
  return {
    mode: ['duel','duo','teams','tournament'].includes(value.mode) ? value.mode : 'duel',
    tournamentSize: [4,8,16,32].includes(Number(value.tournamentSize)) ? Number(value.tournamentSize) : 8,
    puckSize: Object.hasOwn(RADII, value.puckSize) ? value.puckSize : 'M',
    maxScore: [3, 5, 7, 10, 15].includes(Number(value.maxScore)) ? Number(value.maxScore) : 7,
    timeLimit: [0, 60, 90, 120, 180, 300].includes(Number(value.timeLimit)) ? Number(value.timeLimit) : 120,
    powers: value.powers !== false
  };
}
export function puckRadius(room) {
  return RADII[room.settings?.puckSize || 'M'] * (room.effect?.type === 'giantPuck' ? 1.65 : 1);
}
export function paddleRadius(room, i) {
  return PADDLE_R * (room.effect?.type === 'giantPaddle' && room.effect.owner === i ? 1.42 : 1);
}
function markEvent(room, type, x, y, detail = '') {
  room.lastEvent = { id: (room.lastEvent?.id || 0) + 1, type, x, y, detail };
}
function startingPaddles(mode) {
  const n = mode === 'teams' ? 8 : mode === 'duo' ? 4 : 2;
  const nTeam = n/2;
  return Array.from({length:n}, (_,i) => {
    const side = nTeam > 1 ? (i<nTeam?0:1) : i;
    const x = nTeam > 1 ? ((i%nTeam)+.5)*(W/nTeam) : W/2;
    const y = side === 0 ? H-127 : 127;
    return { x,y,prevX:x,prevY:y,tx:x,ty:y,vx:0,vy:0,contactLocked:false };
  });
}
export function makeRoom(code, settings = {}) {
  const s = sanitizeSettings(settings);
  return {
    code, settings:s, players:Array.from({length:s.mode==='teams'?8:s.mode==='duo'?4:s.mode==='tournament'?s.tournamentSize:2},()=>null),
    activeSeats:s.mode==='tournament'?[]:s.mode==='teams'?[0,1,2,3,4,5,6,7]:s.mode==='duo'?[0,1,2,3]:[0,1],
    tournament:s.mode==='tournament'?{started:false,finished:false,champion:null,round:0,history:[],queue:[],winners:[],stats:{},entrants:[]}:null,
    phase:'waiting', scores:[0,0], winner:null,goalBy:null,phaseEnd:0,pauseMessage:'',lastUsed:Date.now(),
    elapsedMs:0,remainingMs:s.timeLimit?s.timeLimit*1000:null,lastTouch:null,power:null,effect:null,nextPowerAt:0,
    lastEvent:{id:0,type:'init',x:W/2,y:H/2,detail:''},
    paddles:startingPaddles(s.mode),puck:{x:W/2,y:H/2,vx:0,vy:0}
  };
}
export function resetPaddles(room) {
  const replacements = startingPaddles(room.settings.mode);
  room.paddles=replacements;
}
export function boundsForPaddle(room, i) {
  const nTeam=teamSize(room);
  const side=nTeam > 1 ? (i<nTeam?0:1) : i;
  const r=paddleRadius(room,i);
  const laneLeft=nTeam > 1 ? (i%nTeam)*W/nTeam : 0;
  const laneRight=nTeam > 1 ? ((i%nTeam)+1)*W/nTeam : W;
  // En 4 vs 4 cada carril tiene 125 px: una paleta gigante puede casi llenarlo.
  const effectiveR=Math.min(r, (laneRight-laneLeft)/2-3);
  const minX=laneLeft+effectiveR+2, maxX=laneRight-effectiveR-2;
  return {minX,maxX,minY:side===0?H/2+r+5:r+19,maxY:side===0?H-r-19:H/2-r-5};
}
export function serve(room, toward = Math.random() < .5 ? 0 : 1) {
  const angle = (Math.random()-.5)*.68;
  const sign = toward === 0 ? 1 : -1;
  room.puck = { x: W/2, y: H/2, vx: Math.sin(angle)*460, vy: sign*Math.cos(angle)*460 };
}
export function countdown(room, toward) {
  room.phase='countdown'; room.phaseEnd=Date.now()+2200;
  room.goalBy=null; room.winner=null; room.pauseMessage='';
  room.power=null; room.effect=null; room.nextPowerAt=Date.now()+6500;
  resetPaddles(room); serve(room,toward);
}
export function movePaddles(room, dt) {
  room.paddles.forEach((p,i) => {
    p.prevX=p.x; p.prevY=p.y;
    const dx=p.tx-p.x,dy=p.ty-p.y, dist=Math.hypot(dx,dy);
    const fraction=dist>0 ? Math.min(1,MAX_PADDLE_SPEED*dt/dist):0;
    const r=paddleRadius(room,i);
    const b=boundsForPaddle(room,i);
    p.x=clamp(p.x+dx*fraction,b.minX,b.maxX);
    p.y=clamp(p.y+dy*fraction,b.minY,b.maxY);
    // Damp very fast finger jumps for stable impact energy.
    p.vx=clamp((p.x-p.prevX)/dt,-MAX_PADDLE_SPEED,MAX_PADDLE_SPEED);
    p.vy=clamp((p.y-p.prevY)/dt,-MAX_PADDLE_SPEED,MAX_PADDLE_SPEED);
  });
}
function limitSpeed(puck, min=0) {
  const speed=Math.hypot(puck.vx,puck.vy);
  if(speed>MAX_PUCK_SPEED){puck.vx=puck.vx/speed*MAX_PUCK_SPEED;puck.vy=puck.vy/speed*MAX_PUCK_SPEED;}
  else if(speed<min){const dir=Math.atan2(puck.vy||-1,puck.vx||.01);puck.vx=Math.cos(dir)*min;puck.vy=Math.sin(dir)*min;}
}
function bouncePost(room, postX, postY, postR, r) {
  const puck=room.puck;
  const dx=puck.x-postX,dy=puck.y-postY, len=Math.hypot(dx,dy);
  if(len>=r+postR)return false;
  const nx= len<.001 ? (postX<W/2?1:-1) : dx/len;
  const ny= len<.001 ? (postY===0?1:-1) : dy/len;
  puck.x=postX+nx*(r+postR+.2);puck.y=postY+ny*(r+postR+.2);
  const vn=puck.vx*nx+puck.vy*ny;
  if(vn<0){puck.vx-=vn*1.9*nx;puck.vy-=vn*1.9*ny;markEvent(room,'wall',puck.x,puck.y,'post');}
  return true;
}
/**
 * Colisión continua círculo-círculo durante un micro-paso. Detecta también cuando la paleta
 * atraviesa el disco ENTRE dos fotogramas. Solo se aplica una impulsión por contacto y se
 * limita la energía del dedo para impedir pelotas erráticas y rebotes imposibles.
 */
/**
 * Colisión continua círculo-círculo durante un micro-paso. Detecta también cuando la paleta
 * atraviesa el disco ENTRE dos fotogramas. Solo se aplica una impulsión por contacto y se
 * limita la energía del dedo para impedir pelotas erráticas y rebotes imposibles.
 */
function bouncePaddle(room, paddle, index, startX, startY, sub, steps, r, stepDt) {
  const puck=room.puck, pr=paddleRadius(room,index), radius=r+pr;
  const padX0=paddle.prevX+(paddle.x-paddle.prevX)*sub/steps;
  const padY0=paddle.prevY+(paddle.y-paddle.prevY)*sub/steps;
  const padX1=paddle.prevX+(paddle.x-paddle.prevX)*(sub+1)/steps;
  const padY1=paddle.prevY+(paddle.y-paddle.prevY)*(sub+1)/steps;
  const relX=startX-padX0, relY=startY-padY0;
  const relDx=(puck.x-startX)-(padX1-padX0);
  const relDy=(puck.y-startY)-(padY1-padY0);
  const endDist=Math.hypot(puck.x-padX1,puck.y-padY1);
  if(endDist>radius+9)paddle.contactLocked=false;
  if(paddle.contactLocked){
    // Conservar el lado del último impacto. Si el dedo corre sobre el disco,
    // nunca dejar que su normal se invierta y lo expulse hacia atrás.
    if(endDist<radius){
      const nx=paddle.contactNX||0,ny=paddle.contactNY||(index<teamSize(room)?-1:1);
      puck.x=padX1+nx*(radius+.35);
      puck.y=padY1+ny*(radius+.35);
    }
    return;
  }
  const c=relX*relX+relY*relY-radius*radius;
  const a=relDx*relDx+relDy*relDy;
  let contactT=null;
  if(c<=0){contactT=0;}
  else if(a>1e-6){
    const b=2*(relX*relDx+relY*relDy);
    const discriminant=b*b-4*a*c;
    if(discriminant>=0){
      const hit=(-b-Math.sqrt(discriminant))/(2*a);
      if(hit>=0&&hit<=1)contactT=hit;
    }
  }
  if(contactT===null&&endDist<radius)contactT=1;
  if(contactT===null)return;
  const padX=padX0+(padX1-padX0)*contactT;
  const padY=padY0+(padY1-padY0)*contactT;
  let nx=(relX+relDx*contactT),ny=(relY+relDy*contactT);
  const nLen=Math.hypot(nx,ny);
  if(nLen<1e-5){
    nx=puck.vx-paddle.vx;ny=puck.vy-paddle.vy;
    const length=Math.hypot(nx,ny);
    if(length<1e-5){nx=0;ny=index<teamSize(room)?-1:1;}
    else{nx/=-length;ny/=-length;}
  }else{nx/=nLen;ny/=nLen;}
  // La física no usa la velocidad visual máxima del dedo para disparar el disco.
  const padVx=clamp(paddle.vx,-MAX_IMPACT_SPEED,MAX_IMPACT_SPEED);
  const padVy=clamp(paddle.vy,-MAX_IMPACT_SPEED,MAX_IMPACT_SPEED);
  const incoming=(puck.vx-padVx)*nx+(puck.vy-padVy)*ny;
  if(incoming>=-12){
    // Ya se están separando: no disparar otro golpe ni invertir su trayectoria.
    if(endDist<radius){puck.x=padX1+nx*(radius+.3);puck.y=padY1+ny*(radius+.3);}
    return;
  }
  const restitution=.82;
  const impulse=-(1+restitution)*incoming;
  puck.vx+=impulse*nx;puck.vy+=impulse*ny;
  // El desplazamiento lateral no aporta velocidad adicional descontrolada.
  const tangent=(-padVx*ny+padVy*nx)*.055;
  puck.vx-=ny*tangent;puck.vy+=nx*tangent;
  const outgoing=puck.vx*nx+puck.vy*ny;
  if(outgoing<225){puck.vx+=(225-outgoing)*nx;puck.vy+=(225-outgoing)*ny;}
  if(room.effect?.type==='turbo'){puck.vx*=1.18;puck.vy*=1.18;}
  limitSpeed(puck);
  // Posición post-impacto al final del micro-paso, sin teletransportar al otro lado.
  const remaining=(1-contactT)*stepDt;
  puck.x=padX+nx*(radius+.35)+puck.vx*remaining;
  puck.y=padY+ny*(radius+.35)+puck.vy*remaining;
  // Una sola colisión por contacto continuo. Se libera al separarse 7 px.
  paddle.contactLocked=true;
  paddle.contactNX=nx;paddle.contactNY=ny;
  room.lastTouch=index;
  markEvent(room,'hit',puck.x,puck.y,String(index));
}
/** Substepping avoids tunneling across goalposts and through fast-moving paddles. */
export function stepPuck(room, dt) {
  const p=room.puck, r=puckRadius(room);
  const maxMotion=Math.max(Math.hypot(p.vx,p.vy),...room.paddles.map(x=>Math.hypot(x.vx,x.vy)));
  const steps=clamp(Math.ceil((maxMotion*dt)/Math.max(5,r*.48)),2,12);
  const step=dt/steps;
  for(let sub=0;sub<steps;sub++){
    const oldX=p.x,oldY=p.y;
    p.x+=p.vx*step;p.y+=p.vy*step;
    // Gentle glide drag, never strong enough to feel sticky.
    const drag=Math.pow(.9998,step*60);p.vx*=drag;p.vy*=drag;
    if(p.x<r){p.x=r;p.vx=Math.abs(p.vx)*.96;markEvent(room,'wall',p.x,p.y);}
    if(p.x>W-r){p.x=W-r;p.vx=-Math.abs(p.vx)*.96;markEvent(room,'wall',p.x,p.y);}
    const throatLeft=W/2-GOAL_HALF+r+3,throatRight=W/2+GOAL_HALF-r-3;
    if(p.y<r){
      if(p.x<throatLeft || p.x>throatRight){
        p.y=r;p.vy=Math.abs(p.vy)*.96;markEvent(room,'wall',p.x,p.y);
      } else if(p.y < -r*.85 && p.x>=throatLeft && p.x<=throatRight) return 0;
    }
    if(p.y>H-r){
      if(p.x<throatLeft || p.x>throatRight){
        p.y=H-r;p.vy=-Math.abs(p.vy)*.96;markEvent(room,'wall',p.x,p.y);
      } else if(p.y > H+r*.85 && p.x>=throatLeft && p.x<=throatRight) return 1;
    }
    // Goal mouths are openings rather than glowing solid walls.
    for(const y of [0,H])for(const x of [W/2-GOAL_HALF,W/2+GOAL_HALF])bouncePost(room,x,y,8,r);
    room.paddles.forEach((pad,i)=>bouncePaddle(room,pad,i,oldX,oldY,sub,steps,r,step));
    if(p.y < -r*.85 && p.x>=throatLeft && p.x<=throatRight) return 0;
    if(p.y > H+r*.85 && p.x>=throatLeft && p.x<=throatRight) return 1;
    limitSpeed(p);
  }
  return null;
}
export function spawnPower(room, now=Date.now()){
  if(!room.settings.powers||room.power||room.effect||now<room.nextPowerAt)return;
  const types=['turbo','giantPuck','giantPaddle'];
  const type=types[Math.floor(Math.random()*types.length)];
  room.power={ type, x:80+Math.random()*(W-160),y:260+Math.random()*(H-520),expires:now+9000 };
  room.nextPowerAt=now+12000;
  markEvent(room,'spawn',room.power.x,room.power.y,type);
}
export function updatePower(room, now=Date.now()) {
  if(room.effect && now>=room.effect.until){markEvent(room,'effectEnd',W/2,H/2,room.effect.type);room.effect=null;room.nextPowerAt=now+5500;}
  if(room.power && now>=room.power.expires){room.power=null;room.nextPowerAt=now+3000;}
  spawnPower(room,now);
  if(!room.power)return;
  const p=room.puck, power=room.power;
  if(Math.hypot(p.x-power.x,p.y-power.y)>puckRadius(room)+24)return;
  const owner=room.lastTouch??0;
  room.effect={type:power.type,owner,until:now+6500};
  if(power.type==='turbo') {p.vx*=1.3;p.vy*=1.3;limitSpeed(p);}
  markEvent(room,'power',power.x,power.y,power.type);
  room.power=null;
}
