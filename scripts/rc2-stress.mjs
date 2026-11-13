import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {extractBaseline,RC1} from './baseline.mjs';
import * as current from '../src/physics.js';
import {makeRng} from '../test/support/netsim.js';
const versions=[];
for(const [version,ref] of [['5.0.3',undefined],['RC1',RC1]]){
  const dir=extractBaseline(ref);versions.push({version,P:await import(pathToFileURL(`${dir}/src/physics.js`))});
}
versions.push({version:'RC2',P:current});
const rows=[],seeds=[771,991,2027],count=36000;
const types=['turbo','giantPuck','giantPaddle','miniRival','slowPuck','powerShot'];
for(const mode of ['duel','duo','teams','bot-easy','bot-hard','bot-god'])for(const {version,P} of versions){
  const row={version,mode,ticks:0,maxPuckStepPx:0,maxPaddleStepPx:0,maxPenetrationPx:0,maxPuckSpeed:0,goals:0,powers:0,applied:0,jumpMax:0};
  const begin=performance.now();
  for(const seed of seeds){
    const inputRng=makeRng(seed),physicsRng=makeRng(seed*31),saved=Math.random;Math.random=physicsRng;
    const r=P.makeRoom('PAIRED',{mode:mode.startsWith('bot')?'bot':mode,botDifficulty:mode.split('-')[1],powers:true,timeLimit:0});
    r.puck={x:250,y:450,vx:1000,vy:600};r.phase='playing';
    const measure=()=>{for(let i=0;i<r.paddles.length;i++)row.maxPenetrationPx=Math.max(row.maxPenetrationPx,
      P.puckRadius(r)+P.paddleRadius(r,i)-Math.hypot(r.puck.x-r.paddles[i].x,r.puck.y-r.paddles[i].y));};
    try{
      for(let tick=0;tick<count;tick++){
        const now=(tick+1)*1000/60;r.simTime=now;r.elapsedMs=now;
        if(tick%7===0)for(let i=0;i<r.paddles.length;i++){
          if(mode.startsWith('bot')&&i===1)continue;
          const n=r.paddles.length/2,side=i<n, x=((i%n)+inputRng())*500/n,y=side?492+352*inputRng():56+352*inputRng(),b=P.boundsForPaddle(r,i);
          r.paddles[i].tx=P.clamp(x,b.minX,b.maxX);r.paddles[i].ty=P.clamp(y,b.minY,b.maxY);
          P.setViewLag(r,i,40+inputRng()*80);
        }
        P.updateBot(r,now);P.movePaddles(r,1/60);const before={...r.puck};
        const goal=P.stepPuckCompensated(r,1/60,P.lagCompConfig({}));
        row.maxPuckStepPx=Math.max(row.maxPuckStepPx,Math.hypot(r.puck.x-before.x,r.puck.y-before.y));
        row.maxPuckSpeed=Math.max(row.maxPuckSpeed,Math.hypot(r.puck.vx,r.puck.vy));
        for(const p of r.paddles)row.maxPaddleStepPx=Math.max(row.maxPaddleStepPx,Math.hypot(p.x-p.prevX,p.y-p.prevY));
        measure();
        if(goal!==null){row.goals++;assert.ok(r.puck.y<0||r.puck.y>900);assert.ok(Math.abs(r.puck.x-250)<94);P.serve(r,1-goal);}
        // Exogenous power schedule and input stream are identical in all versions.
        // No random spawn/location draws can change the future input sequence.
        r.nextPowerAt=Infinity;
        if(tick%600===300){const j=Math.floor(tick/600);r.lastTouch=j%r.paddles.length;
          r.power={type:types[j%types.length],x:r.puck.x,y:r.puck.y,expires:now+1000};row.powers++;}
        P.updatePower(r,now);measure();row.ticks++;
        assert.ok([r.puck.x,r.puck.y,r.puck.vx,r.puck.vy].every(Number.isFinite));
        if(version==='RC2'){
          assert.ok(row.maxPenetrationPx<1e-5,`${mode}, ${seed}, tick ${tick}: overlap ${row.maxPenetrationPx}`);
          assert.ok(row.maxPuckStepPx<=1600/60+18*.12+.2,`puck displacement ${row.maxPuckStepPx}`);
          assert.ok(row.maxPaddleStepPx<=3600/60+1e-5,`paddle displacement ${row.maxPaddleStepPx}`);
          assert.ok(row.maxPuckSpeed<=1600+.01);
        }
      }
      const stats=P.lagCompStats(r);row.applied+=stats.applied;row.jumpMax=Math.max(row.jumpMax,stats.jumpMax);
    }finally{Math.random=saved;}
  }
  row.virtualSeconds=row.ticks/60;row.cpuWallMs=performance.now()-begin;rows.push(row);console.log(JSON.stringify(row));
}
writeFileSync('docs/audit/rc2/paired-stress.json',JSON.stringify({seeds,ticksPerSeed:count,
  method:'Same external input stream and power activation schedule; independent input/physics RNG. Continuous rallies; explicit serves excluded from displacement, included in overlap checks. Legacy lag fixture exercises physics, not authenticated transport.',rows},null,2)+'\n');
