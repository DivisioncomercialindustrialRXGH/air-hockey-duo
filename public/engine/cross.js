/** Arena Cruz 2v2 — shared deterministic geometry for Worker, LAN and browsers.
 * Four independent defensive sectors and goals; scoreboard is still 2 teams.
 * The arena is the union of a vertical and a horizontal bar, both 300px wide.
 */
export const CROSS_SIZE=900;
export const CROSS_C=450;
export const CROSS_INNER=300;
export const CROSS_OUTER=600;
export const CROSS_GOAL_HALF=112;
export const CROSS_POST_RADIUS=9;
export const CROSS_MAX_SPEED=1600;
export const CROSS_MALLET_RADIUS=37;
const EPS=.03;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const CROSS_SEATS=Object.freeze([
  {name:'Azul 1',team:0,goal:'top'},
  {name:'Azul 2',team:0,goal:'bottom'},
  {name:'Rosa 1',team:1,goal:'left'},
  {name:'Rosa 2',team:1,goal:'right'}
]);
export const CROSS_PATH=Object.freeze([
  [0,300],[300,300],[300,0],[600,0],[600,300],[900,300],
  [900,600],[600,600],[600,900],[300,900],[300,600],[0,600]
]);
const GOAL_BY_SIDE={top:0,bottom:1,left:2,right:3};
// One segment normal always points toward the INSIDE of the cross polygon.
function wall(a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  return {a,b,dx,dy,len:length,nx:-dy/length,ny:dx/length};
}
const WALLS=[],POSTS=[];
for(let i=0;i<CROSS_PATH.length;i++){
  const a=CROSS_PATH[i],b=CROSS_PATH[(i+1)%CROSS_PATH.length];
  const isTop=a[1]===0&&b[1]===0,isBottom=a[1]===900&&b[1]===900;
  const isLeft=a[0]===0&&b[0]===0,isRight=a[0]===900&&b[0]===900;
  const goal=isTop?'top':isBottom?'bottom':isLeft?'left':isRight?'right':null;
  if(!goal){WALLS.push(wall(a,b));continue;}
  const middle1=goal==='top'||goal==='bottom'?
    [CROSS_C-CROSS_GOAL_HALF,a[1]]:[a[0],CROSS_C-CROSS_GOAL_HALF];
  const middle2=goal==='top'||goal==='bottom'?
    [CROSS_C+CROSS_GOAL_HALF,a[1]]:[a[0],CROSS_C+CROSS_GOAL_HALF];
  // Respect the directed polygon boundary for inwards-facing wall normals.
  const forward=goal==='top'||goal==='right';
  const first=forward?middle1:middle2,last=forward?middle2:middle1;
  WALLS.push(wall(a,first),wall(last,b));
  POSTS.push(first,last);
}
// Rounded collision bevel at every elbow prevents a puck cutting through
// the cross's four re-entrant corners under high-speed diagonal movement.
const CONCAVE=[[300,300],[600,300],[600,600],[300,600]];
const FEATURES=[...POSTS,...CONCAVE];
export const CROSS_WALLS=WALLS;
export const CROSS_GOALS=Object.freeze([
  {name:'top',seat:0,a:[CROSS_C-CROSS_GOAL_HALF,0],b:[CROSS_C+CROSS_GOAL_HALF,0],nx:0,ny:1},
  {name:'bottom',seat:1,a:[CROSS_C+CROSS_GOAL_HALF,900],b:[CROSS_C-CROSS_GOAL_HALF,900],nx:0,ny:-1},
  {name:'left',seat:2,a:[0,CROSS_C+CROSS_GOAL_HALF],b:[0,CROSS_C-CROSS_GOAL_HALF],nx:1,ny:0},
  {name:'right',seat:3,a:[900,CROSS_C-CROSS_GOAL_HALF],b:[900,CROSS_C+CROSS_GOAL_HALF],nx:-1,ny:0}
]);
export function crossToView(seat,{x,y}){
  switch(seat){
    case 0:return {x:900-x,y:900-y};
    case 1:return {x,y};
    case 2:return {x:y,y:900-x};
    case 3:return {x:900-y,y:x};
    default:return {x,y};
  }
}
export function crossFromView(seat,{x,y}){
  switch(seat){
    case 0:return {x:900-x,y:900-y};
    case 1:return {x,y};
    case 2:return {x:900-y,y:x};
    case 3:return {x:y,y:900-x};
    default:return {x,y};
  }
}
export function crossVelocityToView(seat,{vx,vy}){
  switch(seat){
    case 0:return {vx:-vx,vy:-vy};
    case 1:return {vx,vy};
    case 2:return {vx:vy,vy:-vx};
    case 3:return {vx:-vy,vy:vx};
    default:return {vx,vy};
  }
}
export function crossBounds(seat,r=CROSS_MALLET_RADIUS){
  const lo=CROSS_INNER+r+7,hi=CROSS_OUTER-r-7;
  const near=r+24,far=CROSS_C-65;
  // Restrict all pads to one arm and a short approach to the shared centre.
  if(seat===0)return {minX:lo,maxX:hi,minY:near,maxY:far};
  if(seat===1)return {minX:lo,maxX:hi,minY:900-far,maxY:900-near};
  if(seat===2)return {minX:near,maxX:far,minY:lo,maxY:hi};
  if(seat===3)return {minX:900-far,maxX:900-near,minY:lo,maxY:hi};
  throw Error('Plaza inválida');
}
export function crossViewBounds(r=CROSS_MALLET_RADIUS){
  return {lo:CROSS_INNER+r+7,hi:CROSS_OUTER-r-7,minY:900-(CROSS_C-65),maxY:900-r-24,r};
}
export function crossStartPaddles(){
  return [[450,135],[450,765],[135,450],[765,450]].map(([x,y])=>({
    x,y,tx:x,ty:y,prevX:x,prevY:y,vx:0,vy:0,contactLocked:false
  }));
}
export function crossServe(room,toward=0){
  const choice=toward===0 ? Math.PI*1.5 : Math.PI*.5;
  const a=choice+(Math.random()-.5)*.65;
  room.puck={x:450,y:450,vx:430*Math.cos(a),vy:430*Math.sin(a)};
  for(const p of room.paddles){p.contactLocked=false;p.prevX=p.x;p.prevY=p.y;}
  room.lastTouch=null;
}
function emit(room,type,detail=''){
  const p=room.puck;
  room.lastEvent={id:(room.lastEvent?.id||0)+1,type,x:p.x,y:p.y,at:room.simTime??Date.now(),detail};
  room.eventLog?.push(room.lastEvent);
}
function sweptCircle(x,y,vx,vy,r,tmax){
  const speed2=vx*vx+vy*vy;
  if(speed2<1e-12)return null;
  const term=x*vx+y*vy,c=x*x+y*y-r*r;
  if(c<=0){return term<0?0:null;}
  const disc=term*term-speed2*c;
  if(disc<0||term>=0)return null;
  const t=(-term-Math.sqrt(disc))/speed2;
  return t>=-1e-8&&t<=tmax+1e-8?Math.max(0,t):null;
}
function withinGoal(g,p,r){
  const x=g.nx===0?p.x:p.y;
  const lo=CROSS_C-CROSS_GOAL_HALF+r+CROSS_POST_RADIUS*.7;
  const hi=CROSS_C+CROSS_GOAL_HALF-r-CROSS_POST_RADIUS*.7;
  return x>=lo&&x<=hi;
}
function clampSpeed(p){
  const speed=Math.hypot(p.vx,p.vy);
  if(speed>CROSS_MAX_SPEED){p.vx*=CROSS_MAX_SPEED/speed;p.vy*=CROSS_MAX_SPEED/speed;}
}
/** Continuous time-of-impact solving for all mallets, walls, posts and goal lines.
 * dt <= 1/60 recommended; returns team awarded goal or null.
 */
