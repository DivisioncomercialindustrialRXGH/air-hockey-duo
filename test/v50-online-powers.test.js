import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRoom,movePaddles,stepPuck,updatePower,paddleRadius,MAX_PUCK_SPEED} from '../src/physics.js';
import {serverFrameTime,pushSnapshot,samplePuckPose,softenPuckPosition} from '../public/motion.js';
const now=1000000;
function pickup(type,mode='duel',lastTouch=0){
  const r=makeRoom('POWER5',{mode,powers:true});
  r.phase='playing';r.puck={x:250,y:450,vx:520,vy:770};r.lastTouch=lastTouch;
  r.power={type,x:250,y:450,expires:now+4000};updatePower(r,now);
  assert.equal(r.effect?.type,type);assert.equal(r.power,null);return r;
}
test('miniRival shrinks only the opposite team',()=>{
  const r=pickup('miniRival');assert.equal(paddleRadius(r,0),37);assert.ok(paddleRadius(r,1)<26);
  const team=pickup('miniRival','duo',3);
  assert.ok(paddleRadius(team,0)<26&&paddleRadius(team,1)<26);
  assert.equal(paddleRadius(team,2),37);
});
test('slowPuck speed stays bounded after physical ticks',()=>{
  const r=pickup('slowPuck');
  for(let i=0;i<125;i++){
    r.paddles[0].tx=250+Math.cos(i*.1)*80;
    r.paddles[1].tx=250+Math.sin(i*.11)*60;
    movePaddles(r,1/60);
    if(stepPuck(r,1/60)!==null)r.puck={x:250,y:450,vx:600,vy:0};
    assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<=721);
  }
});
test('powerShot fires only from owner collision, without teleporting',()=>{
  const r=pickup('powerShot');
  Object.assign(r.paddles[0],{x:250,y:755,prevX:250,prevY:755,tx:250,ty:640});
  r.puck={x:250,y:685,vx:0,vy:170};movePaddles(r,1/60);stepPuck(r,1/60);
  assert.equal(r.effect,null);assert.ok(r.puck.vy<-1100);
  assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<=MAX_PUCK_SPEED);
  assert.ok(r.puck.y>600&&r.puck.y<700);
});
test('opposite team cannot steal powerShot',()=>{
  const r=pickup('powerShot');
  Object.assign(r.paddles[1],{x:250,y:120,prevX:250,prevY:120});
  r.puck={x:250,y:183,vx:0,vy:-1100};stepPuck(r,1/60);
  assert.equal(r.effect?.type,'powerShot');
});
test('all six powers collect with puck',()=>{
  for(const type of ['turbo','giantPuck','giantPaddle','miniRival','slowPuck','powerShot'])assert.ok(pickup(type).effect);
});
test('adaptive jitter does not perturb monotonically ordered server states',()=>{
  const clock={},frames=[],j=[85,85,95,160,115,230,95,200,120,180,105,210,70,175,100,180];
  let last=-Infinity;
  for(let i=0;i<j.length;i++){
    const {at}=serverFrameTime(clock,700000+i*33,500+i*33+j[i]-85);
    assert.ok(at>last);last=at;
    pushSnapshot(frames,{at,x:250+i*4,y:450,vx:120,vy:0,r:16});
  }
  assert.ok(clock.delayMs>=115&&clock.delayMs<=235);
  assert.equal(frames.length,16);
});
test('render extrapolation predicts wall bounce, not a stuck or teleported puck',()=>{
  const p=samplePuckPose([{at:1000,x:480,y:460,vx:1200,vy:150,r:16}],1195,
    {delayMs:90,maxExtrapolateMs:105});
  assert.ok(p.x<480&&p.x>300);
});
test('visual catchup stays bounded after 350 ms network gap',()=>{
  let from={x:100,y:450,r:16};const to={x:480,y:450,r:16};let biggest=0;
  for(let i=0;i<36;i++){
    const next=softenPuckPosition(from,to,1/60);biggest=Math.max(biggest,next.x-from.x);from=next;
  }
  assert.ok(biggest<37);assert.ok(Math.abs(from.x-to.x)<1);
});
test('WebSocket ping and steady state broadcasts are present',()=>{
  const w=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
  const g=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
  assert.doesNotMatch(w,/if\(evId!==r\.lastEvent\.id\)this\.notify\(r\)/);
  assert.match(w,/const substeps=/);assert.match(w,/const sendHz=/);assert.match(w,/msg.type==='ping'/);
  assert.match(g,/msg.type==='pong'/);assert.match(g,/RED LENTA/);
});
