/** Zero-network solo simulation. Same production physics code as the online Worker.
 * The engine is vendored into /public/engine by scripts/sync-local-engine.mjs.
 * No Cloudflare room is opened and no local prediction/reconciliation is needed.
 */
import {
  makeRoom, countdown, updateBot, movePaddles, stepPuck, updatePower,
  recenterPuck, puckRadius, paddleRadius, boundsForPaddle, clamp, TICK_RATE, W, H
} from './engine/physics.js';

const QUANTUM = 1000/TICK_RATE;
const active = phase => ['playing','overtime','countdown'].includes(phase);

export function createLocalBot(settings, playerName, now = Date.now()) {
  const room = makeRoom('LOCAL', { ...settings, mode: 'bot' });
  room.players[0] = { name: String(playerName || 'Jugador').slice(0,20), bot: false };
  room.players[1] = { name: ({ easy: '🤖 Bot Fácil', hard: '🤖 Bot Difícil', god: '🤖 Bot Dios' })[room.settings.botDifficulty], bot: true };
  countdown(room);
  // Countdown and power timers use the wall clock, consistent with the Worker.
  // For deterministic tests the clock can be injected into tickLocalBot.
  return { room, accumulator: 0, lastFrame: null, now, seq: 0, lastManualResetAt: 0 };
}

function awardGoal(room, scorer, now) {
  room.scores[scorer]++;
  room.goalBy = scorer;
  room.puck.vx = room.puck.vy = 0;
  if (room.scores[scorer] >= room.settings.maxScore || (room.remainingMs === 0 && room.scores[0] !== room.scores[1])) {
    room.winner = scorer;
    room.phase = 'gameover';
  } else {
    room.phase = 'goal';
    room.phaseEnd = now + 1350;
  }
}

/** Advance at the same fixed 60Hz as server mode, with capped background catch-up. */
export function tickLocalBot(session, localTime, input) {
  const room = session.room;
  if (!Number.isFinite(localTime)) return snapshotLocalBot(session);
  if (session.lastFrame === null) session.lastFrame = localTime;
  session.accumulator += Math.min(100, Math.max(0, localTime - session.lastFrame));
  session.lastFrame = localTime;
  const count = Math.min(6, Math.floor((session.accumulator + 1e-5)/QUANTUM));
  session.accumulator -= count * QUANTUM;
  for (let i=0; i<count; i++) {
    // Fixed simulation sample for visual interpolation; never alters physics.
    session.visualPuckPrevious={...session.room.puck};
    const eventBefore=session.room.lastEvent?.id,phaseBefore=session.room.phase;
    session.visualPuckSafe=false;
    session.now += QUANTUM;
    const t = session.now;
    if (room.phase === 'goal' && t >= room.phaseEnd) countdown(room, 1-room.goalBy);
    if (room.phase === 'countdown' && t >= room.phaseEnd) room.phase = 'playing';
    if (!active(room.phase)) continue;
    const p = room.paddles[0], b = boundsForPaddle(room,0);
    if (input && Number.isFinite(input.x) && Number.isFinite(input.y)) {
      p.tx = clamp(input.x,b.minX,b.maxX);
      p.ty = clamp(input.y,b.minY,b.maxY);
    }
    room.simTime = t;
    updateBot(room,t);
    movePaddles(room,1/TICK_RATE);
    if (room.phase === 'playing' || room.phase === 'overtime') {
      room.elapsedMs += QUANTUM;
      if (room.remainingMs !== null && room.remainingMs > 0) {
        room.remainingMs = Math.max(0,room.remainingMs-QUANTUM);
        if (room.remainingMs === 0) {
          if (room.scores[0] !== room.scores[1]) {
            room.winner = room.scores[0]>room.scores[1]?0:1;
            room.phase = 'gameover';
          } else room.phase = 'overtime';
        }
      }
      if (room.phase === 'playing' || room.phase === 'overtime') {
        const scorer = stepPuck(room,1/TICK_RATE);
        if (scorer !== null) awardGoal(room,scorer,t);
        else updatePower(room,t);
        session.visualPuckSafe=scorer===null&&room.lastEvent?.id===eventBefore&&
          room.phase===phaseBefore&&['playing','overtime'].includes(room.phase);
      }
    }
  }
  return snapshotLocalBot(session);
}

export function snapshotLocalBot(session) {
  const room = session.room;
  return {
    type:'state',code:'LOCAL',phase:room.phase,
    players:room.players.map(p=>({name:p.name,connected:true,bot:p.bot})),
    paddles:room.paddles.map((p,i)=>({x:p.x,y:p.y,r:paddleRadius(room,i),ack:0})),
    puck:{...room.puck,r:puckRadius(room)},scores:[...room.scores],
    settings:room.settings,remainingMs:room.remainingMs,
    power:room.power,effect:room.effect,event:room.lastEvent,
    phaseEnd:room.phaseEnd,serverNow:session.now,seq:++session.seq,
    winner:room.winner,goalBy:room.goalBy,pauseMessage:'',
    activeSeats:[0,1],voiceReady:[false,false],tournament:null
  };
}

export function rematchLocalBot(session) {
  const room=session.room;
  if(room.phase!=='gameover')return false;
  room.elapsedMs=0;
  room.remainingMs=room.settings.timeLimit?room.settings.timeLimit*1000:null;
  room.lastTouch=null;room.scores=[0,0];room.winner=null;
  countdown(room);
  session.accumulator=0;
  return true;
}

export function resetLocalBot(session) {
  const now=session.now,room=session.room;
  if(!['playing','overtime'].includes(room.phase))return 'Recentrar está disponible durante la partida.';
  if(now-session.lastManualResetAt<15000)return `Puedes volver a recentrar en ${Math.ceil((15000-(now-session.lastManualResetAt))/1000)} s.`;
  session.lastManualResetAt=now;
  recenterPuck(room,now);
  return null;
}
