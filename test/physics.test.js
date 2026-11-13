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

test('continuous collision detects puck crossing entire mallet in one physics frame',()=>{
  const r=makeRoom('SWEEP1',{powers:false,puckSize:'S'});
  Object.assign(r.paddles[0],{x:250,y:755,prevX:250,prevY:755,tx:250,ty:755});
  r.puck={x:250,y:640,vx:0,vy:7500};
  const scored=stepPuck(r,1/60);
  assert.equal(scored,null);
  assert.equal(r.lastEvent.type,'hit');
  assert.ok(r.puck.vy<0,`debe rebotar hacia el rival, vy=${r.puck.vy}`);
  assert.ok(r.puck.y<705,`puck no atraviesa la paleta, y=${r.puck.y}`);
});

test('swept collisions work for all disc sizes with a fast moving mallet',()=>{
  for(const puckSize of ['S','M','L']){
    const r=makeRoom('FAST99',{powers:false,puckSize});
    Object.assign(r.paddles[0],{x:200,y:780,prevX:200,prevY:780,tx:200,ty:650});
    r.puck={x:200,y:700,vx:0,vy:150};
    movePaddles(r,1/60);
    assert.equal(stepPuck(r,1/60),null);
    assert.equal(r.lastEvent.type,'hit',`tamaño ${puckSize}`);
    assert.ok(r.puck.vy<0,`debe salir hacia adelante, tamaño ${puckSize}`);
    assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<1601,`velocidad limitada, tamaño ${puckSize}`);
  }
});

test('bot settings are validated and its paddles are bound by human physics limits',async()=>{
  const {updateBot,sanitizeSettings,boundsForPaddle}=await import('../src/physics.js');
  assert.equal(sanitizeSettings({mode:'bot',botDifficulty:'god'}).botDifficulty,'god');
  assert.equal(sanitizeSettings({mode:'bot',botDifficulty:'hacker'}).botDifficulty,'hard');
  assert.equal(sanitizeSettings({mode:'invalid'}).mode,'duel');
  for(const difficulty of ['easy','hard','god']){
    const r=makeRoom('BOT777',{mode:'bot',botDifficulty:difficulty,powers:false});
    const x0=r.paddles[1].x,y0=r.paddles[1].y;
    r.puck={x:465,y:300,vx:500,vy:-650};
    updateBot(r,Date.now());movePaddles(r,1/60);
    assert.ok(r.paddles[1].x>=boundsForPaddle(r,1).minX);
    assert.ok(r.paddles[1].x<=boundsForPaddle(r,1).maxX);
    assert.ok(r.paddles[1].y>=boundsForPaddle(r,1).minY);
    assert.ok(r.paddles[1].y<=boundsForPaddle(r,1).maxY);
    assert.ok(Math.hypot(r.paddles[1].x-x0,r.paddles[1].y-y0)<35,'sin teletransportacion');
  }
});

test('bot no longer hovers at a permanent gap: all difficulties actually strike a frontal puck',async()=>{
  const {updateBot}=await import('../src/physics.js');
  for(const botDifficulty of ['easy','hard','god']){
    const r=makeRoom('BOTHIT',{mode:'bot',botDifficulty,powers:false});
    r.puck={x:250,y:295,vx:0,vy:-450};
    let hit=false;
    for(let frame=0;frame<60;frame++){
      updateBot(r,100000+frame*1000/60);
      movePaddles(r,1/60);
      stepPuck(r,1/60);
      if(r.lastEvent.type==='hit'&&r.lastEvent.detail==='1'){hit=true;break;}
    }
    assert.ok(hit,`${botDifficulty} debe golpear el disco, no solo seguirlo`);
  }
});

test('god bot predicts diagonal puck and strikes it without teleporting',async()=>{
  const {updateBot,boundsForPaddle}=await import('../src/physics.js');
  const r=makeRoom('BOTDIA',{mode:'bot',botDifficulty:'god',powers:false});
  r.puck={x:420,y:395,vx:-500,vy:-800};
  let hit=false;
  for(let frame=0;frame<75;frame++){
    const before={...r.paddles[1]};
    updateBot(r,100000+frame*1000/60);
    movePaddles(r,1/60);
    const pad=r.paddles[1];
    assert.ok(Math.hypot(pad.x-before.x,pad.y-before.y)<=1900/60+0.02,'bot respeta velocidad maxima');
    const b=boundsForPaddle(r,1);
    assert.ok(pad.x>=b.minX&&pad.x<=b.maxX&&pad.y>=b.minY&&pad.y<=b.maxY);
    stepPuck(r,1/60);
    if(r.lastEvent.type==='hit'&&r.lastEvent.detail==='1'){hit=true;break;}
  }
  assert.ok(hit,'Dios debe atacar el disco diagonal');
});
