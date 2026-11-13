import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/physics.js';
import {projectMallet} from '../src/geometry.js';
import {makeRng} from './support/netsim.js';
const gap=(r,i)=>Math.hypot(r.puck.x-r.paddles[i].x,r.puck.y-r.paddles[i].y)-P.puckRadius(r)-P.paddleRadius(r,i);
const clear=r=>r.paddles.forEach((_,i)=>assert.ok(gap(r,i)>=-1e-5,`paddle ${i}: gap ${gap(r,i)}`));

test('corner recovery moves the mallet out, without dragging the puck through it',()=>{
  for(const mirror of [false,true]){
    const r=P.makeRoom('CORNER',{mode:'bot',botDifficulty:'hard',powers:false}),p=r.paddles[1];
    Object.assign(p,{x:49.4,y:84.87,prevX:51.08,prevY:86.33,tx:39,ty:66,contactLocked:true,contactNX:0,contactNY:1});
    r.puck={x:26.96,y:73.92,vx:0,vy:279.93};
    if(mirror){p.x=500-p.x;p.prevX=500-p.prevX;p.tx=500-p.tx;r.puck.x=500-r.puck.x;}
    const before={...r.puck},id=r.lastEvent.id;
    assert.equal(P.stepPuck(r,1/60),null);clear(r);
    assert.ok(Math.hypot(r.puck.x-before.x,r.puck.y-before.y)<5);
    assert.equal(r.lastEvent.id,id,'recovery is not a fictitious strike');
  }
});

for(const type of ['giantPuck','giantPaddle','miniRival'])for(const side of [0,1]){
  test(`size transition cannot introduce overlap: ${type}, side ${side}`,()=>{
    const r=P.makeRoom('SIZE',{powers:true}),p=r.paddles[side],sign=side===0?-1:1;
    r.puck={x:p.x,y:p.y+sign*53.25,vx:0,vy:0};r.lastTouch=side;
    r.power={type,x:r.puck.x,y:r.puck.y,expires:10000};P.updatePower(r,0);clear(r);
    const before={...r.puck};
    for(let tick=1;tick<600;tick++){
      const time=tick*1000/60;r.simTime=time;
      P.movePaddles(r,1/60);P.stepPuckCompensated(r,1/60,{enabled:false});P.updatePower(r,time);clear(r);
    }
    assert.ok(Math.hypot(r.puck.x-before.x,r.puck.y-before.y)<.01,'radius growth does not move the puck');
    assert.equal(r.effect,null,'the power still expires');
  });
}

test('giant radii reach their full original size when space is available',()=>{
  for(const type of ['giantPuck','giantPaddle']){
    const r=P.makeRoom('SIZE');r.power={type,x:250,y:450,expires:10000};P.updatePower(r,0);
    for(let i=0;i<30;i++){P.movePaddles(r,1/60);P.stepPuck(r,1/60);}
    assert.ok(Math.abs((type==='giantPuck'?P.puckRadius(r):P.paddleRadius(r,0))-(type==='giantPuck'?16*1.65:37*1.42))<1e-8);
  }
});

test('recenter publishes a non-overlapping spawn, including giant powers and all lanes',()=>{
  for(const mode of ['duel','duo','teams'])for(const type of ['giantPuck','giantPaddle','miniRival']){
    const r=P.makeRoom('RESET',{mode});r.effect={type,owner:0,until:10000};
    r.paddles.forEach((p,i)=>{const b=P.boundsForPaddle(r,i),side=i<r.paddles.length/2;
      p.x=Math.max(b.minX,Math.min(b.maxX,250));p.y=side?b.minY:b.maxY;p.tx=p.x;p.ty=p.y;
    });
    const before=r.paddles.map(p=>({...p}));P.recenterPuck(r,0);clear(r);
    r.paddles.forEach((p,i)=>assert.ok(Math.hypot(p.x-before[i].x,p.y-before[i].y)<=60+1e-6));
    assert.deepEqual(r.scores,[0,0]);assert.equal(r.puck.x,250);assert.equal(r.puck.y,450);
  }
});

test('diagonal shot inside the goal meets the net side continuously instead of snapping into the rink',()=>{
  for(const side of [0,1])for(const mirrored of [false,true]){
    const r=P.makeRoom('NET');r.effect={type:'giantPuck',owner:0,until:10000};
    r.puck={x:301.7961900469222,y:907.2169266295842,vx:1112.1912475736708,vy:1094.7161451487204};
    if(side===0){r.puck.y=900-r.puck.y;r.puck.vy=-r.puck.vy;}
    if(mirrored){r.puck.x=500-r.puck.x;r.puck.vx=-r.puck.vx;}
    const before={...r.puck};assert.equal(P.stepPuck(r,1/60),side);
    assert.ok(Math.hypot(r.puck.x-before.x,r.puck.y-before.y)<27);
    assert.ok(Math.abs(r.puck.x-250)<94-P.puckRadius(r));
  }
});

test('analytic projection always obeys circle, travel and lane constraints',()=>{
  const random=makeRng(919),b={minX:39,maxX:461,minY:492,maxY:844};let solved=0;
  for(let i=0;i<10000;i++){
    const origin={x:39+422*random(),y:492+352*random()},point={x:origin.x+120*(random()-.5),y:origin.y+120*(random()-.5)};
    const c={x:origin.x+100*(random()-.5),y:origin.y+100*(random()-.5)},r=53;
    const p=projectMallet(point,c,r,b,origin,60);
    if(!p)continue;solved++;
    assert.ok(Math.hypot(p.x-c.x,p.y-c.y)>=r-1e-6);
    assert.ok(Math.hypot(p.x-origin.x,p.y-origin.y)<=60+1e-6);
    assert.ok(p.x>=b.minX-1e-6&&p.x<=b.maxX+1e-6&&p.y>=b.minY-1e-6&&p.y<=b.maxY+1e-6);
  }
  assert.ok(solved>9000);
});
