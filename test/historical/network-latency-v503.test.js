// Historical acceptance criteria from 5.0.3. Run explicitly to inspect the documented latency tradeoff.
/**
 * Reproducible network matrix (5.0.3). Each case runs the REAL physics.js and
 * motion.js through test/support/netsim.js: a "shooting gallery" launches the
 * disc toward player 0 (random speed 450–1400 px/s, random angle); a scripted
 * player aims at the disc exactly where the client DRAWS it.
 *
 * "Golpe perdido" = the drawn disc reached the drawn mallet, but Cloudflare did
 * not register a hit by that mallet during the shot.
 *
 * A/B on identical seeds: lag compensation ON (production default) vs OFF.
 * Acceptance criteria are absolute AND relative, with margins measured over
 * several seeds (see the report in the delivery notes).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as physics from '../../src/physics.js';
import * as motion from '../../public/motion.js';
import { runMatch } from '../support/netsim.js';

const SEEDS = [5, 6];
const DURATION = 240000; // 4 virtual minutes per seed (~200 shots)

function measure(net, lagComp, extra = {}) {
  let contacts = 0, missed = 0, trials = 0, jumpMax = 0, applied = 0, rejGoal = 0, obs40 = 0, hit40 = 0, maxDelay = 0, minDelay = Infinity;
  for (const seed of SEEDS) {
    const r = runMatch({ physics, motion, policy: '5.0.3', net, seed, durationMs: DURATION, scenario: 'gallery', mode: 'duel', lagComp, ...extra });
    const g = r.gallery;
    trials += g.trials; contacts += g.contacts; missed += Math.round(g.missAfterContact * g.contacts);
    if (g.lagComp) { jumpMax = Math.max(jumpMax, g.lagComp.jumpMax); applied += g.lagComp.applied; rejGoal += g.lagComp.rejGoal; }
    obs40 += r.report[1].bigErrorFrames / SEEDS.length; hit40 += r.report[0].bigErrorFrames / SEEDS.length;
    for (const c of r.report) { maxDelay = Math.max(maxDelay, c.delayMs); minDelay = Math.min(minDelay, c.delayMs); }
    for (const c of r.report) for (const k of ['errP50', 'errP99', 'errMax', 'stalenessMs']) assert.ok(Number.isFinite(c[k]), `${k} finite`);
  }
  return { trials, contacts, miss: contacts ? missed / contacts : 0, jumpMax, applied, rejGoal, obs40, hit40, maxDelay, minDelay };
}
const ON = physics.lagCompConfig({});
const OFF = { enabled: false };
const pct = x => (x * 100).toFixed(1) + '%';

const CASES = [
  { name: 'RTT 30 ms, jitter ±4', net: { rttMs: 30, jitterMs: 4 }, maxMiss: .03 },
  { name: 'RTT 70 ms, jitter ±10', net: { rttMs: 70, jitterMs: 10 }, maxMiss: .08, gain: .02 },
  { name: 'RTT 80 ms, jitter ±15, 2% spikes to ~130 ms', net: { rttMs: 80, jitterMs: 15, spikeRate: .02, spikeMs: 50 }, maxMiss: .08, gain: .04 },
  { name: 'RTT 130 ms, jitter ±25, 1% TCP loss', net: { rttMs: 130, jitterMs: 25, lossRate: .01 }, maxMiss: .25, gain: .05 },
  { name: 'RTT 200 ms, jitter ±40, 2% TCP loss (degraded mode)', net: { rttMs: 200, jitterMs: 40, lossRate: .02 }, maxMiss: .47, gain: -.01 },
  { name: 'RTT 80 ms, 5% TCP loss (head-of-line bursts)', net: { rttMs: 80, jitterMs: 15, lossRate: .05 }, maxMiss: .30, gain: .03 }
];

for (const c of CASES) {
  test(`network: ${c.name}`, () => {
    const on = measure(c.net, ON), off = measure(c.net, OFF);
    console.log(`  ${c.name}: missed ${pct(on.miss)} (no comp ${pct(off.miss)}), ` +
      `comp ${on.applied}, max correction ${on.jumpMax.toFixed(0)} px, frames>40px rival ${pct(on.obs40)} (no comp ${pct(off.obs40)}), buffer ${on.minDelay.toFixed(0)}–${on.maxDelay.toFixed(0)} ms`);
    assert.ok(on.trials > 200, `enough shots: ${on.trials}`);
    assert.ok(on.miss <= c.maxMiss, `missed hits ${pct(on.miss)} > ${pct(c.maxMiss)}`);
    assert.ok(on.miss <= off.miss - (c.gain ?? 0) + 1e-9, `compensation must help: ${pct(on.miss)} vs ${pct(off.miss)}`);
    // Bounded visual cost of the corrections.
    assert.ok(on.jumpMax <= ON.maxJumpPx + 1e-6, `correction ${on.jumpMax}`);
    assert.ok(on.obs40 <= off.obs40 + .015, `rival view: ${pct(on.obs40)} vs ${pct(off.obs40)}`);
    assert.ok(on.minDelay >= 24 && on.maxDelay <= motion.PLAYOUT.maxMs);
  });
}

test('network: server timer jitter (±6 ms setInterval) does not break compensation', () => {
  const on = measure({ rttMs: 80, jitterMs: 15 }, ON, { timerJitterMs: 6 });
  assert.ok(on.miss <= .08, pct(on.miss));
});

test('network: 5.0.2 clients (no vt) are simply not compensated, never mis-compensated', () => {
  // An old client sends moves without vt: the server keeps 5.0.2 behaviour for it.
  const old = runMatch({
    physics, motion, policy: '5.0.3', net: { rttMs: 80, jitterMs: 15 }, seed: 5, durationMs: 120000, scenario: 'gallery', mode: 'duel',
    serverStep: (room, dt, now) => { physics.movePaddles(room, dt); return physics.stepPuckCompensated(room, dt, ON); }
  });
  assert.ok(old.gallery.trials > 50);
  assert.equal(old.gallery.lagComp.applied, 0);
});
