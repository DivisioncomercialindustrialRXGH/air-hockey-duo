import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../public/motion.js';
import * as P from '../src/physics.js';

test('puck and remote paddle use exactly the requested playback delay',()=>{
  for(const delayMs of [24,37,40,45,60,170]){
    const frames=[{at:100,x:100,y:500,vx:1000,vy:0,r:16,poses:[{x:100,y:500}]},
      {at:200,x:200,y:500,vx:1000,vy:0,r:16,poses:[{x:200,y:500}]}];
    const now=200;
    if(delayMs>100)continue;
    assert.equal(M.samplePuckPose(frames,now,{delayMs}).x,now-delayMs);
    assert.equal(M.sampleRemotePose(frames,0,now,{delayMs}).x,now-delayMs);
  }
});

test('a TCP burst cannot reverse the render cursor or warp it forward',()=>{
  const clock={};for(let i=0;i<200;i++)M.serverFrameTime(clock,1000+i*33,1040+i*33);
  const before=M.playoutTime(clock,8000);
  for(let i=1;i<15;i++)M.serverFrameTime(clock,7567+i*33,8000);
  assert.equal(M.playoutTime(clock,8000),before);
  const next=M.playoutTime(clock,8016.67);
  assert.ok(next>=before&&next-before<=16.67*1.1+.001);
});
test('a frozen extrapolation reports the actual held time and smoothing is marked inexact',()=>{
  const pose=M.samplePuckPose([{at:100,x:200,y:450,vx:1000,vy:0,r:16}],1000,{delayMs:0,maxExtrapolateMs:50});
  assert.equal(pose.at,150);
  assert.equal(M.softenPuckPosition({x:20,y:450},pose,1/60).exact,false);
});
test('local bounds equal authoritative bounds for all teams, orientations and size powers',()=>{
  for(const mode of ['duel','duo','teams','tournament'])for(const type of [null,'giantPaddle','miniRival']){
    const r=P.makeRoom('BOUND',{mode});if(mode==='tournament')r.activeSeats=[2,3];
    r.effect=type?{type,owner:0}:null;
    for(let i=0;i<r.paddles.length;i++){
      const seat=mode==='tournament'?r.activeSeats[i]:i,side=P.teamOf(r,seat),a=P.boundsForPaddle(r,i),b=M.localBounds(r,seat,side);
      assert.ok(Math.abs(b.lo-(side===1?500-a.maxX:a.minX))<1e-8);
      assert.ok(Math.abs(b.hi-(side===1?500-a.minX:a.maxX))<1e-8);
      assert.ok(Math.abs(b.minY-(side===1?900-a.maxY:a.minY))<1e-8);
      assert.ok(Math.abs(b.maxY-(side===1?900-a.minY:a.maxY))<1e-8);
    }
  }
});
