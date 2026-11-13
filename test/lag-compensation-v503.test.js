import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRoom, movePaddles, stepPuck, stepPuckCompensated, setViewLag, viewLag, lagCompStats,
  lagCompConfig, updatePower, serve, MAX_PUCK_SPEED, W, H, LAG_COMP
} from '../src/physics.js';

const DT = 1 / 60;
/** History ticks with a static mallet, then ONE stroke tick (like worker.tick). */
function scenario({ puck0, lag = 100, from, to, opts = {}, ticks = 12, between }) {
  const room = makeRoom('LAGC', { mode: 'duel', powers: false });
  const p = room.paddles[0];
  Object.assign(p, { x: from.x, y: from.y, prevX: from.x, prevY: from.y, tx: from.x, ty: from.y });
  Object.assign(room.paddles[1], { x: 400, y: 100, prevX: 400, prevY: 100, tx: 400, ty: 100 });
  room.puck = { ...puck0 };
  setViewLag(room, 0, lag);
  for (let i = 0; i < ticks; i++) {
    movePaddles(room, DT);
    assert.equal(stepPuckCompensated(room, DT, opts), null, 'no goal while recording history');
  }
  between?.(room);
  const before = room.lastEvent.id, scores = [...room.scores];
  p.tx = to.x; p.ty = to.y;
  movePaddles(room, DT);
  const scorer = stepPuckCompensated(room, DT, opts);
  return { room, scorer, scores, event: room.lastEvent.id !== before ? room.lastEvent : null, stats: lagCompStats(room) };
}
// Disc falls at 900 px/s. The player SAW it 90 px higher (100 ms of view lag)
// and swept the mallet sideways through that image.
// A fast sideways strike changes the replay trajectory substantially. RC2
// commits its velocity only; the former jump knob cannot move the live disc.
const SWEEP = { puck0: { x: 250, y: 520, vx: 0, vy: 900 }, from: { x: 150, y: 625 }, to: { x: 215, y: 625 }, opts: { maxJumpPx: 200 } };

test('a stroke through the disc the player SAW (100 ms ago) is a server hit', () => {
  const r = scenario(SWEEP);
  assert.equal(r.scorer, null);
  assert.equal(r.event?.type, 'hit');
  assert.equal(r.event.detail, '0');
  assert.equal(r.event.comp, true);
  assert.equal(r.event.lagMs, 100);
  assert.ok(r.room.puck.vx > 200, `disc deflected sideways: ${r.room.puck.vx}`);
  assert.ok(Math.hypot(r.room.puck.vx, r.room.puck.vy) <= MAX_PUCK_SPEED + .01);
  assert.deepEqual(r.room.scores, r.scores);
  assert.equal(r.stats.applied, 1);
  assert.ok(r.stats.jumpMax <= 200);
});

test('A/B: the same stroke without compensation is the 5.0.2 miss', () => {
  for (const opts of [{ enabled: false }, lagCompConfig({ LAG_COMP_MAX_MS: '0' })]) {
    const r = scenario({ ...SWEEP, opts });
    assert.equal(r.event, null, 'no hit registered');
    assert.equal(r.room.puck.vx, 0);
  }
});

test('rewind is refused when its replay would score (no invented goals)', () => {
  // Disc ~24 px from the goal line; a downward stroke on its old image would
  // push it in during the replay. The authoritative present is kept instead.
  const r = scenario({ puck0: { x: 250, y: 710, vx: 0, vy: 900 }, from: { x: 180, y: 730 }, to: { x: 225, y: 770 } });
  assert.equal(r.scorer, null);
  assert.equal(r.event, null);
  assert.deepEqual(r.room.scores, r.scores);
  assert.equal(r.stats.rejGoal, 1);
  assert.ok(r.room.puck.y < H + 16 * .85, 'disc not inside the goal');
});

test('rewind never crosses another non-wall event (power, hit, reset)', () => {
  const r = scenario({
    ...SWEEP, between: room => {
      room.settings = { ...room.settings, powers: true };
      room.power = { type: 'miniRival', x: room.puck.x, y: room.puck.y, expires: Date.now() + 5000 };
      updatePower(room, Date.now());
      assert.equal(room.lastEvent.type, 'power');
    }
  });
  assert.equal(r.event, null);
  assert.equal(r.stats.applied, 0);
});

