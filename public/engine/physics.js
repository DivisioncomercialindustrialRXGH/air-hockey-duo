import {projectMallet} from './geometry.js';
/** Shared deterministic physics for the Cloudflare room authority. */
export const W = 500, H = 900;
export const PADDLE_R = 37, PUCK_R = 16, GOAL_HALF = 94;
export const WIN_SCORE = 7, TICK_RATE = 60, SEND_RATE = 20;
// El control persigue el dedo rápido, pero su energía de impacto está limitada por separado.
// El limite maximo es tambien una proteccion visual para la interpolacion de 20 Hz.
// Un control lento se nota mucho con latencia de móvil. El seguimiento humano
// es rápido; el impulso transmitido al disco continúa limitado aparte.
export const MAX_PADDLE_SPEED = 3600;
const MAX_IMPACT_SPEED = 1000;
export const MAX_PUCK_SPEED = 1600;
const BOT_CONFIG = Object.freeze({
  // Difficulty changes reaction/prediction, not impossible teleporting.
  easy:{speed:405,accel:1650,delay:190,error:48,recover:260},
  hard:{speed:720,accel:2800,delay:82,error:17,recover:220},
  god:{speed:1100,accel:4800,delay:42,error:2,recover:180}
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
  if(room.geometry)return room.geometry.puck;
  return RADII[room.settings?.puckSize || 'M'] * (room.effect?.type === 'giantPuck' ? 1.65 : 1);
}
export function paddleRadius(room, i) {
  if(room.geometry)return room.geometry.pads[i]??PADDLE_R;
  const fx=room.effect;
  if(fx?.type==='giantPaddle' && fx.owner===i)return PADDLE_R*1.42;
  const n=teamSize(room);
  if(fx?.type==='miniRival' && (i<n)!==(fx.owner<n))return PADDLE_R*.67;
  return PADDLE_R;
}
function markEvent(room, type, x, y, detail = '', extra) {
  room.lastEvent = { id: (room.lastEvent?.id || 0) + 1, type, x, y, detail, ...extra };
  // Lag compensation may only rewind across deterministic wall/post bounces.
  if(type!=='wall')lagState(room).nonWall++;
  room.eventLog?.push(room.lastEvent); // test hook (undefined in production)
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
    bot:s.mode==='bot'?{aimX:W/2,aimY:132,thinkAt:0,iteration:0,seenHit:0,recoverUntil:0}:null,
    paddles:startingPaddles(s.mode),puck:{x:W/2,y:H/2,vx:0,vy:0}
  };
}
export function resetPaddles(room) {
  const replacements = startingPaddles(room.settings.mode);
  room.paddles=replacements;delete room.geometry;
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
  // A new serve starts a new timeline: lag compensation may never rewind into
  // the previous rally (pause/reconnect, countdown, manual recenter).
  room.paddles.forEach(p=>{p.prevX=p.x;p.prevY=p.y;p.contactLocked=false;p.contactNX=0;p.contactNY=0;});
  // Recentring can place the disc beside a mallet on the centre-line limit.
  // Publish a valid starting geometry rather than an overlapping reset frame.
  separateRestingContacts(room,padMotion(room,1/60),1/60);
  const lag = lagState(room); lag.history.length = 0; lag.lag=[]; lag.inputs=[]; lag.nonWall++;
}
export function countdown(room, toward) {
  room.phase='countdown'; room.phaseEnd=Date.now()+2200;
  room.goalBy=null; room.winner=null; room.pauseMessage='';
  room.power=null; room.effect=null;delete room.geometry; room.nextPowerAt=Date.now()+6500;
  resetPaddles(room); serve(room,toward);
  if(room.bot){room.bot.thinkAt=0;room.bot.recoverUntil=0;room.bot.seenHit=room.lastEvent?.id||0;}
}
export function movePaddles(room, dt) {
  room.paddles.forEach((p,i) => {
    p.prevX=p.x; p.prevY=p.y;
    const dx=p.tx-p.x,dy=p.ty-p.y, dist=Math.hypot(dx,dy);
    // La IA usa el MISMO movimiento y las MISMAS colisiones que un humano.
    const maxSpeed=room.settings.mode==='bot'&&i===1 ? BOT_CONFIG[room.settings.botDifficulty].speed : MAX_PADDLE_SPEED;
    const b=boundsForPaddle(room,i);
    if(room.settings.mode==='bot'&&i===1){
      // Acceleration-limited servo: eliminates instantaneous direction flips
      // and keeps BOT GOD challenging through prediction, not hyper speed.
      const cfg=BOT_CONFIG[room.settings.botDifficulty]||BOT_CONFIG.hard;
      // Start braking BEFORE reaching a target: a fast bot that snapped its
      // position or velocity to a newly chosen target created visible jerks.
      const stopSpeed=Math.sqrt(2*cfg.accel*dist)*.72;
      const desiredSpeed=Math.min(maxSpeed,stopSpeed,dist*9);
      const wantedVX=dist>1e-6?dx/dist*desiredSpeed:0;
      const wantedVY=dist>1e-6?dy/dist*desiredSpeed:0;
      const dvx=wantedVX-(p.motorVX||0),dvy=wantedVY-(p.motorVY||0);
      const delta=Math.hypot(dvx,dvy),ratio=delta>0?Math.min(1,cfg.accel*dt/delta):0;
      p.motorVX=(p.motorVX||0)+dvx*ratio;
      p.motorVY=(p.motorVY||0)+dvy*ratio;
      // No position snapping at high speed, and no instantaneous velocity zero.
      // The controller may overshoot a few pixels while braking naturally.
      if(dist<.35&&Math.hypot(p.motorVX,p.motorVY)<cfg.accel*dt*.7){
        p.motorVX=0;p.motorVY=0;
        p.x=clamp(p.tx,b.minX,b.maxX);
        p.y=clamp(p.ty,b.minY,b.maxY);
      }else{
        const nx=p.x+p.motorVX*dt,ny=p.y+p.motorVY*dt;
        p.x=clamp(nx,b.minX,b.maxX);
        p.y=clamp(ny,b.minY,b.maxY);
        // At a physical boundary, stop only the blocked component.
        if(nx!==p.x)p.motorVX=0;
        if(ny!==p.y)p.motorVY=0;
      }
    }else{
      // Human finger still gets the original fast, unfiltered control.
      const fraction=dist>0?Math.min(1,maxSpeed*dt/dist):0;
      p.x=clamp(p.x+dx*fraction,b.minX,b.maxX);
      p.y=clamp(p.y+dy*fraction,b.minY,b.maxY);
    }
    // Damp very fast finger jumps for stable impact energy.
    p.vx=clamp((p.x-p.prevX)/dt,-MAX_PADDLE_SPEED,MAX_PADDLE_SPEED);
    p.vy=clamp((p.y-p.prevY)/dt,-MAX_PADDLE_SPEED,MAX_PADDLE_SPEED);
  });
}
/**
 * Bot: defender + atacar son comportamientos distintos.
 * Antes apuntaba siempre a quedar a ~67 px *por encima* del puck: el contacto
 * necesita 53 px (paddle 37 + disco 16), así que podía seguirlo sin pegar.
 * El bot ahora intercepta el trayecto y, cuando está en zona de tiro, atraviesa
 * ligeramente la línea de contacto. El motor de colisiones resuelve el choque.
 * Sin teletransportarse ni modificar directamente la velocidad de la pelota.
 */
