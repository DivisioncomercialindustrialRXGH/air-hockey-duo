import test from 'node:test';
import assert from 'node:assert/strict';
import {serverFrameTime, serverTimeAt, pushSnapshot, samplePuckPose, PLAYOUT} from '../public/motion.js';

/** Feed snapshots every 33 ms; delayOf(i) = one-way delay of packet i (ms). */
function feed(n, delayOf, clock = {}) {
  const out = [];
  let lastArrival = -Infinity;
  for (let i = 0; i < n; i++) {
    const server = 50000 + i * 33.3;
    const arrival = Math.max(server + delayOf(i), lastArrival + .05); // in-order (TCP)
    lastArrival = arrival;
    const prevDelay = clock.delayMs;
    const r = serverFrameTime(clock, server, arrival);
    out.push({ ...r, server, arrival, delay: clock.delayMs, prevDelay });
  }
  return { clock, out };
}

test('a slow FIRST packet no longer leaves the whole match late (5.0.2 anchor bug)', () => {
  // First snapshot +150 ms (radio wake-up), then a steady 40 ms path.
  const { out } = feed(120, i => i === 0 ? 190 : 40);
  const tail = out.slice(-30);
  // Display time tracks the real path within a few ms, not 150 ms behind it.
  for (const f of tail) assert.ok(f.arrival - f.at < 6, `late by ${f.arrival - f.at}`);
  assert.ok(tail.at(-1).delay < 45, `buffer ${tail.at(-1).delay}`);
});

test('route change +40 ms (Wi-Fi to 4G): buffer adapts, frames stop arriving after they are needed', () => {
  const { out } = feed(400, i => i < 150 ? 35 : 75 + (i % 5) * 4);
  // After adaptation, frames are available when the renderer needs them.
  const late = out.slice(250).filter(f => f.arrival > f.at + f.delay).length;
  assert.ok(late / 150 < .1, `starved frames: ${late}`);
  assert.ok(out.at(-1).delay <= PLAYOUT.maxMs);
});

test('buffer changes are slewed (no visible time warps) and stay inside bounds', () => {
  let seed = 9;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const { out } = feed(600, () => 40 - Math.log(1 - rnd() * .999) * 25 + (rnd() < .02 ? 220 : 0));
  for (const f of out.slice(1)) {
    if (f.prevDelay === undefined) continue;
    assert.ok(f.delay - f.prevDelay <= 4.001 && f.prevDelay - f.delay <= .601);
    assert.ok(f.delay >= 24 && f.delay <= PLAYOUT.maxMs);
  }
  for (let i = 1; i < out.length; i++) assert.ok(out[i].at > out[i - 1].at, 'monotonic');
});

test('a suspended tab / reconnect (>1.8 s divergence) resets the timeline', () => {
  const clock = {};
  serverFrameTime(clock, 1000, 1040);
  serverFrameTime(clock, 1033, 1073);
  const r = serverFrameTime(clock, 1066, 1066 + 4000);
  assert.equal(r.reset, true);
});

test('serverTimeAt maps the rendered instant back to server time (input for lag compensation)', () => {
  const { clock, out } = feed(60, () => 45);
  const last = out.at(-1);
  const now = last.arrival;
  const vt = serverTimeAt(clock, now, clock.delayMs);
  assert.ok(Math.abs(vt - (last.server - clock.delayMs)) < 3, `vt=${vt}`);
  assert.equal(serverTimeAt({}, now), undefined);
});

test('interpolated puck at the playout time matches the server trajectory (no jitter leak)', () => {
  let seed = 3;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const clock = {}, frames = [];
  const path = t => ({ x: 250 + 200 * Math.sin(t / 600), y: 450 });
  let lastArrival = -Infinity, worst = 0;
  const packets = [];
  for (let i = 0; i < 300; i++) {
    const server = 1000 + i * 33.3;
    const arrival = Math.max(server + 40 + rnd() * 30, lastArrival + .05);
    lastArrival = arrival;
    packets.push({ server, arrival });
  }
  let k = 0;
  for (let now = 1100; now < 10500; now += 16.7) {
    while (k < packets.length && packets[k].arrival <= now) {
      const p = packets[k++];
      const { at } = serverFrameTime(clock, p.server, p.arrival);
      pushSnapshot(frames, { at, ...path(p.server), vx: 0, vy: 0, r: 16 });
    }
    if (k < 40) continue;
    const pose = samplePuckPose(frames, now, { delayMs: clock.delayMs, maxExtrapolateMs: 50 });
    const truth = path(serverTimeAt(clock, now));
    worst = Math.max(worst, Math.abs(pose.x - truth.x));
  }
  assert.ok(worst < 6, `max visual error ${worst.toFixed(1)} px`);
});
