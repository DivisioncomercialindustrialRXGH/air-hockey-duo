import {trackSnapshot,acceptMove} from '../../src/input.js';
/**
 * Deterministic network simulator for Air Hockey DUO.
 *
 * Runs the REAL server physics (src/physics.js) and the REAL client timeline
 * code (public/motion.js) on one virtual clock, with a WebSocket-like link:
 *   - base one-way latency = RTT/2 (each direction)
 *   - jitter: exponential tail per message (mean = jitterMs)
 *   - "loss": WebSocket runs on TCP, so a lost segment is NOT dropped; it is
 *     retransmitted (>= 200 ms) and every later message waits behind it
 *     (head-of-line blocking) and then arrives in a burst.
 *
 * A scripted human aims at the puck exactly where the client DRAWS it, so we
 * can measure whether "I touched it on screen" became a hit on the server.
 *
 * Nothing here is imported by the game; it is a test fixture only.
 */
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

class Link {
  constructor(rng, { rttMs, jitterMs = 0, lossRate = 0, spikeRate = 0, spikeMs = 0 }) {
    this.rng = rng; this.oneWay = rttMs / 2; this.jitter = jitterMs; this.loss = lossRate;
    this.spikeRate = spikeRate; this.spikeMs = spikeMs; this.rto = Math.max(200, rttMs * 2);
    this.queue = []; this.lastArrival = -Infinity;
  }
  send(now, payload) {
    let delay = this.oneWay;
    if (this.jitter > 0) delay += -Math.log(1 - this.rng() * 0.999) * this.jitter;
    if (this.spikeRate && this.rng() < this.spikeRate) delay += this.spikeMs;
    if (this.loss && this.rng() < this.loss) delay += this.rto;
    // TCP: in-order delivery. A delayed message holds back the ones behind it.
    const arrival = Math.max(now + delay, this.lastArrival + 0.05);
    this.lastArrival = arrival;
    this.queue.push({ arrival, payload });
  }
  receive(now) {
    const out = [];
    while (this.queue.length && this.queue[0].arrival <= now) out.push(this.queue.shift().payload);
    return out;
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function percentile(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

/** Rendering policies for each release (copied from each game.js). */
export const POLICIES = {
  '5.0.1': (clock, rtt) => ({ delayMs: Math.min(245, (clock.delayMs || 135) + Math.max(0, (rtt || 0) - 180) * .12), maxExtrapolateMs: 105 }),
  '5.0.2': (clock, rtt) => ({ delayMs: Math.max(45, Math.min(100, 48 + Math.max(0, clock.jitter || 0) * .6 + Math.max(0, (rtt || 0) - 100) * .12)), maxExtrapolateMs: 58 }),
  '5.0.4-rc.2': (clock) => ({ delayMs: Math.max(24, Math.min(170, clock.delayMs ?? 60)), maxExtrapolateMs: 50 }),
  '5.0.4': (clock) => ({ delayMs: Math.max(24, Math.min(170, clock.delayMs ?? 60)), maxExtrapolateMs: 50 }),
  '5.0.3': (clock) => ({ delayMs: Math.max(24, Math.min(170, clock.delayMs ?? 60)), maxExtrapolateMs: 50 })
};

/**
 * @param {object} o
 * @param {object} o.physics   imported physics module
 * @param {object} o.motion    imported motion module
 * @param {string} o.policy    key of POLICIES
 * @param {object} o.net       {rttMs, jitterMs, lossRate, spikeRate, spikeMs}
 */
export function runMatch(o) {
  const { physics: P, motion: M } = o;
  const modern=['5.0.4','5.0.4-rc.2'].includes(o.policy);
  // 5.0.3 server path, mirroring worker.js: vt -> setViewLag, stepPuckCompensated.
  if (o.lagComp) {
    o = {
      ...o, sendViewTime: true,
      applyMove: (room, seat, msg, now) => {
        const b = P.boundsForPaddle(room, seat);
        const rx = seat === 1 ? P.W - msg.x : msg.x, ry = seat === 1 ? P.H - msg.y : msg.y;
        room.paddles[seat].tx = clamp(rx, b.minX, b.maxX); room.paddles[seat].ty = clamp(ry, b.minY, b.maxY);
        if(modern){
          const input=acceptMove(room.paddles[seat],msg,now,o.lagComp.maxMs??120);
          P.clearViewInput(room,seat);
          if(input?.vt!==null&&input?.vt!==undefined)P.setViewInput(room,seat,input.vt,now);
        }else if (Number.isFinite(msg.vt)) P.setViewLag(room, seat, now - msg.vt);
      },
      serverStep: (room, dt, now) => { P.updateBot(room, now); P.movePaddles(room, dt); return P.stepPuckCompensated(room, dt, modern?{...o.lagComp,now}:o.lagComp); }
    };
  }
  const rng = makeRng(o.seed ?? 7);
  // physics.serve() uses Math.random: make every run reproducible.
  const realRandom = Math.random; const physicsRng = makeRng((o.seed ?? 7) * 101 + 5);
  Math.random = physicsRng;
  try { return simulate(); } finally { Math.random = realRandom; }
  function simulate() {
  const net = o.net;
  const durationMs = o.durationMs ?? 60000;
  const mode = o.mode ?? 'bot';
  const room = P.makeRoom('NETSIM', { mode, botDifficulty: o.botDifficulty ?? 'hard', powers: false, timeLimit: 0, maxScore: 15 });
  if (o.serverOptions) room.netOptions = { ...o.serverOptions };
  const TICK = 1000 / 60;
  const humans = mode === 'bot' ? [0] : [0, 1];
  const clients = humans.map(seat => ({
    seat, side: seat, up: new Link(makeRng((o.seed ?? 7) * 31 + seat * 7 + 1), net),
    down: new Link(makeRng((o.seed ?? 7) * 17 + seat * 13 + 3), net),
    clock: o.clockCfg ? { cfg: o.clockCfg } : {}, frames: [], puckDraw: null, finger: { x: 250, y: 773 }, paddle: { x: 250, y: 773 },
    sendAt: -1e9, lastPointer: -1e9, follow: 0, rtt: net.rttMs, lastPing: 0,
    overlapping: false, contacts: [], depth: [], errors: [], staleness: [], extrapolated: 0, frames_n: 0,
    hitsSeen: 0
  }));
  const truth = []; // server puck log {t, x, y}
  const serverHits = []; // {t, paddle, comp}
  let goals = [0, 0];
  let now = 0, lastTick = 0, nextTick = 0;
  let snapshotCounter = 0, fixedDebt=0, simNow=0, lastTruthReset=0;
  room.phase = 'playing';
  P.serve(room, 0);
  const gallery = o.scenario === 'gallery';
  const trials = []; let trial = null; let nextLaunch = 300;const launchLog=[];
  const parkOpponent = () => { const q = room.paddles[1]; Object.assign(q, { x: 60, y: 60, tx: 60, ty: 60, prevX: 60, prevY: 60 }); };
  if (gallery) { parkOpponent(); room.puck = { x: 250, y: 150, vx: 0, vy: 0 }; }
  function launch(t) {
    const sx = 80 + rng() * 340, tx = 80 + rng() * 340, ty = 600 + rng() * 200;
    const speed = (o.speedMin ?? 450) + rng() * ((o.speedMax ?? 1400) - (o.speedMin ?? 450));
    const d = Math.hypot(tx - sx, ty - 200);
    launchLog.push({sx,tx,ty,speed});
    room.puck = { x: sx, y: 200, vx: (tx - sx) / d * speed, vy: (ty - 200) / d * speed };
    room.lastEvent = { ...room.lastEvent, id: room.lastEvent.id + 1, type: 'reset' };
    P.clearLagHistory?.(room);
    trial = { start: t, speed, hit: false, contact: false, outcome: null, goalsAt: goals[0] + goals[1] };
  }
  const orient = (p, side) => side === 1 ? { x: P.W - p.x, y: P.H - p.y } : { x: p.x, y: p.y };
  const policy = POLICIES[o.policy];
  const step = 1; // 1 ms resolution
  while (now < durationMs) {
    // ---- server tick (60 Hz, optional timer jitter) ----
    if (now >= nextTick) {
      const elapsed = clamp((now - lastTick) / 1000, 1 / 120, .083); lastTick = now;
      let substeps=Math.min(5,Math.max(1,Math.ceil(elapsed/(1/60)))),dt=elapsed/substeps;
      if(modern){fixedDebt+=now-(simNow+fixedDebt);substeps=Math.min(8,Math.floor((fixedDebt+.00001)/TICK));fixedDebt-=substeps*TICK;dt=1/60;}
      for (const c of clients) for (const msg of c.up.receive(now)) {
        if (msg.type === 'ping') { c.down.send(now, { type: 'pong', at: msg.at }); continue; }
        if (o.applyMove) o.applyMove(room, c.seat, msg, now);
        else {
          const b = P.boundsForPaddle(room, c.seat);
          const rx = c.side === 1 ? P.W - msg.x : msg.x, ry = c.side === 1 ? P.H - msg.y : msg.y;
          room.paddles[c.seat].tx = clamp(rx, b.minX, b.maxX); room.paddles[c.seat].ty = clamp(ry, b.minY, b.maxY);
        }
      }
      for (let s = 0; s < substeps; s++) {
        if (room.phase === 'playing') {
          const evBefore = room.lastEvent.id;
          if (o.serverStep) {
            const scorer = o.serverStep(room, dt, modern?simNow+(s+1)*TICK:now);
            if (scorer !== null) { goals[scorer]++; room.scores[scorer]++; P.serve(room, 1 - scorer); P.resetPaddles(room); room.lastEvent = { ...room.lastEvent, id: room.lastEvent.id + 1, type: 'reset' }; }
          } else {
            P.updateBot(room, now); P.movePaddles(room, dt);
            const scorer = P.stepPuck(room, dt);
            if (scorer !== null) { goals[scorer]++; room.scores[scorer]++; P.serve(room, 1 - scorer); P.resetPaddles(room); room.lastEvent = { ...room.lastEvent, id: room.lastEvent.id + 1, type: 'reset' }; }
          }
          if (room.lastEvent.id !== evBefore) {
            for (const e of (room.eventLog?.splice(0) ?? [room.lastEvent])) {
              if (e.type === 'hit') { serverHits.push({ t: now, paddle: Number(e.detail), comp: e.comp === true }); if (trial && Number(e.detail) === 0) { trial.hit = true; if (e.comp) trial.comp = (trial.comp || 0) + 1; else trial.plain = (trial.plain || 0) + 1; } }
            }
          } else room.eventLog?.splice(0);
        }
      }
      if(modern)simNow+=substeps*TICK;
      if (gallery) {
        parkOpponent();
        if (!trial && now >= nextLaunch) {launch(now);if(o.fixedShots)nextLaunch+=3000;}
        else if (trial) {
          const back = room.puck.y < 430 && room.puck.vy < 0;
          const scored = goals[0] + goals[1] !== (trial.goalsAt ?? (trial.goalsAt = goals[0] + goals[1]));
          if (back || scored || now - trial.start > 2500) {
            trial.outcome = scored ? 'goal' : back ? 'returned' : 'timeout';
            trials.push(trial); trial = null; if(!o.fixedShots)nextLaunch = now + 500;
            room.puck = { x: 250, y: 150, vx: 0, vy: 0 };
            room.lastEvent = { ...room.lastEvent, id: room.lastEvent.id + 1, type: 'reset' };
          }
        }
      }
      const reset=room.lastEvent.type==='reset'&&room.lastEvent.id!==lastTruthReset;
      if(reset)lastTruthReset=room.lastEvent.id;
      truth.push({ t:modern?simNow:now, x:room.puck.x,y:room.puck.y,reset });
      snapshotCounter++;
      if (snapshotCounter % 2 === 0) {
        const state = {
          type: 'state', seq:snapshotCounter, serverNow:modern?simNow:now, phase: room.phase,
          puck: { ...room.puck, r: P.puckRadius(room) }, paddles: room.paddles.map(p => ({ x: p.x, y: p.y })),
          event: { ...room.lastEvent }
        };
        for (const c of clients){if(modern)trackSnapshot(room.paddles[c.seat],state.seq,state.serverNow,now);c.down.send(now,JSON.parse(JSON.stringify(state)));}
      }
      nextTick += TICK + (o.timerJitterMs ? (rng() - .5) * 2 * o.timerJitterMs : 0);
    }
    // ---- clients ----
    for (const c of clients) {
      for (const msg of c.down.receive(now)) {
        if (msg.type === 'pong') { const ping = now - msg.at; c.rtt = c.rtt * .72 + ping * .28; continue; }
        const prevEvent = c.lastEvent;
        c.lastEvent = msg.event;c.ack=msg.seq;
        const tick = M.serverFrameTime(c.clock, msg.serverNow, now);
        const reset = (msg.event.type === 'reset' && msg.event.id !== prevEvent?.id) || tick.reset;
        if (reset) { c.frames = []; c.puckDraw = null; }
        const facing = c.side === 1 ? -1 : 1;
        const op = orient(msg.puck, c.side);
        M.pushSnapshot(c.frames, { at: modern?msg.serverNow:tick.at, serverNow: msg.serverNow, x: op.x, y: op.y, vx: msg.puck.vx * facing, vy: msg.puck.vy * facing, r: msg.puck.r });
      }
      // Pointer events at 120 Hz; render at 60 Hz.
      if (now - c.lastPointer >= 8.33) {
        c.lastPointer = now;
        humanPolicy(c, now);
        if (now - c.sendAt >= 16) sendMove(c, now);
      }
      if (now - c.lastPing >= 3000) { c.lastPing = now; c.up.send(now, { type: 'ping', at: now }); }
      if (Math.floor(now / TICK) !== Math.floor((now - step) / TICK)) renderFrame(c, now);
    }
    now += step;
  }

  function sendMove(c, t) {
    const msg = { type: 'move', x: c.finger.x, y: c.finger.y,seq:c.seq=(c.seq||0)+1,ack:c.ack };
    if (o.sendViewTime && c.viewServerTime !== undefined) msg.vt = c.viewServerTime;
    c.up.send(t, msg); c.sendAt = t;
  }
  function renderFrame(c, t) {
    if (!c.frames.length) return;
    const pol = policy(c.clock, c.rtt);
    const cursor=modern?M.playoutTime(c.clock,t):t;
    const target=M.samplePuckPose(c.frames,cursor,modern?{...pol,delayMs:0}:pol);
    const last = c.frames.at(-1);
    const offset = last.at - last.serverNow;
    const displayedServerTime=modern?target.at:t-pol.delayMs-offset;
    c.viewServerTime = M.serverTimeAt ? M.serverTimeAt(c.clock, t, pol.delayMs) : displayedServerTime;
    if (t - pol.delayMs > last.at) c.extrapolated++;
    c.frames_n++;
    let draw = M.softenPuckPosition(c.puckDraw, target, 1 / 60);
    if(modern)c.viewServerTime=draw.exact?draw.at:undefined;
    // Local paddle: same 3600 px/s visual follower as game.js
    const dx = c.finger.x - c.paddle.x, dy = c.finger.y - c.paddle.y, d = Math.hypot(dx, dy);
    if (d > .001) { const k = Math.min(1, 3600 / 60 / d); c.paddle.x += dx * k; c.paddle.y += dy * k; }
    // Visual contact = the disc reaches the mallet's rim on screen (before any guard)
    const gap = dist(c.paddle, draw) - (37 + draw.r);
    if (gap < 0.5 && !c.overlapping) c.contacts.push({ t, displayedServerTime });
    c.overlapping = gap < 0.5;
    if (gap < 0.5 && trial && c.seat === 0 && t - trial.start > 30) trial.contact = true;
    if (o.contactGuard && M.guardLocalContact) draw = M.guardLocalContact(draw, c.paddle, 37, o.contactGuard);
    c.puckDraw = draw;
    c.depth.push(Math.max(0, (37 + draw.r) - dist(c.paddle, draw)));
    // Visual error vs. the server truth at the instant the client intends to show
    const truthAt = sampleTruth(truth, displayedServerTime);
    if (truthAt && !truthAt.nearReset) {
      const tp = orient(truthAt, c.side);
      c.errors.push(dist(tp, draw));
      c.staleness.push(t - displayedServerTime);
    }
  }
  function humanPolicy(c, t) {
    const p = c.puckDraw;
    const home = { x: 250, y: 773 };
    let aim = home;
    if (p && p.y > 470 && (p.vy ?? 0) > -150) {
      const gap = dist(c.finger, p) - 53;
      if (gap < 8 || t < c.follow) {
        if (gap < 8) c.follow = t + 110;
        aim = { x: p.x + (p.x - c.finger.x) * .4, y: p.y - 70 };
      } else aim = { x: p.x, y: p.y + 34 };
    }
    const dx = aim.x - c.finger.x, dy = aim.y - c.finger.y, d = Math.hypot(dx, dy);
    const maxStep = (o.fingerSpeed ?? 1700) * 8.33 / 1000;
    if (d > .001) { const k = Math.min(1, maxStep / d); c.finger.x += dx * k; c.finger.y += dy * k; }
    c.finger.x = clamp(c.finger.x, 42, 458); c.finger.y = clamp(c.finger.y, 492, 843);
  }
  // ---- metrics ----
  const report = clients.map(c => {
    const mine = serverHits.filter(h => h.paddle === c.seat);
    let registered = 0; const used = new Set();
    for (const v of c.contacts) {
      const idx = mine.findIndex((h, i) => !used.has(i) && h.t >= v.displayedServerTime - 80 && h.t <= v.t + 120);
      if (idx >= 0) { used.add(idx); registered++; }
    }
    return {
      seat: c.seat,
      visualContacts: c.contacts.length,errorSamples:c.errors.length,renderedFrames:c.frames_n,
      registered,
      missRate: c.contacts.length ? 1 - registered / c.contacts.length : 0,
      serverHits: mine.length,
      compensatedHits: mine.filter(h => h.comp).length,
      ghostHits: Math.max(0, mine.length - registered),
      errP50: percentile(c.errors, .5), errP99: percentile(c.errors, .99), errMax: percentile(c.errors, 1),
      bigErrorFrames: c.errors.filter(e => e > 40).length / Math.max(1, c.errors.length),
      depthP95: percentile(c.depth.filter(d => d > 0), .95),
      stalenessMs: percentile(c.staleness, .5),
      extrapolatedPct: c.extrapolated / Math.max(1, c.frames_n),
      delayMs: c.clock.delayMs
    };
  });
  const g = trials;
  const withContact = g.filter(x => x.contact);
  const gal = gallery ? {
    trials: g.length,
    contacts: withContact.length,
    missAfterContact: withContact.length ? withContact.filter(x => !x.hit).length / withContact.length : 0,
    hitRate: g.length ? g.filter(x => x.hit).length / g.length : 0,
    hitsWithoutContact: g.filter(x => x.hit && !x.contact).length,
    conceded: g.filter(x => x.outcome === 'goal').length / Math.max(1, g.length),
    lagComp: P.lagCompStats ? P.lagCompStats(room) : null,
    trialsDetail: o.debug ? g : undefined
  } : null;
  return { goals, report, gallery: gal, launches:o.fixedShots?launchLog:undefined, serverHits: serverHits.length, debug: o.debug ? { clients, serverHits, truth } : undefined };
  }
}

function sampleTruth(log, t) {
  if (!log.length || t < log[0].t) return null;
  let lo = 0, hi = log.length - 1;
  if (t >= log[hi].t) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (log[m].t <= t) lo = m; else hi = m; }
  const a = log[lo], b = log[hi];
  const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
  // Skip samples next to serves/resets: the client deliberately snaps there.
  const nearReset = log.slice(Math.max(0, lo - 12), Math.min(log.length, hi + 12)).some(e => e.reset);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, nearReset };
}