export function updateBot(room,now=Date.now()) {
  if(room.settings.mode!=='bot'||!room.bot)return;
  const cfg=BOT_CONFIG[room.settings.botDifficulty]||BOT_CONFIG.hard;
  const brain=room.bot,bot=room.paddles[1],puck=room.puck;
  const b=boundsForPaddle(room,1);
  // After hitting, STOP chasing. Retreat from the puck for a brief time.
  // The old bot repeatedly followed the same disc and shook at high speed.
  if(room.lastEvent?.type==='hit' && room.lastEvent.detail==='1' &&
      brain.seenHit!==room.lastEvent.id){
    brain.seenHit=room.lastEvent.id;
    brain.recoverUntil=now+cfg.recover;
    brain.thinkAt=0;
  }
  // Emergency defense if the disc is behind the bot's paddle.
  const behind=puck.y<bot.y-puckRadius(room)*.55 && puck.y<245;
  if(behind){
    const pr=puckRadius(room);
    bot.tx=brain.aimX=clamp(puck.x+puck.vx*.035,b.minX,b.maxX);
    bot.ty=brain.aimY=clamp(puck.y-pr-paddleRadius(room,1)*.8,b.minY+10,b.maxY-10);
    brain.thinkAt=now+cfg.delay;brain.recoverUntil=0;return;
  }
  if(now<(brain.recoverUntil||0)){
    bot.tx=brain.aimX=clamp(bot.x,b.minX,b.maxX);
    bot.ty=brain.aimY=clamp(124,b.minY,b.maxY);
    return;
  }
  if(now<(brain.thinkAt||0))return;
  brain.thinkAt=now+cfg.delay;
  brain.iteration=(brain.iteration||0)+1;
  const pr=puckRadius(room),left=pr,right=W-pr,span=right-left;
  const projectedX=seconds=>{
    const x=puck.x+puck.vx*clamp(seconds,0,.9)-left;
    const wrapped=((x%(2*span))+(2*span))%(2*span);
    return left+(wrapped<=span?wrapped:2*span-wrapped);
  };
  const approaching=puck.vy< -60;
  const inZone=puck.y>75&&puck.y<H/2+35;
  // The contact line moves with the bot, but never ahead of the legal rink.
  // Predict where the puck WILL arrive, including one side-wall rebound.
  const contactLine=clamp(bot.y+pr+paddleRadius(room,1)+12,195,300);
  const interceptSeconds=approaching?clamp((puck.y-contactLine)/Math.max(90,-puck.vy),0,.72):0;
  // Difficulty error remains STABLE for several moments. Re-randomizing it
  // every think cycle caused easy/hard to shake even when the puck was still.
  const interval=Math.floor((room.elapsedMs||0)/1700);
  const noise=Math.sin(interval*127.1+room.code.length*31.73)*43758.5453;
  const error=((noise-Math.floor(noise))*2-1)*cfg.error;
  let x=W/2,y=140;
  if(approaching&&inZone){
    const aim=projectedX(interceptSeconds);
    if(puck.y<345){
      // Challenge the approaching puck from the far side and strike downward.
      // Higher difficulties predict better, but are not given extra speed.
      x=aim+error*(cfg.speed<500?.36:.2);
      y=puck.y-(pr+paddleRadius(room,1))*.78;
    }else{x=aim+error;y=185;}
  }else if(puck.y<125&&puck.vy<0){
    x=puck.x+error*.25;
    y=b.minY+9;
  }else if(puck.y<390){
    // If puck is travelling AWAY, return to a stable defensive spot.
    x=projectedX(.12)+error*.15;
    y=142;
  }
  const targetX=clamp(x,b.minX,b.maxX),targetY=clamp(y,b.minY,b.maxY);
  // A small dead-zone eliminates flickering at nearly equal targets.
  if(Math.abs(targetX-bot.tx)>5)bot.tx=brain.aimX=targetX;
  if(Math.abs(targetY-bot.ty)>5)bot.ty=brain.aimY=targetY;
}

