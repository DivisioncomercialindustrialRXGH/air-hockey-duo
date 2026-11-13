import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/physics.js';
import {trackSnapshot,acceptMove} from '../src/input.js';

const DT=1/60;
function stroke({side=0,lag=100,y=625,x=150,to=210,enabled=true,alter,claim}={}){
  const r=P.makeRoom('PROOF',{powers:false}),p=r.paddles[side],ws={};
  const orient=(x,y)=>side?{x:500-x,y:900-y}:{x,y};
  const from=orient(x,y),end=orient(to,y);
  Object.assign(p,{...from,prevX:from.x,prevY:from.y,tx:from.x,ty:from.y});
  const other=orient(400,100);Object.assign(r.paddles[1-side],{...other,prevX:other.x,prevY:other.y,tx:other.x,ty:other.y});
  r.puck={...orient(250,520),vx:0,vy:side?-900:900};
  for(let i=1;i<=12;i++){r.simTime=1000+i*1000/60;P.movePaddles(r,DT);assert.equal(P.stepPuckCompensated(r,DT,{now:r.simTime}),null);}
  trackSnapshot(ws,10,1150,1150);
  const message={seq:1,ack:10,vt:1200-lag,...claim};
  const input=acceptMove(ws,message,1200);
  P.clearViewInput(r,side);
  if(input?.vt!==null&&input?.vt!==undefined)P.setViewInput(r,side,input.vt,1200);
  alter?.(r);
  p.tx=end.x;p.ty=end.y;P.movePaddles(r,DT);
  const id=r.lastEvent.id;r.simTime=1200+1000/60;
  const goal=P.stepPuckCompensated(r,DT,{enabled,now:r.simTime});
  return {r,p,ws,goal,event:r.lastEvent.id>id?r.lastEvent:null,stats:P.lagCompStats(r)};
}

test('validated temporal stroke is symmetric for blue/pink and never rewinds position',()=>{
  const results=[];
  for(const side of [0,1]){
    const on=stroke({side}),off=stroke({side,enabled:false});
    assert.equal(on.event?.comp,true);assert.equal(on.event.detail,String(side));
    assert.equal(on.event.viewTime,1100);assert.equal(on.event.correctionPx,0);
    assert.equal(on.r.puck.x,off.r.puck.x);assert.equal(on.r.puck.y,off.r.puck.y);
    assert.ok(Math.abs(on.r.puck.vx)>200,'accepted contact must physically deflect the puck');
    assert.equal(on.r.lastTouch,side);assert.equal(on.goal,null);assert.equal(on.stats.applied,1);
    results.push(on.r.puck);
  }
  assert.ok(Math.abs(results[0].vx+results[1].vx)<1e-7);
  assert.ok(Math.abs(results[0].vy+results[1].vy)<1e-7);
});

test('a valid timestamp cannot fabricate a geometrically absent stroke',()=>{
  assert.equal(stroke({x:50,to:110}).stats.applied,0);
});

test('contact after the submitted stroke ends is not a historical hit',()=>{
  // The old RC2 prototype accepted this when the puck subsequently reached the
  // parked endpoint. During the actual 16.67 ms stroke there is no collision.
  assert.equal(stroke({lag:90,y:670}).stats.applied,0);
});

test('issued-frame evidence and one-use commands apply to the actual compensation path',()=>{
  for(const claim of [{ack:9},{vt:1300},{vt:700},{seq:undefined}])assert.equal(stroke({claim}).stats.applied,0);
  const {r,p,ws}=stroke();
  assert.equal(acceptMove(ws,{seq:1,ack:10,vt:1100},1201),null);
  for(let i=0;i<20;i++){p.tx=250;p.ty=600;P.movePaddles(r,DT);P.stepPuckCompensated(r,DT,{now:1200+(i+2)*1000/60});}
  assert.equal(P.lagCompStats(r).applied,1,'an old command cannot authorize more impacts');
});

test('radius transitions invalidate a replay even when no new power event occurs',()=>{
  const result=stroke({alter:r=>{r.geometry={puck:16,pads:[37,30]};}});
  assert.equal(result.stats.applied,0);
});

test('disabling the legacy jump knob also disables temporal impulses',()=>{
  assert.equal(P.lagCompConfig({LAG_COMP_MAX_JUMP_PX:'0'}).enabled,false);
});
