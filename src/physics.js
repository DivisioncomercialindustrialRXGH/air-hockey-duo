/** Shared deterministic physics for the Cloudflare room authority. */
export const W = 500, H = 900;
export const PADDLE_R = 37, PUCK_R = 16, GOAL_HALF = 94;
export const WIN_SCORE = 7, TICK_RATE = 60, SEND_RATE = 20;
// El control persigue el dedo rápido, pero su energía de impacto está limitada por separado.
// El limite maximo es tambien una proteccion visual para la interpolacion de 20 Hz.
const MAX_PADDLE_SPEED = 2100, MAX_IMPACT_SPEED = 1000;
export const MAX_PUCK_SPEED = 1600;
const BOT_CONFIG = Object.freeze({
  easy:{speed:540,delay:290,error:64},
  hard:{speed:1100,delay:100,error:20},
  god:{speed:1900,delay:28,error:2}
});
const RADII = { S: 12, M: 16, L: 23 };
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const DEFAULT_SETTINGS = Object.freeze({ mode: 'duel', botDifficulty:'hard', tournamentSize: 8, puckSize: 'M', maxScore: 7, timeLimit: 120, powers: true });
export const TOURNAMENT_CAP = 32;
export const teamSize = room => room.settings.mode === 'duo' ? 2 : room.settings.mode === 'teams' ? 4 : 1;
export const teamOf = (room, seat) => ['teams','duo'].includes(room.settings.mode) ? (seat < teamSize(room) ? 0 : 1) : room.settings.mode === 'tournament' ? (room.activeSeats?.[0] === seat ? 0 : room.activeSeats?.[1] === seat ? 1 : -1) : seat;
export const paddleSeat = (room, index) => room.settings.mode === 'tournament' ? room.activeSeats?.[index] : index;
export const activePaddle = (room, seat) => room.settings.mode === 'tournament' ? room.activeSeats?.indexOf(seat) ?? -1 : seat;
export const seatsRequired = room => room.settings.mode === 'teams' ? 8 : room.settings.mode === 'duo' ? 4 : room.settings.mode === 'tournament' ? room.settings.tournamentSize : 2;
export function sanitizeSettings(value = {}) {
  return {
    mode: ['duel','bot','duo','teams','tournament'].includes(value.mode) ? value.mode : 'duel',
    botDifficulty: ['easy','hard','god'].includes(value.botDifficulty) ? value.botDifficulty : 'hard',
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
    bot:s.mode==='bot'?{aimX:W/2,aimY:132,thinkAt:0,iteration:0}:null,
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
    // La IA usa el MISMO movimiento y las MISMAS colisiones que un humano.
    const maxSpeed=room.settings.mode==='bot'&&i===1 ? BOT_CONFIG[room.settings.botDifficulty].speed : MAX_PADDLE_SPEED;
    const fraction=dist>0 ? Math.min(1,maxSpeed*dt/dist):0;
    const r=paddleRadius(room,i);
    const b=boundsForPaddle(room,i);
    p.x=clamp(p.x+dx*fraction,b.minX,b.maxX);
    p.y=clamp(p.y+dy*fraction,b.minY,b.maxY);
    // Damp very fast finger jumps for stable impact energy.
    p.vx=clamp((p.x-p.prevX)/dt,-MAX_PADDLE_SPEED,MAX_PADDLE_SPEED);
    p.vy=clamp((p.y-p.prevY)/dt,-MAX_PADDLE_SPEED,MAX_PADDLE_SPEED);
  });
}
/** Control de IA del rival. No cambia la fisica ni puede saltarse los limites. */
export function updateBot(room,now=Date.now()){
  if(room.settings.mode!=='bot'||!room.bot)return;
  const profile=BOT_CONFIG[room.settings.botDifficulty]||BOT_CONFIG.hard;
  if(now<(room.bot.thinkAt||0))return;
  room.bot.thinkAt=now+profile.delay;
  room.bot.iteration=(room.bot.iteration||0)+1;
  const p=room.puck, pad=room.paddles[1], pr=puckRadius(room);
  const wallMin=pr, wallMax=W-pr, span=wallMax-wallMin;
  const interceptY=210;
  let targetX=W/2;
  if(p.vy< -45){
    // Reflejar la prediccion en paredes, en lugar de atravesarlas.
    const t=clamp((p.y-interceptY)/(-p.vy),0,2.2);
    const raw=p.x+p.vx*t-wallMin;
    const wrapped=((raw%(2*span))+(2*span))%(2*span);
    targetX=wallMin+(wrapped<=span?wrapped:2*span-wrapped);
  }else if(p.y<H/2){targetX=p.x;}
  // Error estable entre decisiones, no jitter a 60 fps.
  const seed=Math.sin(room.bot.iteration*127.1+room.code.length*31.73)*43758.5453;
  const error=((seed-Math.floor(seed))*2-1)*profile.error;
  targetX+=error;
  // Defender la zona alta: atacar desde ARRIBA de la pelota para enviarla
  // hacia abajo, nunca cruzar a la mitad del rival.
  let targetY=150;
  if(p.y<420 && p.y>135 && p.vy<180){
    targetY=clamp(p.y-pr-PADDLE_R-14,95,310);
  }
  // En dificultad facil, dejar margen de reaccion en el centro.
  const bounds=boundsForPaddle(room,1);
  room.bot.aimX=clamp(targetX,bounds.minX,bounds.maxX);
  room.bot.aimY=clamp(targetY,bounds.minY,bounds.maxY);
  pad.tx=room.bot.aimX;pad.ty=room.bot.aimY;
}