// Stable collision response. Geometry uses exact swept-circle time-of-impact (TOI),
// not proximity checks taken only at the end of a frame.
const WALL_RESTITUTION = 0.97;
const PADDLE_RESTITUTION = 0.87;
const POST_R = 8;
const COLLISION_EPS = 0.12;
const MAX_COLLISIONS = 18;
// Minimum closing speed for a mallet that is still "locked" after a hit to
// count as a new strike (px/s). Below this it is resting contact / carrying.
const REHIT_CLOSING_SPEED = 90;
const SPEED_EPS = 1e-8;
function limitSpeed(puck, min=0, max=MAX_PUCK_SPEED) {
  const speed=Math.hypot(puck.vx,puck.vy);
  if(!Number.isFinite(speed)) { puck.vx=0;puck.vy=0;return; }
  if(speed>max){puck.vx*=max/speed;puck.vy*=max/speed;}
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
// A 3600 px/s mallet cannot keep moving through a puck capped at 1600 px/s.
// Limit its remaining normal travel, not the puck's position. The input target
// remains intact; on the next tick it can continue once contact has cleared.
function constrainMallet(room,puck,m,elapsed,dt){
  const at=padAt(m,elapsed),dx=puck.x-at.x,dy=puck.y-at.y;
  if(Math.hypot(dx,dy)>puckRadius(room)+m.radius+COLLISION_EPS*3)return;
  const n=normalFrom(dx,dy,m.pad.contactNX,m.pad.contactNY);
  const closing=(m.vx-puck.vx)*n.x+(m.vy-puck.vy)*n.y;
  if(closing<=0)return;
  m.vx-=closing*n.x;m.vy-=closing*n.y;
  m.x0=at.x-m.vx*elapsed;m.y0=at.y-m.vy*elapsed;
  const b=boundsForPaddle(room,m.index);
  m.pad.x=clamp(at.x+m.vx*(dt-elapsed),b.minX,b.maxX);
  m.pad.y=clamp(at.y+m.vy*(dt-elapsed),b.minY,b.maxY);
  // Keep the sweep endpoint consistent if a boundary clipped the constraint.
  if(dt>elapsed){m.vx=(m.pad.x-at.x)/(dt-elapsed);m.vy=(m.pad.y-at.y)/(dt-elapsed);}
  m.x0=at.x-m.vx*elapsed;m.y0=at.y-m.vy*elapsed;
  m.pad.vx=(m.pad.x-m.pad.prevX)/dt;m.pad.vy=(m.pad.y-m.pad.prevY)/dt;
  if(room.settings.mode==='bot'&&m.index===1){m.pad.motorVX=m.vx;m.pad.motorVY=m.vy;}
}
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
    // Charged shot: only an actual hit by the owner/team fires the cannon.
    // The disc never teleports; speed stays below the common speed ceiling.
    const effect=room.effect;
    const n=teamSize(room);
    if(effect?.type==='powerShot' && (effect.owner<n)===(m.index<n)){
      const towardRival=m.index<n?-1:1;
      puck.vx=clamp(puck.vx*.52,-660,660);
      puck.vy=towardRival*Math.sqrt(Math.max(0,1380**2-puck.vx**2));
      room.effect=null;room.nextPowerAt=(room.simTime??Date.now())+3000;
      markEvent(room,'cannon',puck.x,puck.y,String(m.index));
    }
    limitSpeed(puck,0,room.effect?.type==='slowPuck'?720:MAX_PUCK_SPEED);
    room.lastTouch=m.index;
    markEvent(room,'hit',puck.x,puck.y,String(m.index));
  }
  m.pad.contactLocked=true;
  m.pad.contactNX=nx;m.pad.contactNY=ny;
}
function separateRestingContacts(room,motions,dt=1/60) {
  const puck=room.puck,pr=puckRadius(room);
  for(const m of motions){
    const p=m.pad,R=pr+m.radius;
    const depth=R-Math.hypot(puck.x-p.x,puck.y-p.y);
    if(depth< -6)p.contactLocked=false;
    if(depth<=0&&Math.hypot(p.x-(p.prevX??p.x),p.y-(p.prevY??p.y))<=MAX_PADDLE_SPEED*dt+1e-7)continue;
    const origin={x:p.prevX??p.x,y:p.prevY??p.y};
    const n=depth>0&&p.contactLocked&&Math.hypot(p.contactNX||0,p.contactNY||0)>.5?{x:p.contactNX,y:p.contactNY}:null;
    const corrected=projectMallet(p,puck,R+1.25,boundsForPaddle(room,m.index),origin,MAX_PADDLE_SPEED*dt,n);
    if(corrected){
      p.x=corrected.x;p.y=corrected.y;
      p.vx=(p.x-origin.x)/dt;p.vy=(p.y-origin.y)/dt;
      p.contactLocked=true;
      const normal=normalFrom(puck.x-p.x,puck.y-p.y);p.contactNX=normal.x;p.contactNY=normal.y;
    }
  }
}

