/**
 * Air Hockey DUO: authoritative game physics.
 * Shared by Cloudflare Durable Object and local no-dependencies tests.
 */
export const W = 500;
export const H = 900;
export const PADDLE_R = 37;
export const PUCK_R = 16;
export const GOAL_HALF = 94;
export const WIN_SCORE = 7;
export const TICK_RATE = 60;
export const SEND_RATE = 30;
const MAX_PADDLE_SPEED = 1900;
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function makeRoom(code) {
  return {
    code, players: [null, null], phase: 'waiting', scores: [0, 0],
    winner: null, goalBy: null, phaseEnd: 0, pauseMessage: '', lastUsed: Date.now(),
    paddles: [
      { x: W / 2, y: H - 127, tx: W / 2, ty: H - 127, vx: 0, vy: 0 },
      { x: W / 2, y: 127, tx: W / 2, ty: 127, vx: 0, vy: 0 }
    ],
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 }
  };
}

export function resetPaddles(room) {
  const initial = [[W / 2, H - 127], [W / 2, 127]];
  room.paddles.forEach((p, i) => {
    [p.x, p.y] = initial[i];
    [p.tx, p.ty] = initial[i];
    p.vx = 0;
    p.vy = 0;
  });
}

export function serve(room, toward = Math.random() < 0.5 ? 0 : 1) {
  const angle = (Math.random() - 0.5) * 0.7;
  const sign = toward === 0 ? 1 : -1;
  room.puck = {
    x: W / 2, y: H / 2,
    vx: Math.sin(angle) * 410,
    vy: sign * Math.cos(angle) * 410
  };
}

export function countdown(room, toward) {
  room.phase = 'countdown';
  room.phaseEnd = Date.now() + 3000;
  room.goalBy = null;
  room.winner = null;
  room.pauseMessage = '';
  resetPaddles(room);
  serve(room, toward);
}

export function movePaddles(room, dt) {
  room.paddles.forEach((p, i) => {
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.min(distance, MAX_PADDLE_SPEED * dt);
    const nx = distance > 0 ? dx / distance : 0;
    const ny = distance > 0 ? dy / distance : 0;
    const oldX = p.x, oldY = p.y;
    p.x = clamp(p.x + nx * step, PADDLE_R + 5, W - PADDLE_R - 5);
    p.y += ny * step;
    if (i === 0) p.y = clamp(p.y, H / 2 + PADDLE_R + 5, H - PADDLE_R - 20);
    else p.y = clamp(p.y, PADDLE_R + 20, H / 2 - PADDLE_R - 5);
    p.vx = (p.x - oldX) / dt;
    p.vy = (p.y - oldY) / dt;
  });
}

/** Return scorer (seat 0 or 1) or null. Room scores are not mutated here. */
export function stepPuck(room, dt) {
  const puck = room.puck;
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;
  const drag = Math.pow(0.99985, dt * 60);
  puck.vx *= drag;
  puck.vy *= drag;
  if (puck.x < PUCK_R) { puck.x = PUCK_R; puck.vx = Math.abs(puck.vx) * 0.97; }
  if (puck.x > W - PUCK_R) { puck.x = W - PUCK_R; puck.vx = -Math.abs(puck.vx) * 0.97; }
  const inGoal = puck.x > W / 2 - GOAL_HALF + 4 && puck.x < W / 2 + GOAL_HALF - 4;
  if (puck.y < PUCK_R) {
    if (inGoal) return 0;
    puck.y = PUCK_R;
    puck.vy = Math.abs(puck.vy) * 0.97;
  }
  if (puck.y > H - PUCK_R) {
    if (inGoal) return 1;
    puck.y = H - PUCK_R;
    puck.vy = -Math.abs(puck.vy) * 0.97;
  }
  for (const p of room.paddles) {
    let dx = puck.x - p.x, dy = puck.y - p.y;
    const minDist = PADDLE_R + PUCK_R;
    const distance = Math.hypot(dx, dy);
    if (distance >= minDist) continue;
    if (distance < 0.001) { dx = 0; dy = p.y > H / 2 ? -1 : 1; }
    const length = Math.hypot(dx, dy);
    const nx = dx / length, ny = dy / length;
    puck.x = p.x + nx * (minDist + 0.5);
    puck.y = p.y + ny * (minDist + 0.5);
    const relative = (puck.vx - p.vx) * nx + (puck.vy - p.vy) * ny;
    if (relative < 0) {
      puck.vx += -(1.72 * relative) * nx;
      puck.vy += -(1.72 * relative) * ny;
    }
    puck.vx += p.vx * 0.11;
    puck.vy += p.vy * 0.11;
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed < 280) { puck.vx = nx * 280; puck.vy = ny * 280; }
    if (speed > 1250) {
      puck.vx = puck.vx / speed * 1250;
      puck.vy = puck.vy / speed * 1250;
    }
  }
  return null;
}
