import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,boundsForPaddle,stepPuck,serve,countdown,teamOf} from '../src/physics.js';
import {CROSS_SEATS,CROSS_GOALS,CROSS_WALLS,crossFromView,crossToView,crossViewBounds,stepCrossPuck,CROSS_SIZE} from '../src/cross.js';
import {samplePuckPose} from '../public/motion.js';
const mk=()=>makeRoom('ABC123',{mode:'cross',powers:true,timeLimit:120,puckSize:'M'});
test('Arena Cruz creates four seats with independent defenses and powers disabled in beta',()=>{
 const r=mk();assert.equal(r.players.length,4);assert.equal(r.paddles.length,4);assert.deepEqual([0,1,2,3].map(i=>teamOf(r,i)),[0,0,1,1]);
 assert.equal(r.settings.powers,false);assert.equal(CROSS_SEATS.length,4);assert.equal(CROSS_GOALS.length,4);assert.equal(CROSS_WALLS.length,16);
 for(let i=0;i<4;i++){const b=boundsForPaddle(r,i),p=r.paddles[i];assert.ok(p.x>=b.minX&&p.x<=b.maxX);assert.ok(p.y>=b.minY&&p.y<=b.maxY);}
});
test('own goal is always visible at screen bottom and transforms are reversible',()=>{
 const positions=[[450,90],[450,810],[90,450],[810,450]];
 for(let i=0;i<4;i++){
  const v=crossToView(i,{x:positions[i][0],y:positions[i][1]});
  assert.ok(v.y>700);assert.equal(v.x,450);
  for(const p of [{x:450,y:450},{x:350,y:250},{x:500,y:530}])assert.deepEqual(crossFromView(i,crossToView(i,p)),p);
  const b=crossViewBounds();assert.ok(b.lo>=0&&b.hi<=CROSS_SIZE&&b.maxY<=900);
 }
});
test('four goals score for opponent team',()=>{
 for(const [goal,scorer] of [['top',1],['bottom',1],['left',0],['right',0]]){
  const r=mk();r.paddles.forEach(p=>{p.x=365;p.y=365;p.prevX=365;p.prevY=365;});
  if(goal==='top')r.puck={x:450,y:40,vx:0,vy:-1500};
  if(goal==='bottom')r.puck={x:450,y:860,vx:0,vy:1500};
  if(goal==='left')r.puck={x:40,y:450,vx:-1500,vy:0};
  if(goal==='right')r.puck={x:860,y:450,vx:1500,vy:0};
  let got=null;for(let t=0;t<8;t++){got=stepCrossPuck(r,1/60);if(got!==null)break;}
  assert.equal(got,scorer,goal);
 }
});
test('side walls bounce puck without tunnelling',()=>{
 const r=mk();r.paddles.forEach(p=>{p.prevX=p.x;p.prevY=p.y;});
 r.puck={x:305,y:130,vx:-1500,vy:10};
 for(let i=0;i<18;i++){assert.equal(stepPuck(r,1/60),null);assert.ok(r.puck.x>=300+16-.1);assert.ok(Number.isFinite(r.puck.vx+r.puck.vy));}
 assert.ok(r.puck.vx>0);
});
test('paddle contacts bounce without jumping puck',()=>{
 const r=mk(),p=r.paddles[1];p.prevX=p.x;p.prevY=p.y;
 r.puck={x:450,y:695,vx:0,vy:1600};
 let hit=false;for(let i=0;i<6;i++){stepCrossPuck(r,1/60);if(r.lastEvent.type==='hit'){hit=true;break;}}
 assert.ok(hit);assert.ok(r.puck.vy<0);assert.ok(r.puck.y>610&&r.puck.y<760);
});
test('serve starts in center and resets contact locks',()=>{
 const r=mk();for(const p of r.paddles)p.contactLocked=true;
 serve(r,1);assert.equal(r.puck.x,450);assert.equal(r.puck.y,450);assert.ok(r.paddles.every(p=>!p.contactLocked));
 countdown(r);assert.equal(r.phase,'countdown');
});
test('rendering anchored at authoritative contact point',()=>{
 const a={at:0,x:430,y:600,vx:0,vy:1500,r:16},b={at:100,x:450,y:570,vx:20,vy:-1200,r:16,eventKind:'hit',eventContact:{at:60,x:448,y:655}};
 const p=samplePuckPose([a,b],60,{delayMs:0});
 assert.ok(Math.hypot(p.x-448,p.y-655)<.1);
});