// Growth is geometric, not a position correction. Shrink immediately; grow at
// 120 px/s only while there is clearance. This also covers miniRival expiry.
function initializeGeometry(room){
  if(!room.geometry)room.geometry={puck:puckRadius(room),pads:room.paddles.map((_,i)=>paddleRadius(room,i))};
}
function updateGeometry(room,dt){
  if(!room.geometry)return;
  const geometry=room.geometry;delete room.geometry;
  const desiredPuck=puckRadius(room),desiredPads=room.paddles.map((_,i)=>paddleRadius(room,i));room.geometry=geometry;
  const p=room.puck;
  let clearance=Math.min(p.x,W-p.x);
  const mouth=Math.abs(p.x-W/2)<GOAL_HALF-desiredPuck-3;
  if(!mouth)clearance=Math.min(clearance,p.y,H-p.y);
  for(const x of [W/2-GOAL_HALF,W/2+GOAL_HALF])for(const y of [0,H])clearance=Math.min(clearance,Math.hypot(p.x-x,p.y-y)-POST_R);
  for(let i=0;i<room.paddles.length;i++){
    const pad=room.paddles[i];
    clearance=Math.min(clearance,Math.hypot(p.x-pad.x,p.y-pad.y)-geometry.pads[i],
      Math.hypot(p.x-(pad.prevX??pad.x),p.y-(pad.prevY??pad.y))-geometry.pads[i]);
  }
  geometry.puck=Math.min(desiredPuck,Math.max(geometry.puck,Math.min(geometry.puck+120*dt,clearance-.001)));
  const n=teamSize(room);
  for(let i=0;i<room.paddles.length;i++){
    const pad=room.paddles[i],left=n>1?(i%n)*W/n:0,right=left+W/n;
    const side=n>1?i<n?0:1:i;
    const space=(x,y)=>Math.min(x-left-2,right-x-2,side===0?y-H/2-5:H/2-y-5,
      side===0?H-y-19:y-19,Math.hypot(p.x-x,p.y-y)-geometry.puck-.001);
    const available=Math.min(space(pad.x,pad.y),space(pad.prevX??pad.x,pad.prevY??pad.y));
    geometry.pads[i]=Math.min(desiredPads[i],Math.max(geometry.pads[i],Math.min(geometry.pads[i]+120*dt,available)));
  }
}
/**
 * Exact continuous collisions for puck vs moving paddles, fixed posts and
 * segmented boundaries. Events are ordered by time of impact, then the disc
 * travels only the remaining part of the frame after each rebound.
 * This avoids both tunneling and double-integration after a paddle strike.
 */