// Stable collision response. Geometry uses exact swept-circle time-of-impact (TOI),
// not proximity checks taken only at the end of a frame.
const WALL_RESTITUTION = 0.97;
const PADDLE_RESTITUTION = 0.87;
const POST_R = 8;
const COLLISION_EPS = 0.12;
const MAX_COLLISIONS = 18;
const SPEED_EPS = 1e-8;
function limitSpeed(puck, min=0) {
  const speed=Math.hypot(puck.vx,puck.vy);
  if(!Number.isFinite(speed)) { puck.vx=0;puck.vy=0;return; }
  if(speed>MAX_PUCK_SPEED){puck.vx*=MAX_PUCK_SPEED/speed;puck.vy*=MAX_PUCK_SPEED/speed;}
  else if(speed>0 && speed<min){puck.vx*=min/speed;puck.vy*=min/speed;}
}
// Solve |relativePos + relativeVel*t| = contactRadius. Return the first
// approaching contact in [0, maxT] even when the objects cross entirely
// between two simulation ticks.
function sweepCircle(rx,ry,rvx,rvy,radius,maxT) {
  const c=rx*rx+ry*ry-radius*radius;
  const b=rx*rvx+ry*rvy;
  if(c<=0) return b<0 ? 0 : null;
  if(b>=0)return null;
  const a=rvx*rvx+rvy*rvy;
  if(a<SPEED_EPS)return null;
  const disc=b*b-a*c;
  if(disc<0)return null;
  const t=(-b-Math.sqrt(disc))/a;
  return t>=-1e-7 && t<=maxT+1e-7 ? Math.max(0,t) : null;
}
function normalFrom(dx,dy,fallbackX=0,fallbackY=-1) {
  const d=Math.hypot(dx,dy);
  if(d>1e-7)return {x:dx/d,y:dy/d};
  const f=Math.hypot(fallbackX,fallbackY)||1;
  return {x:fallbackX/f,y:fallbackY/f};
}
function reflect(puck,nx,ny,restitution) {
  const into=puck.vx*nx+puck.vy*ny;
  if(into>=-0.01)return false;
  puck.vx-=(1+restitution)*into*nx;
  puck.vy-=(1+restitution)*into*ny;
  limitSpeed(puck);
  return true;
}
function padMotion(room,dt) {
  return room.paddles.map((pad,i)=>({
    index:i,pad,
    x0:pad.prevX??pad.x,y0:pad.prevY??pad.y,
    vx:((pad.x-(pad.prevX??pad.x))/dt),
    vy:((pad.y-(pad.prevY??pad.y))/dt),
    radius:paddleRadius(room,i)
  }));
}
function padAt(m,seconds) {return {x:m.x0+m.vx*seconds,y:m.y0+m.vy*seconds};}
function resolvePaddle(room,puck,m,at) {
  const where=padAt(m,at);
  const safeNormal=normalFrom(puck.x-where.x,puck.y-where.y,
    puck.vx-m.vx,puck.vy-m.vy);
  const nx=safeNormal.x,ny=safeNormal.y;
  const radius=puckRadius(room)+m.radius;
  // Always keep the disc on the side where contact occurred. Never teleport
  // it to the other side of a mallet simply because the mallet moved quickly.
  puck.x=where.x+nx*(radius+COLLISION_EPS);
  puck.y=where.y+ny*(radius+COLLISION_EPS);
  const magnitude=Math.hypot(m.vx,m.vy);
  const energyFactor=magnitude>MAX_IMPACT_SPEED?MAX_IMPACT_SPEED/magnitude:1;
  const pvx=m.vx*energyFactor,pvy=m.vy*energyFactor;
  const normalIn=(puck.vx-pvx)*nx+(puck.vy-pvy)*ny;
  // A moving paddle can carry a disc forward, but one contact must never
  // trigger successive opposite impulses while the discs remain touching.
  if(normalIn< -0.5){
    const impulse=-(1+PADDLE_RESTITUTION)*normalIn;
    puck.vx+=impulse*nx;
    puck.vy+=impulse*ny;
    const sideways=Math.max(-36,Math.min(36,(-pvx*ny+pvy*nx)*.025));
    puck.vx-=sideways*ny;puck.vy+=sideways*nx;
    const outward=puck.vx*nx+puck.vy*ny;
    if(outward<160){puck.vx+=(160-outward)*nx;puck.vy+=(160-outward)*ny;}
    if(room.effect?.type==='turbo'){puck.vx*=1.16;puck.vy*=1.16;}
    limitSpeed(puck);
    room.lastTouch=m.index;
    markEvent(room,'hit',puck.x,puck.y,String(m.index));
  }
  m.pad.contactLocked=true;
  m.pad.contactNX=nx;m.pad.contactNY=ny;
}
function separateRestingContacts(room,motions) {
  const puck=room.puck,pr=puckRadius(room);
  for(const m of motions){
    const r=pr+m.radius,dx=puck.x-m.pad.x,dy=puck.y-m.pad.y;
    const len=Math.hypot(dx,dy);
    if(len>r+6){m.pad.contactLocked=false;continue;}
    if(len<r+COLLISION_EPS){
      const n=normalFrom(dx,dy,m.pad.contactNX||0,m.pad.contactNY||0);
      puck.x=m.pad.x+n.x*(r+COLLISION_EPS);
      puck.y=m.pad.y+n.y*(r+COLLISION_EPS);
      // Resolver un solapamiento NO es otro golpe. Un empuje continuo solo
      // puede llevar el disco suavemente hacia fuera (nunca lanzar un misil).
      const puckNormal=puck.vx*n.x+puck.vy*n.y;
      const carry=Math.min(360,Math.max(0,m.vx*n.x+m.vy*n.y));
      if(puckNormal<carry){
        const correction=Math.min(420,carry-puckNormal);
        puck.vx+=correction*n.x;puck.vy+=correction*n.y;
        limitSpeed(puck);
      }
      m.pad.contactLocked=true;
      m.pad.contactNX=n.x;m.pad.contactNY=n.y;
    }
  }
}
/**
 * Exact continuous collisions for puck vs moving paddles, fixed posts and
 * segmented boundaries. Events are ordered by time of impact, then the disc
 * travels only the remaining part of the frame after each rebound.
 * This avoids both tunneling and double-integration after a paddle strike.
 */