export function stepCrossPuck(room,dt){
  if(!Number.isFinite(dt)||dt<=0)return null;
  const puck=room.puck,r=room.settings.puckSize==='S'?12:room.settings.puckSize==='L'?23:16;
  if(![puck.x,puck.y,puck.vx,puck.vy].every(Number.isFinite)){
    Object.assign(puck,{x:450,y:450,vx:0,vy:0});emit(room,'reset','numeric');return null;
  }
  const motion=room.paddles.map((p,i)=>({p,i,x0:p.prevX??p.x,y0:p.prevY??p.y,
    vx:(p.x-(p.prevX??p.x))/dt,vy:(p.y-(p.prevY??p.y))/dt,hit:false,r:CROSS_MALLET_RADIUS}));
  for(const m of motion){
    if(Math.hypot(puck.x-m.x0,puck.y-m.y0)>r+m.r+5)m.p.contactLocked=false;
  }
  let elapsed=0,remaining=dt,iterations=0;
  while(remaining>1e-8&&iterations<12){
    let best={t:remaining+1,kind:null};
    const propose=(t,kind,data={})=>{
      if(t===null||!Number.isFinite(t)||t< -1e-7||t>remaining+1e-7)return;
      if(t<best.t-1e-8)best={t:Math.max(0,t),kind,...data};
    };
    // The puck and mallet are both moving during this frame.
    for(const m of motion){
      const mx=m.x0+m.vx*elapsed,my=m.y0+m.vy*elapsed;
      const dx=puck.x-mx,dy=puck.y-my;
      const t=sweptCircle(dx,dy,puck.vx-m.vx,puck.vy-m.vy,r+m.r,remaining);
      if(t!==null)propose(t,'pad',{m});
    }
    for(const w of WALLS){
      const inward=(puck.x-w.a[0])*w.nx+(puck.y-w.a[1])*w.ny;
      const v=puck.vx*w.nx+puck.vy*w.ny;
      if(v>=-1e-8)continue;
      // A mallet/puck may be a few pixels inside a boundary after a late
      // contact. Recover the overlap at TOI zero rather than crossing the wall.
      const t=inward<r && inward>-2*r?0:(r-inward)/v;
      if(t<0||t>remaining)continue;
      const x=puck.x+puck.vx*t,y=puck.y+puck.vy*t;
      const projection=((x-w.a[0])*w.dx+(y-w.a[1])*w.dy)/w.len**2;
      if(projection>=0&&projection<=1)propose(t,'wall',{nx:w.nx,ny:w.ny,wall:w});
    }
    for(const [cx,cy] of FEATURES){
      const t=sweptCircle(puck.x-cx,puck.y-cy,puck.vx,puck.vy,r+CROSS_POST_RADIUS,remaining);
      if(t!==null)propose(t,'post',{cx,cy});
    }
    for(const goal of CROSS_GOALS){
      const v=puck.vx*goal.nx+puck.vy*goal.ny;
      if(v>=-1e-8)continue;
      const dist=(puck.x-goal.a[0])*goal.nx+(puck.y-goal.a[1])*goal.ny;
      const t=(-r*.7-dist)/v;
      if(t<0||t>remaining)continue;
      const point={x:puck.x+puck.vx*t,y:puck.y+puck.vy*t};
      if(withinGoal(goal,point,r))propose(t,'goal',{goal});
    }
    if(!best.kind){puck.x+=puck.vx*remaining;puck.y+=puck.vy*remaining;break;}
    puck.x+=puck.vx*best.t;puck.y+=puck.vy*best.t;
    elapsed+=best.t;remaining-=best.t;
    if(best.kind==='goal'){
      room.lastTouch=room.lastTouch??-1;
      emit(room,'goal',String(best.goal.seat));
      return best.goal.seat<2?1:0;
    }
    if(best.kind==='pad'){
      const m=best.m,mx=m.x0+m.vx*elapsed,my=m.y0+m.vy*elapsed;
      const nx0=puck.x-mx,ny0=puck.y-my,len=Math.hypot(nx0,ny0)||1;
      const nx=nx0/len,ny=ny0/len;
      puck.x=mx+nx*(r+m.r+EPS);puck.y=my+ny*(r+m.r+EPS);
      const relative=(puck.vx-m.vx)*nx+(puck.vy-m.vy)*ny;
      if(relative<-.001){
        // A single physical contact stays in lock until geometrically separated.
        // Quiet contacts still respect the circle boundary but don't add energy.
        if(!m.hit&&!m.p.contactLocked){
          const impact=Math.min(1000,Math.max(0,-relative));
          const kick=impact*1.87;
          puck.vx+=nx*kick;puck.vy+=ny*kick;
          clampSpeed(puck);
          room.lastTouch=m.i;emit(room,'hit',String(m.i));
          m.hit=true;m.p.contactLocked=true;
        }else{puck.vx-=nx*relative;puck.vy-=ny*relative;}
      }
    }else{
      let nx=best.nx,ny=best.ny;
      if(best.kind==='post'){
        const dx=puck.x-best.cx,dy=puck.y-best.cy,len=Math.hypot(dx,dy)||1;
        nx=dx/len;ny=dy/len;
        puck.x=best.cx+nx*(r+CROSS_POST_RADIUS+EPS);
        puck.y=best.cy+ny*(r+CROSS_POST_RADIUS+EPS);
      }else{
        const w=best.wall??null;
        const dist=w?(puck.x-w.a[0])*nx+(puck.y-w.a[1])*ny:r;
        const push=Math.max(EPS,r-dist+EPS);puck.x+=nx*push;puck.y+=ny*push;
      }
      const into=puck.vx*nx+puck.vy*ny;
      if(into<0){puck.vx-=(1.94*into)*nx;puck.vy-=(1.94*into)*ny;emit(room,'wall',best.kind);}
    }
    iterations++;
  }
  if(iterations>=12){puck.vx*=.4;puck.vy*=.4;}
  const damp=Math.pow(.99975,dt*60);
  puck.vx*=damp;puck.vy*=damp;
  clampSpeed(puck);
  return null;
}