export function stepPuck(room,dt,{growRadii=true}={}) {
  if(!Number.isFinite(dt)||dt<=0)return null;
  if(growRadii)updateGeometry(room,dt);
  const puck=room.puck,r=puckRadius(room);
  const motions=padMotion(room,dt);
  const mouthLeft=W/2-GOAL_HALF+r+3;
  const mouthRight=W/2+GOAL_HALF-r-3;
  const mouth=(x)=>x>=mouthLeft&&x<=mouthRight;
  // Handle corrupt/old snapshots and positions forced out by the previous
  // collision. A puck can only cross an end line THROUGH the goal opening.
  if(![puck.x,puck.y,puck.vx,puck.vy].every(Number.isFinite)){
    Object.assign(puck,{x:W/2,y:H/2,vx:0,vy:0});
  }
  if(puck.y<-r*.85){puck.y=r+COLLISION_EPS;puck.vy=Math.abs(puck.vy);}
  if(puck.y>H+r*.85){puck.y=H-r-COLLISION_EPS;puck.vy=-Math.abs(puck.vy);}
  if(puck.x<r){puck.x=r;puck.vx=Math.abs(puck.vx);}
  if(puck.x>W-r){puck.x=W-r;puck.vx=-Math.abs(puck.vx);}
  if(puck.y<r&&!mouth(puck.x)){puck.y=r;puck.vy=Math.abs(puck.vy);}
  if(puck.y>H-r&&!mouth(puck.x)){puck.y=H-r;puck.vy=-Math.abs(puck.vy);}
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
      const at=padAt(m,elapsed);
      const rx=puck.x-at.x,ry=puck.y-at.y,rvx=puck.vx-m.vx,rvy=puck.vy-m.vy;
      let quiet=false;
      if(m.pad.contactLocked){
        // 5.0.3: the lock exists to stop repeated impulses while the disc is
        // RESTING against a mallet. It used to skip the mallet entirely, so a
        // second swing that started within 6 px of the disc passed straight
        // through it with no hit. A locked mallet may strike again (once per
        // tick) when it is really separated and closing in fast enough.
        const gap=Math.hypot(rx,ry)-(r+m.radius);
        const closing=-(rx*rvx+ry*rvy)/Math.max(1e-6,Math.hypot(rx,ry));
        if(gap<-.5)continue; // old/corrupt overlap uses bounded recovery below
        quiet=m.struckThisStep||closing<REHIT_CLOSING_SPEED;
      }
      const t=sweepCircle(rx,ry,rvx,rvy,r+m.radius,remaining);
      propose(t,'paddle',{m,quiet});
    }
    // The posts are circles, rather than rectangles: TOI also prevents
    // high-speed discs sneaking through the goal posts.
    for(const postY of [0,H])for(const postX of [W/2-GOAL_HALF,W/2+GOAL_HALF]){
      const t=sweepCircle(puck.x-postX,puck.y-postY,puck.vx,puck.vy,r+POST_R,remaining);
      propose(t,'post',{postX,postY});
    }
    if(puck.vx < -SPEED_EPS)propose((r-puck.x)/puck.vx,'wall',{nx:1,ny:0});
    if(puck.vx > SPEED_EPS)propose((W-r-puck.x)/puck.vx,'wall',{nx:-1,ny:0});
    // Behind the end line, the goal has side walls. Without their TOI a diagonal
    // shot could enter the mouth, leave it sideways before the scoring plane,
    // then be clamped an entire radius back into the rink (a visible teleport).
    if(Math.abs(puck.vx)>SPEED_EPS){
      const edge=puck.vx<0?mouthLeft:mouthRight,t=(edge-puck.x)/puck.vx;
      const y=puck.y+puck.vy*t;
      if(t>=0&&(y<=0||y>=H))propose(t,'wall',{nx:puck.vx<0?1:-1,ny:0});
    }
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
    if(best.kind==='paddle'){
      if(best.quiet){
        // The lock suppresses extra impact energy, never collision geometry.
        const at=padAt(best.m,elapsed),n=normalFrom(puck.x-at.x,puck.y-at.y);
        puck.x=at.x+n.x*(r+best.m.radius+COLLISION_EPS);
        puck.y=at.y+n.y*(r+best.m.radius+COLLISION_EPS);
        const inward=puck.vx*n.x+puck.vy*n.y;
        if(inward<0){puck.vx-=inward*n.x;puck.vy-=inward*n.y;}
      }else{resolvePaddle(room,puck,best.m,elapsed);best.m.struckThisStep=true;}
    }
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
    for(const m of motions)constrainMallet(room,puck,m,elapsed,dt);
    processed++;
  }
  // Overcrowded corner / high-latency safety: stop, never move through the
  // rest of the frame without checking the next collision.
  if(processed>=MAX_COLLISIONS&&remaining>0){puck.vx*=.5;puck.vy*=.5;}

  // A paddle can separate the disc across a border AFTER collision solving.
  // Enforce the rink again after every single contact (not just at tick start).
  if(![puck.x,puck.y,puck.vx,puck.vy].every(Number.isFinite)){
    Object.assign(puck,{x:W/2,y:H/2,vx:0,vy:0});
    markEvent(room,'reset',W/2,H/2,'auto');
  }
  if(puck.y<r+COLLISION_EPS && (puck.y<=-r*.85 || !mouth(puck.x))){puck.y=r+COLLISION_EPS;puck.vy=Math.abs(puck.vy);}
  if(puck.y>H-r-COLLISION_EPS && (puck.y>=H+r*.85 || !mouth(puck.x))){puck.y=H-r-COLLISION_EPS;puck.vy=-Math.abs(puck.vy);}
  if(puck.x<r+COLLISION_EPS){puck.x=r+COLLISION_EPS;puck.vx=Math.abs(puck.vx);}
  if(puck.x>W-r-COLLISION_EPS){puck.x=W-r-COLLISION_EPS;puck.vx=-Math.abs(puck.vx);}
  if(puck.y<r&&!mouth(puck.x)){puck.y=r+COLLISION_EPS;puck.vy=Math.abs(puck.vy);}
  if(puck.y>H-r&&!mouth(puck.x)){puck.y=H-r-COLLISION_EPS;puck.vy=-Math.abs(puck.vy);}
  separateRestingContacts(room,motions,dt);
  const drag=Math.pow(.99975,dt*60);
  puck.vx*=drag;puck.vy*=drag;
  limitSpeed(puck,0,room.effect?.type==='slowPuck'?720:MAX_PUCK_SPEED);
  return null;
}
export function recenterPuck(room,now=Date.now()) {
  // Manual recovery or numeric fail-safe: NO score/time change.
  serve(room);
  room.lastTouch=null;
  room.paddles.forEach(p=>{p.contactLocked=false;p.contactNX=0;p.contactNY=0;});
  if(room.bot){room.bot.recoverUntil=0;room.bot.thinkAt=0;}
  markEvent(room,'reset',W/2,H/2,'manual');
}
export function spawnPower(room, now=Date.now()){
  if(!room.settings.powers||room.power||room.effect||now<room.nextPowerAt)return;
  const types=['turbo','giantPuck','giantPaddle','miniRival','slowPuck','powerShot'];
  const type=types[Math.floor(Math.random()*types.length)];
  room.power={ type, x:80+Math.random()*(W-160),y:260+Math.random()*(H-520),expires:now+9000 };
  room.nextPowerAt=now+12000;
  markEvent(room,'spawn',room.power.x,room.power.y,type);
}
export function updatePower(room, now=Date.now()) {
  initializeGeometry(room);
  if(room.effect && now>=room.effect.until){markEvent(room,'effectEnd',W/2,H/2,room.effect.type);room.effect=null;room.nextPowerAt=now+5500;}
  if(room.power && now>=room.power.expires){room.power=null;room.nextPowerAt=now+3000;}
  spawnPower(room,now);
  if(!room.power){updateGeometry(room,0);return;}
  const p=room.puck, power=room.power;
  if(Math.hypot(p.x-power.x,p.y-power.y)>puckRadius(room)+24)return;
  const owner=room.lastTouch??0;
  room.effect={type:power.type,owner,until:now+(power.type==='powerShot'?9000:6500)};
  if(power.type==='turbo') {p.vx*=1.3;p.vy*=1.3;limitSpeed(p);}
  if(power.type==='slowPuck') {p.vx*=.58;p.vy*=.58;limitSpeed(p,0,720);}
  markEvent(room,'power',power.x,power.y,power.type);
  room.power=null;updateGeometry(room,0);
}

