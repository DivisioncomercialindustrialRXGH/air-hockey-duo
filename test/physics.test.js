import test from 'node:test';
import assert from 'node:assert/strict';
import { W, H, PADDLE_R, makeRoom, countdown, movePaddles, stepPuck, WIN_SCORE } from '../src/physics.js';

test('new room has two independent, mirrored paddle positions', () => {
  const r = makeRoom('ABC123');
  assert.equal(r.phase, 'waiting');
  assert.deepEqual(r.scores, [0, 0]);
  assert.equal(r.paddles[0].y, H - 127);
  assert.equal(r.paddles[1].y, 127);
});

test('paddles cannot enter opponent half', () => {
  const r = makeRoom('ABC123');
  r.paddles[0].ty = 0;
  r.paddles[1].ty = H;
  for (let i = 0; i < 100; i++) movePaddles(r, 1 / 60);
  assert.ok(r.paddles[0].y >= H/2+PADDLE_R+5);
  assert.ok(r.paddles[1].y <= H/2-PADDLE_R-5);
});

test('puck bounces against left wall', () => {
  const r = makeRoom('ABC123');
  r.puck = { x: 17, y: H/2, vx: -800, vy: 0 };
  assert.equal(stepPuck(r, 1/60), null);
  assert.ok(r.puck.vx > 0);
  assert.ok(r.puck.x >= 16);
});

test('server detects a goal only inside the goal opening', () => {
  const r = makeRoom('ABC123');
  r.puck = { x: W/2, y: 10, vx: 0, vy: -450 };
  let goal=null;for(let i=0;i<12&&goal===null;i++)goal=stepPuck(r, 1/60);
  assert.equal(goal,0);
  r.puck = { x: W/2+180, y: 10, vx: 0, vy: -450 };
  assert.equal(stepPuck(r, 1/60), null);
  r.puck = { x: W/2, y: H-10, vx: 0, vy: 450 };
  goal=null;for(let i=0;i<12&&goal===null;i++)goal=stepPuck(r, 1/60);
  assert.equal(goal,1);
});

test('countdown resets the puck and paddle positions without resetting scores', () => {
  const r = makeRoom('ABC123');
  r.scores[0] = WIN_SCORE-1;
  r.paddles[0].x = 77;
  countdown(r, 1);
  assert.equal(r.phase, 'countdown');
  assert.ok(r.phaseEnd >= Date.now());
  assert.equal(r.paddles[0].x, W/2);
  assert.deepEqual(r.scores, [WIN_SCORE - 1, 0]);
});

test('fast frontal strike from blue cannot reverse the puck back toward its own goal', () => {
  const r=makeRoom('FAST21',{powers:false});
  r.paddles[0].x=250;r.paddles[0].prevX=250;
  r.paddles[0].y=755;r.paddles[0].prevY=755;
  r.paddles[0].tx=250;r.paddles[0].ty=640;
  r.puck={x:250,y:685,vx:0,vy:170};
  movePaddles(r,1/60);
  stepPuck(r,1/60);
  assert.equal(r.lastEvent.type,'hit');
  assert.ok(r.puck.vy<0,`expected a forward hit, got vy=${r.puck.vy}`);
  for(let i=0;i<8;i++){
    movePaddles(r,1/60);stepPuck(r,1/60);
    assert.ok(r.puck.vy<0,`puck reversed after continuing touch at frame ${i}`);
    assert.ok(Number.isFinite(r.puck.x)&&Number.isFinite(r.puck.y));
    assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<=1601);
  }
});

test('high speed paddle crossing a puck cannot give multiple hits while still touching',()=>{
  const r=makeRoom('LOCKS1',{powers:false});
  Object.assign(r.paddles[0],{x:250,y:755,prevX:250,prevY:755,tx:250,ty:595});
  Object.assign(r.puck,{x:250,y:685,vx:0,vy:180});
  movePaddles(r,1/60);stepPuck(r,1/60);
  assert.equal(r.lastEvent.type,'hit');
  const startEvent=r.lastEvent.id;
  for(let i=0;i<4;i++){
    movePaddles(r,1/60);stepPuck(r,1/60);
    assert.ok(r.puck.vy<0,'No debe invertir el disco mientras mantiene el contacto');
  }
  assert.equal(r.lastEvent.id,startEvent,'no debe generar un nuevo choque durante el contacto continuo');
});

test('puck and paddle remain finite after repeated high-speed diagonal inputs',()=>{
  const r=makeRoom('STRESS',{powers:false});
  let rand=1729;const random=()=>{rand=(rand*1664525+1013904223)>>>0;return rand/4294967296;};
  r.puck={x:250,y:450,vx:400,vy:740};
  for(let i=0;i<2200;i++){
    for(let j=0;j<2;j++){
      r.paddles[j].tx=40+420*random();
      r.paddles[j].ty=j===0?510+330*random():60+330*random();
    }
    movePaddles(r,1/60);
    const goal=stepPuck(r,1/60);
    assert.ok([null,0,1].includes(goal));
    assert.ok(Number.isFinite(r.puck.x)&&Number.isFinite(r.puck.y));
    assert.ok(Number.isFinite(r.puck.vx)&&Number.isFinite(r.puck.vy));
    assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<=1601);
    if(goal!==null)r.puck={x:250,y:450,vx:420,vy:730};
  }
});
