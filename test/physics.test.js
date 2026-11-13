import test from 'node:test';
import assert from 'node:assert/strict';
import { W, H, PADDLE_R, makeRoom, countdown, movePaddles, stepPuck, WIN_SCORE } from '../src/physics.js';

test('new room has two independent, mirrored paddle positions', () => {
  const r = makeRoom('ABC123');
  assert.equal(r.phase, 'waiting');
  assert.deepEqual(r.scores, [0, 0]);
  assert.equal(r.paddles[0].y, H - 127);
  assert.equal(r.paddles[1].y, 127);
});

test('paddles cannot enter opponent half', () => {
  const r = makeRoom('ABC123');
  r.paddles[0].ty = 0;
  r.paddles[1].ty = H;
  for (let i = 0; i < 100; i++) movePaddles(r, 1 / 60);
  assert.ok(r.paddles[0].y >= H/2+PADDLE_R+5);
  assert.ok(r.paddles[1].y <= H/2-PADDLE_R-5);
});

test('puck bounces against left wall', () => {
  const r = makeRoom('ABC123');
  r.puck = { x: 17, y: H/2, vx: -800, vy: 0 };
  assert.equal(stepPuck(r, 1/60), null);
  assert.ok(r.puck.vx > 0);
  assert.ok(r.puck.x >= 16);
});

test('server detects a goal only inside the goal opening', () => {
  const r = makeRoom('ABC123');
  r.puck = { x: W/2, y: 10, vx: 0, vy: -450 };
  assert.equal(stepPuck(r, 1/60), 0);
  r.puck = { x: W/2+180, y: 10, vx: 0, vy: -450 };
  assert.equal(stepPuck(r, 1/60), null);
  r.puck = { x: W/2, y: H-10, vx: 0, vy: 450 };
  assert.equal(stepPuck(r, 1/60), 1);
});

test('countdown resets the puck and paddle positions without resetting scores', () => {
  const r = makeRoom('ABC123');
  r.scores[0] = WIN_SCORE-1;
  r.paddles[0].x = 77;
  countdown(r, 1);
  assert.equal(r.phase, 'countdown');
  assert.ok(r.phaseEnd >= Date.now());
  assert.equal(r.paddles[0].x, W/2);
  assert.deepEqual(r.scores, [WIN_SCORE - 1, 0]);
});