// ---------------------------------------------------------------------------
// Historical contact validation with a present-time impulse (RC2).
//
// A player aims at the disc they SEE. That image is (downlink + playout delay)
// old, and their finger reaches Cloudflare (uplink + send interval) later.
// At 80 ms RTT that is ~140 ms in total: a 1000 px/s disc has moved ~140 px,
// so a stroke that clearly touched the disc on screen missed it on the server.
//
// Each 'move' carries vt = the server time of the disc the player was looking
// at. If THIS tick's mallet stroke intersects the disc as it was at that time,
// the server validates that stroke and re-simulates its velocity up to now with
// stepPuck(). Only velocity is committed: live position/score are never rewound.
// This deliberately favors a proven delayed stroke over its absent impulse,
// without promising that a late input can undo an already-authoritative goal.
//   * capped at LAG_COMP.maxMs of history, and only for a moving mallet;
//   * switched off for a player whose view lag exceeds LAG_COMP.disableAboveMs;
//   * never across another hit, power, reset, cannon or goal (only walls/posts);
//   * rejected if any radius changed, replay scores or hits another mallet;
//   * the collision must occur DURING the submitted stroke, not afterwards;
//   * issued snapshot/sequence/view time are validated in input.js. Clients
//     never report collisions. A plausible timestamp is not proof of rendering.
// ---------------------------------------------------------------------------
export const LAG_COMP = Object.freeze({ maxMs: 360, maxJumpPx: 14, historyMs: 500, minStrokeSpeed: 60, presentWindowMs: 50, disableAboveMs: 360 });
/** Prevent a historical impact from manufacturing a new shot INTO a nearby goal.
 * A legitimate immediate hit still uses the regular collision solver.
 * The replay may only create a late shot if it is not already at the endangered end. */
export function unsafeDelayedGoalShot(puck, vx, vy, lagMs) {
  if(!Number.isFinite(vx+vy+puck.x+puck.y)||lagMs<45)return false;
  const atTop=puck.y<225;
  const atBottom=puck.y>H-225;
  const turnedTowardTop=atTop&&vy< -400&&puck.vy> -240;
  const turnedTowardBottom=atBottom&&vy>400&&puck.vy<240;
  return turnedTowardTop||turnedTowardBottom;
}

/** LAG_COMP_MAX_MS=0 disables compensation. maxJumpPx is a legacy config /
 * telemetry ceiling; RC2 always applies zero positional correction. Its zero
 * value retains the former kill-switch behavior for existing deployments. */