export function stepPuck(room,dt) {
  if(!Number.isFinite(dt)||dt<=0)return null;
  const puck=room.puck,r=puckRadius(room);
  const motions=padMotion(room,dt);
  const mouthLeft=W/2-GOAL_HALF+r+3;
  const mouthRight=W/2+GOAL_HALF-r-3;
  const mouth=(x)=>x>=mouthLeft&&x<=mouthRight;
  let elapsed=0,remaining=dt,processed=0;
  // A previous hit is unlocked only after a real spatial separation.
  for(const m of motions){
    if(Math.hypot(puck.x-m.x0,puck.y-m.y0)>r+m.radius+6)m.pad.contactLocked=false;
  }
  while(remaining>1e-8&&processed<MAX_COLLISIONS){
    let best={t:remaining+1,kind:'none'};
    const propose=(t,kind,extra={})=>{
      if(t===null||t< -1e-7||t>remaining+1e-7)return;
      if(t<best.t-1e-8)best={t:Math.max(0,t),kind,...extra};
    };
    for(const m of motions){
      if(m.pad.contactLocked)continue;
      const at=padAt(m,elapsed);
      const t=sweepCircle(puck.x-at.x,puck.y-at.y,puck.vx-m.vx,puck.vy-m.vy,
        r+m.radius,remaining);
      propose(t,'paddle',{m});
    }
    // The posts are circles, rather than rectangles: TOI also prevents
    // high-speed discs sneaking through the goal posts.
    for(const postY of [0,H])for(const postX of [W/2-GOAL_HALF,W/2+GOAL_HALF]){
      const t=sweepCircle(puck.x-postX,puck.y-postY,puck.vx,puck.vy,r+POST_R,remaining);
      propose(t,'post',{postX,postY});
    }
    if(puck.vx < -SPEED_EPS)propose((r-puck.x)/puck.vx,'wall',{nx:1,ny:0});
    if(puck.vx > SPEED_EPS)propose((W-r-puck.x)/puck.vx,'wall',{nx:-1,ny:0});
    if(puck.vy < -SPEED_EPS){
      const wallT=(r-puck.y)/puck.vy;
      if(wallT>=0 && !mouth(puck.x+puck.vx*wallT))propose(wallT,'wall',{nx:0,ny:1});
      const goalT=(-r*.85-puck.y)/puck.vy;
      if(goalT>=0 && mouth(puck.x+puck.vx*goalT))propose(goalT,'goal',{side:0});
    }
    if(puck.vy > SPEED_EPS){
      const wallT=(H-r-puck.y)/puck.vy;
      if(wallT>=0 && !mouth(puck.x+puck.vx*wallT))propose(wallT,'wall',{nx:0,ny:-1});
      const goalT=(H+r*.85-puck.y)/puck.vy;
      if(goalT>=0 && mouth(puck.x+puck.vx*goalT))propose(goalT,'goal',{side:1});
    }
    if(best.kind==='none'){
      puck.x+=puck.vx*remaining;puck.y+=puck.vy*remaining;
      elapsed+=remaining;remaining=0;break;
    }
    puck.x+=puck.vx*best.t;puck.y+=puck.vy*best.t;
    elapsed+=best.t;remaining=Math.max(0,remaining-best.t);
    if(best.kind==='goal')return best.side;
    if(best.kind==='paddle')resolvePaddle(room,puck,best.m,elapsed);
    else if(best.kind==='post'){
      const n=normalFrom(puck.x-best.postX,puck.y-best.postY,
        best.postX<W/2?1:-1,best.postY===0?1:-1);
      puck.x=best.postX+n.x*(r+POST_R+COLLISION_EPS);
      puck.y=best.postY+n.y*(r+POST_R+COLLISION_EPS);
      if(reflect(puck,n.x,n.y,WALL_RESTITUTION))markEvent(room,'wall',puck.x,puck.y,'post');
    }else if(best.kind==='wall'){
      puck.x+=best.nx*COLLISION_EPS;puck.y+=best.ny*COLLISION_EPS;
      if(reflect(puck,best.nx,best.ny,WALL_RESTITUTION))markEvent(room,'wall',puck.x,puck.y);
    }
    processed++;
  }
  // Overcrowded corner / high-latency safety: stop, never move through the
  // rest of the frame without checking the next collision.
  if(processed>=MAX_COLLISIONS&&remaining>0){puck.vx*=.5;puck.vy*=.5;}
  separateRestingContacts(room,motions);
  // Guard rails for numerical noise, before velocity is sent to phones.
  if(puck.x<r&&puck.y>=r&&puck.y<=H-r){puck.x=r;puck.vx=Math.abs(puck.vx);}
  if(puck.x>W-r&&puck.y>=r&&puck.y<=H-r){puck.x=W-r;puck.vx=-Math.abs(puck.vx);}
  const drag=Math.pow(.99975,dt*60);
  puck.vx*=drag;puck.vy*=drag;
  limitSpeed(puck);
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
