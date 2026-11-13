import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as P from '../src/physics.js';
import {makeRng} from '../test/support/netsim.js';
const results=[];
for(const mode of ['duel','duo','teams','bot-easy','bot-hard','bot-god']){
 const rng=makeRng(771),oldRandom=Math.random;Math.random=rng;
 const r=P.makeRoom('STRESS',{mode:mode.startsWith('bot')?'bot':mode,botDifficulty:mode.split('-')[1],powers:true,timeLimit:0});
 r.puck={x:250,y:450,vx:1000,vy:600};r.phase='playing';r.nextPowerAt=1000;
 let maxMove=0,maxPad=0,maxPenetration=0,maxSpeed=0,goals=0,events=0;const count=36000,begin=performance.now();
 try{
 for(let k=0;k<count;k++){
  const now=(k+1)*1000/60;r.simTime=now;r.elapsedMs=now;
  if(k%7===0)for(let i=0;i<r.paddles.length;i++){
   if(r.settings.mode==='bot'&&i===1)continue;
   const p=r.paddles[i],b=P.boundsForPaddle(r,i);p.tx=b.minX+rng()*(b.maxX-b.minX);p.ty=b.minY+rng()*(b.maxY-b.minY);
   P.setViewLag(r,i,40+rng()*80);
  }
  P.updateBot(r,now);P.movePaddles(r,1/60);const prev={...r.puck};
  const score=P.stepPuckCompensated(r,1/60,P.lagCompConfig({}));
  maxMove=Math.max(maxMove,Math.hypot(prev.x-r.puck.x,prev.y-r.puck.y));
  for(let i=0;i<r.paddles.length;i++){const p=r.paddles[i];maxPad=Math.max(maxPad,Math.hypot(p.x-p.prevX,p.y-p.prevY));maxPenetration=Math.max(maxPenetration,P.puckRadius(r)+P.paddleRadius(r,i)-Math.hypot(p.x-r.puck.x,p.y-r.puck.y));}
  maxSpeed=Math.max(maxSpeed,Math.hypot(r.puck.vx,r.puck.vy));
  assert.ok([r.puck.x,r.puck.y,r.puck.vx,r.puck.vy].every(Number.isFinite));
  assert.ok(maxSpeed<=P.MAX_PUCK_SPEED+.01);
  if(score!==null){goals++;assert.ok(r.puck.y<0||r.puck.y>P.H);assert.ok(Math.abs(r.puck.x-250)<94);P.serve(r,1-score);}
  P.updatePower(r,now);events=r.lastEvent.id;
 }
 }finally{Math.random=oldRandom;}
 const result={mode,ticks:count,virtualSeconds:count/60,maxPuckStepPx:maxMove,maxPaddleStepPx:maxPad,maxPenetrationPx:maxPenetration,maxPuckSpeed:maxSpeed,goals,events,compensation:P.lagCompStats(r),cpuWallMs:performance.now()-begin};
 results.push(result);console.log(JSON.stringify(result));
}
writeFileSync('docs/audit/rc2/stress-metrics.json',JSON.stringify(results,null,2)+'\n');
