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
  return RADII[room.settings?.puckSize || 'M'] * (room.effect?.type === 'giantPuck' ? 1.65 : 1);
}
export function paddleRadius(room, i) {
  const fx=room.effect;
  if(fx?.type==='giantPaddle' && fx.owner===i)return PADDLE_R*1.42;
  const n=teamSize(room);
  if(fx?.type==='miniRival' && (i<n)!==(fx.owner<n))return PADDLE_R*.67;
  return PADDLE_R;
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
    bot:s.mode==='bot'?{aimX:W/2,aimY:132,thinkAt:0,iteration:0,seenHit:0,recoverUntil:0}:null,
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
  // A disc behind the bot (between its paddle and the goal) overrides retreat.
  // Rescue from the back line without changing speed, acceleration or difficulty.
  const behind=puck.y<bot.y-puckRadius(room)*.55 && puck.y<245;
  if(behind){
    const pr=puckRadius(room);
    const desiredX=clamp(puck.x+puck.vx*.035,b.minX,b.maxX);
    const desiredY=clamp(puck.y-pr-paddleRadius(room,1)*.8,b.minY+10,b.maxY-10);
    bot.tx=brain.aimX=desiredX;
    bot.ty=brain.aimY=desiredY;
    brain.thinkAt=now+cfg.delay;
    brain.recoverUntil=0;
    return;
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
  // Predict where the puck reaches the bot's contact line, including a wall bounce.
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
      // Intercept and strike from above without increasing physical speed.
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
    // A charged shot requires a real strike by the owning team.
    const effect=room.effect;
    const n=teamSize(room);
    if(effect?.type==='powerShot' && (effect.owner<n)===(m.index<n)){
      const towardRival=m.index<n?-1:1;
      puck.vx=clamp(puck.vx*.52,-660,660);
      puck.vy=towardRival*Math.sqrt(Math.max(0,1380**2-puck.vx**2));
      room.effect=null;room.nextPowerAt=Date.now()+3000;
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
    const r=pr+m.radius,dx=puck.x-m.pad.x,dy=puck.y-m.pad.y;
    const len=Math.hypot(dx,dy);
    if(len>r+6){m.pad.contactLocked=false;m.pad.edgeReleaseSign=0;continue;}
    if(len<r+COLLISION_EPS){
      // When the mallet traps the puck against a side wall, pushing the puck
      // outward gets immediately undone by the rink boundary. Ease it along
      // the wall in bounded steps instead of leaving it pinned or teleporting.
      const sidePinned=(puck.x>=W-pr-.9 && dx>0) || (puck.x<=pr+.9 && dx<0);
      if(sidePinned){
        const minY=pr+COLLISION_EPS,maxY=H-pr-COLLISION_EPS;
        let direction=m.pad.edgeReleaseSign ||
          (Math.abs(dy)>2?Math.sign(dy):Math.abs(puck.vy)>8?Math.sign(puck.vy):m.pad.y<H/2?1:-1);
        const escapeY=Math.sqrt(Math.max(0,(r+2)**2-dx*dx))+6;
        if(m.pad.y+direction*escapeY<minY||m.pad.y+direction*escapeY>maxY)direction=-direction;
        m.pad.edgeReleaseSign=direction;
        const targetY=clamp(m.pad.y+direction*escapeY,minY,maxY);
        const maxStep=Math.min(12,650*dt);
        puck.y=clamp(puck.y+clamp(targetY-puck.y,-maxStep,maxStep),minY,maxY);
        puck.vy=direction*Math.max(Math.abs(puck.vy),280);
        puck.vx=0;
        m.pad.contactLocked=true;
        m.pad.contactNX=0;m.pad.contactNY=direction;
        continue;
      }
      // Preserve the original side of a sustained paddle contact. Using the
      // instantaneous center-to-center normal after a fast crossover can
      // teleport the puck to the opposite side.
      const priorX=m.pad.contactNX,priorY=m.pad.contactNY;
      const n=m.pad.contactLocked && Number.isFinite(priorX) && Number.isFinite(priorY) &&
        Math.hypot(priorX,priorY)>.5
        ? {x:priorX,y:priorY}
        : normalFrom(dx,dy,priorX||0,priorY||0);
      puck.x=m.pad.x+n.x*(r+COLLISION_EPS);
      puck.y=m.pad.y+n.y*(r+COLLISION_EPS);
      // De-penetration must NEVER inject new energy each tick. A sustained
      // overlapping mallet was accelerating the disc to the speed cap.
      const inwards=puck.vx*n.x+puck.vy*n.y;
      if(inwards<0){puck.vx-=inwards*n.x;puck.vy-=inwards*n.y;}
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
  // Handle corrupt/old snapshots and positions forced out by the previous
  // collision. A puck can only cross an end line THROUGH the goal opening.
  if(![puck.x,puck.y,puck.vx,puck.vy].every(Number.isFinite)){
    Object.assign(puck,{x:W/2,y:H/2,vx:0,vy:0});
  }
  // An earlier positional correction must never turn into a free goal.
  // The only valid goal is a swept crossing inside the collision loop.
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
  separateRestingContacts(room,motions,dt);
  // A paddle can separate the disc across a border AFTER collision solving.
  // Enforce the rink again after every single contact (not just at tick start).
  if(![puck.x,puck.y,puck.vx,puck.vy].every(Number.isFinite)){
    Object.assign(puck,{x:W/2,y:H/2,vx:0,vy:0});
    markEvent(room,'reset',W/2,H/2,'auto');
  }
  // Only best.kind==='goal' can award a point; separation is not a score.
  if(puck.y<r+COLLISION_EPS){
    if(puck.y<=-r*.85 || !mouth(puck.x)){
      puck.y=r+COLLISION_EPS;puck.vy=Math.abs(puck.vy);
    }
  }
  if(puck.y>H-r-COLLISION_EPS){
    if(puck.y>=H+r*.85 || !mouth(puck.x)){
      puck.y=H-r-COLLISION_EPS;puck.vy=-Math.abs(puck.vy);
    }
  }
  if(puck.x<r+COLLISION_EPS){puck.x=r+COLLISION_EPS;puck.vx=Math.abs(puck.vx);}
  if(puck.x>W-r-COLLISION_EPS){puck.x=W-r-COLLISION_EPS;puck.vx=-Math.abs(puck.vx);}
  if(puck.y<r&&!mouth(puck.x)){puck.y=r+COLLISION_EPS;puck.vy=Math.abs(puck.vy);}
  if(puck.y>H-r&&!mouth(puck.x)){puck.y=H-r-COLLISION_EPS;puck.vy=-Math.abs(puck.vy);}
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
  if(room.effect && now>=room.effect.until){markEvent(room,'effectEnd',W/2,H/2,room.effect.type);room.effect=null;room.nextPowerAt=now+5500;}
  if(room.power && now>=room.power.expires){room.power=null;room.nextPowerAt=now+3000;}
  spawnPower(room,now);
  if(!room.power)return;
  const p=room.puck, power=room.power;
  if(Math.hypot(p.x-power.x,p.y-power.y)>puckRadius(room)+24)return;
  const owner=room.lastTouch??0;
  room.effect={type:power.type,owner,until:now+(power.type==='powerShot'?9000:6500)};
  if(power.type==='turbo') {p.vx*=1.3;p.vy*=1.3;limitSpeed(p);}
  if(power.type==='slowPuck') {p.vx*=.58;p.vy*=.58;limitSpeed(p,0,720);}
  markEvent(room,'power',power.x,power.y,power.type);
  room.power=null;
}
