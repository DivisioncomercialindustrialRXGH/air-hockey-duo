import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {extractBaseline} from './baseline.mjs';
import * as physics from '../src/physics.js';
import * as motion from '../public/motion.js';
import {runMatch} from '../test/support/netsim.js';
const dir=extractBaseline(),oldPhysics=await import(pathToFileURL(`${dir}/src/physics.js`)),oldMotion=await import(pathToFileURL(`${dir}/public/motion.js`));
const cases=[...([30,70,83,130,200,300].map(rttMs=>({name:`RTT ${rttMs}`,net:{rttMs,jitterMs:rttMs===30?4:rttMs===70?10:15}}))),
  {name:'RTT 83 + 5% TCP loss',net:{rttMs:83,jitterMs:15,lossRate:.05}},
  {name:'RTT 130 + 1% TCP loss',net:{rttMs:130,jitterMs:25,lossRate:.01}}];
const result={seeds:[5,6,7],durationMs:300000,method:'Same corrected measurement harness for both versions; 3 x 5 virtual minutes. TCP retransmission >=200ms; jitter exponential, NOT ± jitter or measured end-to-end RTT. Scripted gallery contacts, not human gameplay.',rows:[]};
for(const c of cases)for(const version of ['5.0.3','5.0.4']){
  const P=version==='5.0.3'?oldPhysics:physics,M=version==='5.0.3'?oldMotion:motion;
  let contacts=0,misses=0,trials=0,applied=0,jumpMax=0,errors=0,frames=0,age=0;
  const start=performance.now();
  for(const seed of result.seeds){
    const r=runMatch({physics:P,motion:M,policy:version,net:c.net,seed,durationMs:result.durationMs,scenario:'gallery',mode:'duel',lagComp:P.lagCompConfig({})});
    const g=r.gallery;contacts+=g.contacts;misses+=Math.round(g.contacts*g.missAfterContact);trials+=g.trials;
    applied+=g.lagComp.applied;jumpMax=Math.max(jumpMax,g.lagComp.jumpMax);
    const o=r.report[1];errors+=o.bigErrorFrames*o.errorSamples;frames+=o.errorSamples;age+=o.stalenessMs;
  }
  const row={case:c.name,version,trials,contacts,misses,missPct:100*misses/contacts,applied,jumpMax,
    observerErrorOver40Pct:100*errors/frames,observerErrorSamples:frames,meanMedianAgeMs:age/result.seeds.length,runMs:performance.now()-start};
  result.rows.push(row);console.log(JSON.stringify(row));
}
writeFileSync('docs/audit/network-metrics.json',JSON.stringify(result,null,2)+'\n');
