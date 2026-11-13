import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,stepPuck,updateBot,movePaddles,puckRadius,MAX_PUCK_SPEED,W,H} from '../src/physics.js';

const DT=1/60;

test('overlap correction cannot award a goal without swept crossing',()=>{
  for(const side of [0,1]){
    const room=makeRoom('GHOST',{mode:'duel',powers:false});
    const radius=puckRadius(room);
    room.puck={x:W/2,y:side===0?-radius:H+radius,vx:0,vy:0};
    const scores=[...room.scores];
    assert.equal(stepPuck(room,DT),null);
    assert.deepEqual(room.scores,scores);
    assert.ok(room.puck.y>=radius-.5&&room.puck.y<=H-radius+.5);
  }
});

test('real swept shot scores normally',()=>{
  const room=makeRoom('VALID',{mode:'duel',powers:false});
  room.paddles[0].x=100;room.paddles[0].y=730;
  room.paddles[1].x=100;room.paddles[1].y=100;
  room.puck={x:W/2,y:24,vx:0,vy:-800};
  assert.equal(stepPuck(room,DT),null);
  assert.equal(stepPuck(room,DT),null);
  assert.equal(stepPuck(room,DT),0);
});

test('locked paddle contact cannot flip the puck to the wrong side',()=>{
  const room=makeRoom('LOCK',{mode:'duel',powers:false});
  const pad=room.paddles[0];
  pad.prevX=250;pad.prevY=610;pad.x=250;pad.y=666;
  pad.contactLocked=true;pad.contactNX=0;pad.contactNY=1;
  room.paddles[1].x=400;room.paddles[1].y=130;
  room.puck={x:250,y:663,vx:0,vy:0};
  assert.equal(stepPuck(room,DT),null);
  assert.ok(room.puck.y>pad.y);
  assert.ok(Math.hypot(room.puck.vx,room.puck.vy)<=MAX_PUCK_SPEED+1);
});

test('bot actively retrieves puck behind its paddle',()=>{
  const room=makeRoom('RESCUE',{mode:'bot',botDifficulty:'hard',powers:false});
  room.paddles[1].x=240;room.paddles[1].y=150;
  room.bot.recoverUntil=Date.now()+1000;
  room.puck={x:320,y:96,vx:80,vy:90};
  updateBot(room,Date.now());
  assert.ok(room.paddles[1].tx>285);
  assert.ok(room.paddles[1].ty<110);
});

test('high-speed strikes stay finite and score only beyond the goal line',()=>{
  const room=makeRoom('STRESS',{mode:'bot',botDifficulty:'god',powers:false});
  room.puck={x:W/2,y:H/2,vx:1350,vy:-650};
  for(let i=0;i<4000;i++){
    const t=100000+i*1000/60;
    room.paddles[0].tx=250+Math.sin(i*.2)*170;
    room.paddles[0].ty=710+Math.sin(i*.14)*120;
    updateBot(room,t);movePaddles(room,DT);
    const goal=stepPuck(room,DT),r=puckRadius(room);
    assert.ok([room.puck.x,room.puck.y,room.puck.vx,room.puck.vy].every(Number.isFinite));
    assert.ok(Math.hypot(room.puck.vx,room.puck.vy)<=MAX_PUCK_SPEED+1);
    if(goal!==null){
      assert.ok(room.puck.y<0||room.puck.y>H);
      room.puck={x:W/2,y:H/2,vx:300,vy:-750};
    }else{
      assert.ok(room.puck.x>=r-.5&&room.puck.x<=W-r+.5);
    }
  }
});