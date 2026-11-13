import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/physics.js';

for (const side of [0,1]) for (const size of ['S','M','L']) {
  test(`maximum legal stroke cannot overtake the puck: side ${side}, size ${size}`,()=>{
    const r=P.makeRoom('FAST',{powers:false,puckSize:size});
    const pad=r.paddles[side],sign=side===0?-1:1;
    const y=side===0?750:150,R=P.puckRadius(r)+P.paddleRadius(r,side);
    Object.assign(pad,{x:250,y,prevX:250,prevY:y,tx:250,ty:y,contactLocked:true,contactNX:0,contactNY:sign});
    r.puck={x:250,y:y+sign*(R+3),vx:0,vy:sign*160};
    for(let i=0;i<7;i++){
      pad.ty=pad.y+sign*60;
      P.movePaddles(r,1/60);P.stepPuck(r,1/60);
      assert.ok(sign*(r.puck.y-pad.y)>=R-.5,`tick ${i}: puck ${r.puck.y}, paddle ${pad.y}`);
      assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<=P.MAX_PUCK_SPEED+.01);
    }
  });
}

test('serve invalidates the previous player view, including a new tournament match',()=>{
  const r=P.makeRoom('CLEAR');P.setViewLag(r,0,100);P.serve(r,0);
  assert.equal(P.viewLag(r,0),0);
});

test('a late stroke cannot erase a goal that already crossed the authoritative line',()=>{
  const r=P.makeRoom('GOAL',{powers:false}),p=r.paddles[0];
  Object.assign(p,{x:180,y:830,prevX:180,prevY:830,tx:180,ty:830});
  Object.assign(r.paddles[1],{x:400,y:100,prevX:400,prevY:100,tx:400,ty:100});
  r.puck={x:250,y:720,vx:0,vy:900};P.setViewLag(r,0,100);
  for(let i=0;i<12;i++){P.movePaddles(r,1/60);assert.equal(P.stepPuckCompensated(r,1/60,{maxJumpPx:200}),null);}
  p.tx=230;p.ty=790;P.movePaddles(r,1/60);
  assert.equal(P.stepPuckCompensated(r,1/60,{maxJumpPx:200}),1);
  assert.equal(P.lagCompStats(r).savedGoals,0);
});

test('invalid dt cannot poison compensation history or the puck',()=>{
  const r=P.makeRoom('DT');const before={...r.puck};
  for(const dt of [NaN,Infinity,0,-1])assert.equal(P.stepPuckCompensated(r,dt),null);
  assert.deepEqual(r.puck,before);
});

for(const type of ['turbo','giantPuck','giantPaddle','miniRival','slowPuck','powerShot']){
  test(`power lifecycle: ${type} activates, expires and keeps finite bounded physics`,()=>{
    const r=P.makeRoom('POWER');r.puck={x:250,y:450,vx:800,vy:600};
    r.power={type,x:250,y:450,expires:9999};P.updatePower(r,1000);
    assert.equal(r.effect.type,type);P.movePaddles(r,1/60);P.stepPuckCompensated(r,1/60);
    assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<=P.MAX_PUCK_SPEED+.01);
    const until=r.effect.until;P.updatePower(r,until);assert.equal(r.effect,null);
  });
}