test('a new serve (countdown, reconnect, recenter) never rewinds into the previous rally', () => {
  const r = scenario({ ...SWEEP, between: room => serve(room, 0) });
  assert.equal(r.stats.applied, 0);
  assert.equal(r.event, null);
});

test('historical impact changes velocity only: even a large replay displacement cannot move the live puck', () => {
  const off=scenario({...SWEEP,opts:{enabled:false}});
  for(const opts of [{maxJumpPx:50},{}]){
    const on=scenario({...SWEEP,opts});
    assert.equal(on.room.puck.x,off.room.puck.x);assert.equal(on.room.puck.y,off.room.puck.y);
    assert.equal(on.event.comp,true);assert.equal(on.stats.jumpMax,0);
    assert.notEqual(on.room.puck.vx,off.room.puck.vx);
  }
});

test('rewind is capped at LAG_COMP.maxMs even if the client reports more', () => {
  // The claimed image is older than the hard history-age cap.
  const r = scenario({ puck0: { x: 250, y: 500, vx: 0, vy: 900 }, lag: 400, from: { x: 150, y: 515 }, to: { x: 215, y: 515 }, ticks: 22 });
  assert.equal(r.event, null);
});

test('view lag input is validated; the bot is never compensated', () => {
  const room = makeRoom('LAGV', { mode: 'bot', powers: false });
  setViewLag(room, 0, -5); setViewLag(room, 0, NaN); setViewLag(room, 0, 5000);
  assert.equal(viewLag(room, 0), 0);
  setViewLag(room, 0, 100); setViewLag(room, 0, 200);
  assert.ok(viewLag(room, 0) > 100 && viewLag(room, 0) < 200, 'smoothed');
  // Mirror of SWEEP for the top mallet: compensated for a human, never for the bot.
  const top = mode => {
    const r = makeRoom('TOP', { mode, powers: false });
    Object.assign(r.paddles[0], { x: 400, y: 800, prevX: 400, prevY: 800, tx: 400, ty: 800 });
    const q = r.paddles[1];
    r.puck = { x: 250, y: 380, vx: 0, vy: -900 };
    setViewLag(r, 1, 100);
    for (let i = 0; i < 13; i++) {
      Object.assign(q, i < 12 ? { x: 150, y: 275, prevX: 150, prevY: 275, tx: 150, ty: 275, motorVX: 0, motorVY: 0 } : {});
      if (i === 12) { q.prevX = 150; q.prevY = 275; q.x = 215; q.y = 275; } // one stroke, set directly
      stepPuckCompensated(r, DT, { maxJumpPx: 200 });
    }
    return lagCompStats(r).applied;
  };
  assert.equal(top('duel'), 1, 'human top mallet compensated');
  assert.equal(top('bot'), 0, 'bot mallet never compensated');
});

test('lagCompConfig: defaults, kill switch and clamping', () => {
  assert.deepEqual(lagCompConfig({}), { enabled: true, maxMs: LAG_COMP.maxMs, maxJumpPx: LAG_COMP.maxJumpPx });
  assert.equal(lagCompConfig({ LAG_COMP_MAX_MS: '0' }).enabled, false);
  assert.equal(lagCompConfig({ LAG_COMP_MAX_MS: '999' }).maxMs, LAG_COMP.maxMs);
  assert.equal(lagCompConfig({ LAG_COMP_MAX_JUMP_PX: '9999' }).maxJumpPx, LAG_COMP.maxJumpPx);
  assert.equal(lagCompConfig({ LAG_COMP_MAX_MS: 'abc' }).maxMs, LAG_COMP.maxMs);
  assert.equal(lagCompConfig({ LAG_COMP_MAX_MS: '80' }).maxMs, 80);
});

