import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {extractBaseline,RC1} from './baseline.mjs';
import * as currentPhysics from '../src/physics.js';
import * as currentMotion from '../public/motion.js';
import {runMatch} from '../test/support/netsim.js';
const versions=[];
const holdout=process.argv.includes('--holdout');
for(const [version,ref,policy] of [['5.0.3',undefined,'5.0.3'],['RC1',RC1,'5.0.4']]){
  const dir=extractBaseline(ref);
  versions.push({version,policy,physics:await import(pathToFileURL(`${dir}/src/physics.js`)),motion:await import(pathToFileURL(`${dir}/public/motion.js`))});
}
versions.push({version:'RC2',policy:'5.0.4-rc.2',physics:currentPhysics,motion:currentMotion});
const cases=[...[30,70,83,130,200,300].map(rttMs=>({name:`RTT ${rttMs}`,net:{rttMs,jitterMs:rttMs===30?4:rttMs===70?10:15}})),
  {name:'RTT 83 + spikes',net:{rttMs:83,jitterMs:15,spikeRate:.02,spikeMs:50}},
  {name:'RTT 83 + 5% TCP loss',net:{rttMs:83,jitterMs:15,lossRate:.05}},
  {name:'RTT 130 + 1% TCP loss',net:{rttMs:130,jitterMs:25,lossRate:.01}},
  {name:'RTT 200 + 2% TCP loss',net:{rttMs:200,jitterMs:40,lossRate:.02}}];
const result={seeds:holdout?Array.from({length:10},(_,i)=>101+i):[5,6,7],durationMs:300000,fixedLaunchPeriodMs:3000,
  method:'Identical launch times, launch parameters, seeds and network link streams. Production protocol/timeline of each release. Jitter is exponential and additional to base RTT.',rows:[],acceptance:{}};
for(const c of cases){
  if(holdout&&!['RTT 70','RTT 83','RTT 130'].includes(c.name))continue;
  const launchBySeed=new Map();
  for(const v of versions){
    let contacts=0,misses=0,trials=0,applied=0,jumpMax=0,errors=0,frames=0,hitsWithoutContact=0;
    const start=performance.now();
    for(const seed of result.seeds){
      const r=runMatch({...v,net:c.net,seed,durationMs:result.durationMs,scenario:'gallery',mode:'duel',fixedShots:true,lagComp:v.physics.lagCompConfig({})});
      if(!launchBySeed.has(seed))launchBySeed.set(seed,r.launches);else assert.deepEqual(r.launches,launchBySeed.get(seed),'paired shots must be identical');
      const g=r.gallery;contacts+=g.contacts;misses+=Math.round(g.contacts*g.missAfterContact);trials+=g.trials;
      applied+=g.lagComp.applied;jumpMax=Math.max(jumpMax,g.lagComp.jumpMax);hitsWithoutContact+=g.hitsWithoutContact;
      const observer=r.report[1];errors+=observer.bigErrorFrames*observer.errorSamples;frames+=observer.errorSamples;
    }
    const row={case:c.name,version:v.version,trials,contacts,misses,missPct:100*misses/contacts,applied,jumpMax,
      observerErrorOver40Pct:100*errors/frames,observerErrorSamples:frames,hitsWithoutContact,runMs:performance.now()-start};
    result.rows.push(row);console.log(JSON.stringify(row));
  }
}
const old=result.rows.filter(r=>r.version==='5.0.3'),now=result.rows.filter(r=>r.version==='RC2');
result.acceptance.reducedMisses70to130=now.filter(r=>['RTT 70','RTT 83','RTT 130'].includes(r.case)).every(r=>r.missPct<old.find(o=>o.case===r.case).missPct);
result.acceptance.noMissRegression=now.every(r=>r.missPct<=old.find(o=>o.case===r.case).missPct+1e-9);
result.acceptance.zeroCompensationPositionJump=now.every(r=>r.jumpMax===0);
writeFileSync(`docs/audit/rc2/${holdout?'holdout-network':'paired-network'}.json`,JSON.stringify(result,null,2)+'\n');
assert.ok(result.acceptance.reducedMisses70to130);
assert.ok(result.acceptance.noMissRegression,'any miss-rate regression vs 5.0.3 blocks this comparison');
assert.ok(result.acceptance.zeroCompensationPositionJump);
