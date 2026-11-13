import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,stepPuck,puckRadius,paddleRadius,W,H} from '../src/physics.js';

test('puck pinned between bot and right wall escapes without reset or false score',()=>{
  const room=makeRoom('EDGE1',{mode:'bot',botDifficulty:'hard',powers:false});
  const bot=room.paddles[1];
  Object.assign(bot,{x:W-37,y:170,prevX:W-37,prevY:170,tx:W-37,ty:170,contactLocked:true,contactNX:1,contactNY:0});
  const r=puckRadius(room);
  room.puck={x:W-r,y:170,vx:0,vy:0};
  const event=room.lastEvent.id,positions=[];
  for(let i=0;i<30;i++){
    assert.equal(stepPuck(room,1/60),null);
    positions.push({...room.puck});
    assert.ok(room.puck.x<=W-r+.5 && room.puck.x>=r-.5);
    assert.ok(room.puck.y>=r-.5 && room.puck.y<=H-r+.5);
    assert.ok(Number.isFinite(room.puck.vx)&&Number.isFinite(room.puck.vy));
  }
  const distance=Math.hypot(room.puck.x-bot.x,room.puck.y-bot.y);
  assert.ok(distance>puckRadius(room)+paddleRadius(room,1)+1);
  const largest=Math.max(...positions.slice(1).map((p,i)=>Math.hypot(p.x-positions[i].x,p.y-positions[i].y)));
  assert.ok(largest<=24,'unexpected visual jump: '+largest);
  assert.equal(room.lastEvent.id,event);
});

test('blue paddle at left wall does not trap the puck either',()=>{
  const room=makeRoom('EDGE2',{mode:'duel',powers:false});
  const pad=room.paddles[0],r=puckRadius(room);
  Object.assign(pad,{x:37,y:735,prevX:37,prevY:735,tx:37,ty:735,contactLocked:true,contactNX:-1,contactNY:0});
  room.puck={x:r,y:735,vx:0,vy:0};
  for(let i=0;i<30;i++)assert.equal(stepPuck(room,1/60),null);
  assert.ok(Math.hypot(room.puck.x-pad.x,room.puck.y-pad.y)>r+paddleRadius(room,0)+1);
});