test('fuzz: 20,000 compensated ticks stay finite, bounded and score only through the mouth', () => {
  let seed = 4242;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const room = makeRoom('FUZZ', { mode: 'duel', powers: false });
  room.puck = { x: 250, y: 450, vx: 900, vy: 700 };
  let goals = 0;
  for (let i = 0; i < 20000; i++) {
    if (i % 7 === 0) { setViewLag(room, 0, rnd() * 220); setViewLag(room, 1, rnd() * 220); }
    room.paddles[0].tx = 37 + 426 * rnd(); room.paddles[0].ty = 495 + 360 * rnd();
    room.paddles[1].tx = 37 + 426 * rnd(); room.paddles[1].ty = 45 + 360 * rnd();
    movePaddles(room, DT);
    const before = { ...room.puck };
    const scorer = stepPuckCompensated(room, DT);
    const p = room.puck;
    assert.ok([p.x, p.y, p.vx, p.vy].every(Number.isFinite), `finite at ${i}`);
    assert.ok(Math.hypot(p.vx, p.vy) <= MAX_PUCK_SPEED + .1);
    const moved = Math.hypot(p.x - before.x, p.y - before.y);
    assert.ok(moved < 43 + LAG_COMP.maxJumpPx, `bounded correction at ${i}: ${moved}`);
    if (scorer !== null) {
      goals++;
      assert.ok(Math.abs(p.x - W / 2) < 94, 'goal only through the mouth');
      assert.ok(p.y < 0 || p.y > H, 'goal only beyond the line');
      room.puck = { x: 250, y: 450, vx: (rnd() - .5) * 1400, vy: (rnd() - .5) * 1400 };
    } else {
      assert.ok(p.x >= 15.5 && p.x <= W - 15.5);
    }
  }
  assert.ok(lagCompStats(room).applied > 0, 'compensation exercised');
  assert.ok(goals > 0);
});

test('lock fix: a second swing that starts within 6 px of the disc is a hit', () => {
  const room = makeRoom('LOCK2', { mode: 'duel', powers: false });
  const p = room.paddles[0];
  Object.assign(p, { x: 250, y: 700, prevX: 250, prevY: 700, tx: 250, ty: 700 });
  Object.assign(room.paddles[1], { x: 400, y: 100, prevX: 400, prevY: 100, tx: 400, ty: 100 });
  room.puck = { x: 250, y: 700 - 53 - 3, vx: 0, vy: -160 };
  p.contactLocked = true; p.contactNX = 0; p.contactNY = -1;
  let hits = 0, deepest = 0;
  for (let i = 0; i < 10; i++) {
    p.ty = p.y - 25; // 1500 px/s upward swing
    movePaddles(room, DT);
    const id = room.lastEvent.id;
    stepPuck(room, DT);
    if (room.lastEvent.id !== id && room.lastEvent.type === 'hit') hits++;
    deepest = Math.max(deepest, 53 - Math.hypot(room.puck.x - p.x, room.puck.y - p.y));
  }
  assert.ok(hits >= 1, '5.0.2 registered 0 hits here');
  assert.ok(room.puck.vy < -1000, `strong strike: ${room.puck.vy}`);
  assert.ok(deepest < 2, `disc never inside the mallet (5.0.2: 51 px): ${deepest}`);
});

test('lock fix keeps resting contact quiet: slow push = no impulse spam, no energy gain', () => {
  const room = makeRoom('REST', { mode: 'duel', powers: false });
  const p = room.paddles[0];
  Object.assign(p, { x: 250, y: 700, prevX: 250, prevY: 700, tx: 250, ty: 700 });
  Object.assign(room.paddles[1], { x: 400, y: 100, prevX: 400, prevY: 100, tx: 400, ty: 100 });
  room.puck = { x: 250, y: 647, vx: 0, vy: 0 };
  p.contactLocked = true; p.contactNX = 0; p.contactNY = -1;
  let hits = 0;
  for (let i = 0; i < 60; i++) {
    p.ty = p.y - 1; // 60 px/s, below REHIT_CLOSING_SPEED
    movePaddles(room, DT);
    const id = room.lastEvent.id;
    stepPuck(room, DT);
    if (room.lastEvent.id !== id && room.lastEvent.type === 'hit') hits++;
    assert.ok(Math.hypot(room.puck.vx, room.puck.vy) < 400);
  }
  assert.ok(hits <= 2, `hits while resting: ${hits}`);
});