export function lagCompConfig(env={}){
  const num=(v,d)=>{const n=Number(v);return v===undefined||v===null||v===''||!Number.isFinite(n)?d:n;};
  const maxMs=clamp(num(env.LAG_COMP_MAX_MS,LAG_COMP.maxMs),0,LAG_COMP.maxMs);
  const maxJumpPx=clamp(num(env.LAG_COMP_MAX_JUMP_PX,LAG_COMP.maxJumpPx),0,LAG_COMP.maxJumpPx);
  return {enabled:maxMs>0&&maxJumpPx>0,maxMs,maxJumpPx};
}
const LAG = new WeakMap();
function lagState(room) {
  let s = LAG.get(room);
  if (!s) { s = { nonWall: 0, history: [], lag: [], inputs: [], verified: [], clock: 0, stats: { applied: 0, rejected: 0, rejGoal: 0, rejEvent: 0, rejJump: 0, rejRink: 0, rejDanger: 0, savedGoals: 0, jumpMax: 0, jumpSum: 0 } }; LAG.set(room, s); }
  return s;
}
/** Legacy deterministic fixture hook. Production accepts validated setViewInput only. */
export function setViewLag(room, index, lagMs) {
  if (!Number.isFinite(lagMs) || lagMs < 0 || lagMs > 1500) {clearViewInput(room,index);return;}
  const s = lagState(room), prev = s.lag[index];
  s.lag[index] = prev === undefined ? lagMs : prev * .7 + lagMs * .3;
}
export function clearViewInput(room,index){const s=lagState(room);delete s.lag[index];delete s.inputs[index];}
export function setViewInput(room,index,vt,receivedAt){
  const s=lagState(room);s.verified[index]=true;s.inputs[index]={vt,receivedAt};s.lag[index]=receivedAt-vt;
}
export const viewLag = (room, index) => lagState(room).lag[index] ?? 0;
export const lagCompStats = room => ({ ...lagState(room).stats });
export function clearLagHistory(room) { const s=lagState(room);s.history.length=0;s.nonWall++; }
function recordLagHistory(room) {
  const s = lagState(room);
  s.history.push({ t: s.clock, x: room.puck.x, y: room.puck.y, vx: room.puck.vx, vy: room.puck.vy, r: puckRadius(room), nonWall: s.nonWall, pads:room.paddles.map((p,i)=>({x:p.x,y:p.y,r:paddleRadius(room,i),contactLocked:p.contactLocked,contactNX:p.contactNX,contactNY:p.contactNY})) });
  while (s.history.length && s.clock - s.history[0].t > LAG_COMP.historyMs) s.history.shift();
}
const isBotPaddle = (room, i) => room.settings.mode === 'bot' && i === 1;
function insideRink(p, r) { return [p.x, p.y, p.vx, p.vy].every(Number.isFinite) && p.x >= r - 1 && p.x <= W - r + 1 && p.y >= -r && p.y <= H + r; }

/** stepPuck() + bounded lag compensation. Returns the scoring side or null. */
export function stepPuckCompensated(room, dt, opts = {}) {
  if(!Number.isFinite(dt)||dt<=0)return null;
  const s = lagState(room),nonWallBefore=s.nonWall;
  const scorer = stepPuck(room, dt);
  const nextClock=opts.now??s.clock+dt*1000;
  if(Math.abs(nextClock-s.clock-dt*1000)>2)clearLagHistory(room);
  s.clock=nextClock;
  const maxMs=clamp(opts.maxMs??LAG_COMP.maxMs,0,LAG_COMP.maxMs);
  // A goal already crossed the authoritative line. Late input cannot erase it.
  if(scorer===null&&opts.enabled!==false&&maxMs>0&&s.nonWall===nonWallBefore){
    if((opts.maxJumpPx??LAG_COMP.maxJumpPx)>0&&tryCompensate(room,dt,maxMs))s.history.length=0;
  }
  s.inputs=[]; // a received command can authorize at most this simulation step
  if(scorer!==null){s.history.length=0;return scorer;}
  recordLagHistory(room);
  return null;
}

