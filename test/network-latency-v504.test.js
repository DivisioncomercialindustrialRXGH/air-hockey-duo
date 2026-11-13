import test from 'node:test';
import assert from 'node:assert/strict';
import * as physics from '../src/physics.js';
import * as motion from '../public/motion.js';
import {runMatch} from './support/netsim.js';

// Safety gates supplement the eight historical quality gates, which also run
// in npm test under both the original and the verified RC2 protocol.
for(const rttMs of [30,70,83,130,200,300]){
  test(`network safety RTT ${rttMs}ms, jitter, spikes, TCP loss/bursts`,()=>{
    for(const seed of [5,6]){
      const r=runMatch({physics,motion,policy:'5.0.4',net:{rttMs,jitterMs:15,spikeRate:.02,spikeMs:50,lossRate:.01},
        seed,durationMs:120000,scenario:'gallery',mode:'duel',lagComp:physics.lagCompConfig({}),timerJitterMs:6});
      assert.ok(r.gallery.trials>45);
      assert.ok(r.gallery.lagComp.jumpMax<=14+.0001);
      assert.equal(r.gallery.lagComp.savedGoals,0);
      for(const c of r.report){
        assert.ok(c.errorSamples>1000,'metric must include meaningful non-reset frames');
        for(const k of ['errP50','errP99','errMax','stalenessMs','missRate'])assert.ok(Number.isFinite(c[k]));
      }
    }
  });
}
test('network deterministic replay produces the same metrics for the same seed',()=>{
  const opts={physics,motion,policy:'5.0.4',net:{rttMs:83,jitterMs:15,lossRate:.05},seed:17,
    durationMs:30000,scenario:'gallery',mode:'duel',lagComp:physics.lagCompConfig({})};
  assert.deepEqual(runMatch(opts),runMatch(opts));
});
