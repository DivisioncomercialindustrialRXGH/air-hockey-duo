import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,movePaddles,updateBot,stepPuck,recenterPuck,puckRadius,W,H,MAX_PUCK_SPEED,boundsForPaddle} from '../src/physics.js';

const dt=1/60;
const lcg=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);

test('BOT easy/hard/god has bounded speed, acceleration and stays within its half during 2400 frames',()=>{
  for(const difficulty of ['easy','hard','god']){
    const r=makeRoom('SMOOTH',{mode:'bot',botDifficulty:difficulty,powers:false});
    let now=100000;const random=lcg(100+['easy','hard','god'].indexOf(difficulty));
    r.puck={x:340,y:380,vx:-390,vy:-650};
    const max={easy:405,hard:720,god:1100}[difficulty];
    let lastX=r.paddles[1].x,lastY=r.paddles[1].y;
    let lastVX=0,lastVY=0;
    for(let tick=0;tick<2400;tick++){
      r.elapsedMs=tick*1000/60;
      r.paddles[0].tx=120+random()*260;
      r.paddles[0].ty=610+random()*170;
      updateBot(r,now);movePaddles(r,dt);
      const b=r.paddles[1],speed=Math.hypot((b.x-lastX)/dt,(b.y-lastY)/dt);
      assert.ok(speed<=max+1,`bot ${difficulty} teleported at tick ${tick}: ${speed}`);
      const accel=Math.hypot(b.vx-lastVX,b.vy-lastVY)/dt;
      assert.ok(accel<17000,`bot ${difficulty} instant reversal at tick ${tick}: ${accel}`);
      lastX=b.x;lastY=b.y;lastVX=b.vx;lastVY=b.vy;
      const goal=stepPuck(r,dt),radius=puckRadius(r);
      if(goal!==null){r.puck={x:W/2,y:H/2,vx:random()*700-350,vy:(random()-.5)*1100};}
      else{
        assert.ok(r.puck.x>=radius-1&&r.puck.x<=W-radius+1,`disc left side: ${r.puck.x}`);
        assert.ok(r.puck.y>=radius-1||Math.abs(r.puck.x-W/2)<=94,`disc escaped top: ${r.puck.y} ${r.puck.x}`);
        assert.ok(r.puck.y<=H-radius+1||Math.abs(r.puck.x-W/2)<=94,`disc escaped bottom: ${r.puck.y} ${r.puck.x}`);
        assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<=MAX_PUCK_SPEED+1);
      }
      now+=1000/60;
    }
    const bounds=boundsForPaddle(r,1);
    assert.ok(r.paddles[1].y>=bounds.minY&&r.paddles[1].y<=bounds.maxY);
  }
});

test('puck outside a non-goal boundary is returned safely inside, even after overlapping a mallet',()=>{
  const r=makeRoom('GUARD1',{mode:'bot',powers:false});
  for(const puck of [
    {x:-40,y:125,vx:-500,vy:-750},
    {x:W+40,y:H+40,vx:550,vy:450},
    {x:70,y:-110,vx:0,vy:-700},
    {x:420,y:H+110,vx:0,vy:900}]){
    r.puck={...puck};
    const goal=stepPuck(r,dt),radius=puckRadius(r);
    assert.equal(goal,null,'missing the goal must not count');
    assert.ok(r.puck.x>=radius-1&&r.puck.x<=W-radius+1);
    assert.ok(r.puck.y>=radius-1&&r.puck.y<=H-radius+1);
  }
});

test('manual recenter preserves scoreboard, timer, room and player positions',()=>{
  const r=makeRoom('RESET1',{mode:'bot',powers:false});
  r.phase='playing';r.scores=[4,2];r.remainingMs=64567;r.elapsedMs=65433;
  r.paddles[0].x=190;r.paddles[0].y=723;
  r.puck={x:12,y:-90,vx:100,vy:500};
  recenterPuck(r,123456);
  assert.deepEqual(r.scores,[4,2]);
  assert.equal(r.remainingMs,64567);assert.equal(r.elapsedMs,65433);
  assert.deepEqual([r.puck.x,r.puck.y],[W/2,H/2]);
  assert.deepEqual([r.paddles[0].x,r.paddles[0].y],[190,723]);
  assert.equal(r.lastEvent.type,'reset');
});

test('continuous paddle contact does not pump puck velocity to max speed',()=>{
  const r=makeRoom('STICKY',{mode:'bot',botDifficulty:'god',powers:false});
  r.puck={x:250,y:150,vx:0,vy:0};
  const p=r.paddles[1];
  p.x=250;p.y=150;p.prevX=250;p.prevY=150;p.tx=250;p.ty=150;
  let max=0;
  for(let i=0;i<100;i++){
    movePaddles(r,dt);stepPuck(r,dt);max=Math.max(max,Math.hypot(r.puck.vx,r.puck.vy));
  }
  assert.ok(max<800,`a stationary overlap cannot repeatedly launch disc: max ${max}`);
});