function tryCompensate(room,dt,maxMs){
  const s=lagState(room),pr=puckRadius(room);
  if(!s.history.length)return false;
  for(const m of padMotion(room,dt)){
    if(isBotPaddle(room,m.index))continue;
    const input=s.inputs[m.index];
    if(s.verified[m.index]&&!input)continue;
    // setViewLag is retained for deterministic legacy fixtures; production only
    // supplies a fresh, validated setViewInput for this command.
    const rawLag=input?s.clock-dt*1000-input.vt:s.lag[m.index]??0;
    if(input&&s.clock-input.receivedAt>100)continue;
    if(rawLag>LAG_COMP.disableAboveMs||rawLag<8)continue;
    if(input&&rawLag>maxMs)continue; // never substitute a different historic time
    const lag=Math.min(maxMs,rawLag);
    if(Math.hypot(m.vx,m.vy)<LAG_COMP.minStrokeSpeed)continue;
    const px=room.puck.x-m.pad.x,py=room.puck.y-m.pad.y,R=pr+m.radius;
    if(Math.hypot(px,py)<R+2)continue;
    if(sweepCircle(px,py,room.puck.vx-m.vx,room.puck.vy-m.vy,R,LAG_COMP.presentWindowMs/1000)!==null)continue;
    const target=s.clock-dt*1000-lag;
    const h=s.history.findLast(f=>f.t<=target);
    if(!h||h.nonWall!==s.nonWall||Math.abs(h.r-pr)>.01||
      h.pads.some((p,i)=>Math.abs(p.r-paddleRadius(room,i))>.01))continue;
    const history=[...s.history,{t:s.clock,pads:room.paddles.map(p=>({...p})),nonWall:s.nonWall}];
    const poseAt=(index,time)=>{
      const a=history.findLast(f=>f.t<=time)||history[0];
      const b=history.find(f=>f.t>time)||a;
      const f=a===b?0:clamp((time-a.t)/(b.t-a.t),0,1),p=a.pads[index],q=b.pads[index];
      return {x:p.x+(q.x-p.x)*f,y:p.y+(q.y-p.y)*f};
    };
    const shadow={code:room.code,settings:room.settings,effect:room.effect,nextPowerAt:room.nextPowerAt,
      lastTouch:room.lastTouch,lastEvent:{id:0},eventLog:[],
      geometry:room.geometry?structuredClone(room.geometry):undefined,
      paddles:h.pads.map(p=>({...p,prevX:p.x,prevY:p.y})),
      puck:{x:h.x,y:h.y,vx:h.vx,vy:h.vy}};
    let goal=null;
    const advance=(from,to,strike)=>{
      for(let t=from;t<to-1e-6&&goal===null;){
        const boundary=history.find(f=>f.t>t+.0001)?.t??to;
        const end=Math.min(to,t+1000/60,boundary,strike&&t<target+dt*1000-.0001?target+dt*1000:Infinity);
        for(let i=0;i<shadow.paddles.length;i++){
          const point=time=>strike&&i===m.index?
            {x:m.x0+m.vx*clamp((time-target)/1000,0,dt),y:m.y0+m.vy*clamp((time-target)/1000,0,dt)}:poseAt(i,time);
          const a=point(t),b=point(end),p=shadow.paddles[i];
          p.prevX=a.x;p.prevY=a.y;p.x=b.x;p.y=b.y;
        }
        shadow.simTime=end;goal=stepPuck(shadow,(end-t)/1000,{growRadii:false});t=end;
      }
    };
    // Reconstruct the fractional history interval using the collision solver,
    // including posts/walls; linear h.x + h.vx * lead was wrong near rebounds.
    advance(h.t,target,false);
    if(goal!==null||shadow.eventLog.some(e=>e.type!=='wall'))continue;
    shadow.eventLog=[];
    if(Math.hypot(shadow.puck.x-m.x0,shadow.puck.y-m.y0)<R-.5)continue;
    shadow.paddles[m.index].contactLocked=false;
    // A parked mallet intersecting the puck later in the replay is not proof
    // that this received stroke touched the image at vt.
    advance(target,Math.min(s.clock,target+dt*1000),true);
    if(!shadow.eventLog.some(e=>e.type==='hit'&&e.detail===String(m.index)))continue;
    advance(target+dt*1000,s.clock,true);
    const contacts=shadow.eventLog.filter(e=>e.type!=='wall');
    const hit=contacts.find(e=>e.type==='hit'&&e.detail===String(m.index));
    if(!hit)continue;
    const other=contacts.some(e=>!['hit','cannon'].includes(e.type)||e.detail!==String(m.index))||contacts.filter(e=>e.type==='hit').length!==1;
    const overlap=shadow.paddles.some((p,i)=>Math.hypot(shadow.puck.x-p.x,shadow.puck.y-p.y)<pr+paddleRadius(shadow,i)-.5);
    if(goal!==null||other||overlap||!insideRink(shadow.puck,pr)){
      const why=goal!==null?'rejGoal':other||overlap?'rejEvent':'rejRink';
      s.stats.rejected++;s.stats[why]++;continue;
    }
    // Safety gate: a late replay may not suddenly fire toward a goal that
    // the present puck is already approaching/near. This is not a legitimate
    // real-time collision, so suppress the compensation instead of moving it.
    if(unsafeDelayedGoalShot(room.puck,shadow.puck.vx,shadow.puck.vy,lag)){
      s.stats.rejected++;s.stats.rejDanger++;continue;
    }
    room.puck.vx=shadow.puck.vx;room.puck.vy=shadow.puck.vy;room.lastTouch=m.index;
    room.effect=shadow.effect;room.nextPowerAt=shadow.nextPowerAt;
    const pad=room.paddles[m.index],sp=shadow.paddles[m.index];
    pad.contactLocked=Math.hypot(room.puck.x-pad.x,room.puck.y-pad.y)<=R+6;
    pad.contactNX=sp.contactNX;pad.contactNY=sp.contactNY;
    if(contacts.some(e=>e.type==='cannon'))markEvent(room,'cannon',hit.x,hit.y,String(m.index));
    markEvent(room,'hit',hit.x,hit.y,String(m.index),{comp:true,lagMs:Math.round(lag),correctionPx:0,viewTime:target});
    s.stats.applied++;
    return true;
  }
  return false;
}
