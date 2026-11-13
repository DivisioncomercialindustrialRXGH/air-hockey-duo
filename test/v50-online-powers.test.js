import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRoom,movePaddles,stepPuck,updatePower,paddleRadius,updateBot,MAX_PUCK_SPEED,W,H,puckRadius} from '../src/physics.js';
import {serverFrameTime,pushSnapshot,samplePuckPose,softenPuckPosition} from '../public/motion.js';

const now=1_000_000;
function pickup(power,mode='duel',lastTouch=0){
  const r=makeRoom('PWRYES',{mode,powers:true});
  r.phase='playing';r.puck={x:250,y:450,vx:520,vy:770};r.lastTouch=lastTouch;
  r.power={type:power,x:r.puck.x,y:r.puck.y,expires:now+4000};
  updatePower(r,now);
  assert.equal(r.effect?.type,power);
  assert.equal(r.power,null);
  return r;
}

test('mini rival shrinks only opposing paddle on both sides',()=>{
  const r=pickup('miniRival');
  assert.ok(Math.abs(paddleRadius(r,0)-37)<.001);
  assert.ok(paddleRadius(r,1)<26);
  const other=pickup('miniRival','duo',3);
  assert.ok(paddleRadius(other,0)<26&&paddleRadius(other,1)<26);
  assert.equal(paddleRadius(other,2),37);
  assert.equal(paddleRadius(other,3),37);
});

test('slow puck stays limited, including after hits',()=>{
  const r=pickup('slowPuck');
  assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<=721);
  for(let i=0;i<125;i++){
    r.paddles[0].tx=250+Math.cos(i*.1)*80;
    r.paddles[0].ty=H-155;
    r.paddles[1].tx=250+Math.sin(i*.11)*60;
    movePaddles(r,1/60);
    if(stepPuck(r,1/60)!==null){r.puck={x:250,y:450,vx:600,vy:0};}
    assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<=721);
  }
});

test('charged shot fires only when owner actually strikes, never jumps positions',()=>{
  const r=pickup('powerShot');
  r.paddles[0].x=250;r.paddles[0].y=755;r.paddles[0].prevX=250;r.paddles[0].prevY=755;
  r.paddles[0].tx=250;r.paddles[0].ty=640;
  r.puck={x:250,y:685,vx:0,vy:170};
  movePaddles(r,1/60);
  assert.equal(stepPuck(r,1/60),null);
  assert.equal(r.effect,null);
  assert.ok(r.puck.vy<-1100);
  assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<=MAX_PUCK_SPEED);
  assert.ok(r.puck.y>600 && r.puck.y<700,`shot must originate at collision: ${r.puck.y}`);
});

test('charged shot cannot be stolen by opponent hit',()=>{
  const r=pickup('powerShot');
  r.paddles[1].x=250;r.paddles[1].y=120;r.paddles[1].prevX=250;r.paddles[1].prevY=120;
  r.puck={x:250,y:183,vx:0,vy:-1100};
  stepPuck(r,1/60);
  assert.equal(r.effect?.type,'powerShot');
});

test('all power types may spawn and collect from the disc',()=>{
  for(const power of ['turbo','giantPuck','giantPaddle','miniRival','slowPuck','powerShot']){
    const r=pickup(power);
    assert.ok(r.effect,`cannot collect ${power}`);
  }
});

test('adaptive visual buffer grows on jitter, but timestamps stay monotonic',()=>{
  const clock={},frames=[];
  const delays=[85,85,95,160,115,230,95,200,120,180,105,210,70,175,100,180];
  let prevAt=-Infinity;
  for(let i=0;i<delays.length;i++){
    const server=700000+i*33;
    const arrival=500+i*33+delays[i]-85;
    const {at}=serverFrameTime(clock,server,arrival);
    assert.ok(at>prevAt);prevAt=at;
    pushSnapshot(frames,{at,x:250+i*4,y:450,vx:120,vy:0,r:16});
  }
  // 5.0.3: ±145 ms of jitter makes the buffer grow (bounded, slewed),
  // instead of extrapolating through half of the snapshots.
  assert.ok(clock.delayMs>60&&clock.delayMs<=170,`buffer ${clock.delayMs}`);
  assert.equal(frames.length,16);
});

test('prediction bounces at rink sides instead of freezing against wall',()=>{
  const frames=[{at:1000,x:480,y:460,vx:1200,vy:150,r:16}];
  const p=samplePuckPose(frames,1195,{delayMs:90,maxExtrapolateMs:105});
  assert.ok(p.x<480,`expected visual bounce, not stuck at 484: ${p.x}`);
  assert.ok(p.x>300);
});

test('visual catchup is strictly bounded after 350ms packet outage',()=>{
  let shown={x:100,y:450,r:16};const target={x:480,y:450,r:16};
  let maxStep=0;
  for(let i=0;i<36;i++){
    const next=softenPuckPosition(shown,target,1/60);
    maxStep=Math.max(maxStep,next.x-shown.x);shown=next;
  }
  assert.ok(maxStep<37,`teleport frame: ${maxStep}`);
  assert.ok(Math.abs(shown.x-target.x)<1);
});

test('online Worker does not send ad-hoc collision packets that create jitter bursts',()=>{
  const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
  assert.doesNotMatch(worker,/if\(evId!==r\.lastEvent\.id\)this\.notify\(r\)/);
  assert.match(worker,/substeps=Math.min\(8,available\)/);
  assert.match(worker,/const sendHz=/);
});

test('client displays measured RTT, never guesses network quality',()=>{
  const client=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
  assert.match(client,/msg.type==='pong'/);
  assert.match(client,/RED LENTA/);
  assert.match(worker,/msg.type==='ping'/);
});
