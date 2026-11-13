/**
 * Air Hockey DUO on Cloudflare Workers Free + SQLite Durable Objects.
 * ONE hub Durable Object handles small, private rooms; physics are authoritative.
 * Its hibernatable WebSockets sleep when nobody is actively playing.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  W, H, PADDLE_R, TICK_RATE, SEND_RATE, WIN_SCORE,
  clamp, makeRoom, countdown, movePaddles, stepPuck
} from './physics.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL = 30 * 60 * 1000;
const SEAT_TTL = 2 * 60 * 1000;
const MAX_ROOMS = 60; // Personal-use capacity guard; reconnect is always allowed.
const isConnected = ws => Boolean(ws && ws.readyState === 1);
const cleanRoomCode = code => typeof code === 'string' ? code.trim().toUpperCase() : '';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, platform: 'cloudflare' });
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return json({ error: 'Se requiere una conexión WebSocket' }, 426);
      }
      // A third-party page should not be able to drive a user's WebSocket session.
      const origin = request.headers.get('Origin');
      if (origin && new URL(origin).host !== url.host) return json({ error: 'Origen no autorizado' }, 403);
      const hub = env.HOCKEY_HUB.get(env.HOCKEY_HUB.idFromName('duo-hub-v1'));
      return hub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

export class HockeyHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rooms = new Map();
    this.timer = null;
    this.frame = 0;
    // Restore the lobby after an idle WebSocket hibernation or Worker restart.
    ctx.blockConcurrencyWhile(async () => {
      const records = await ctx.storage.get('rooms') || [];
      for (const [code, record] of records) {
        const room = {
          ...makeRoom(code), ...record,
          players: (record.players || [null, null]).map(p => p ? { ...p, ws: null } : null)
        };
        this.rooms.set(code, room);
      }
      for (const ws of ctx.getWebSockets()) {
        const attachment = ws.deserializeAttachment();
        if (!attachment) continue;
        const player = this.rooms.get(attachment.roomCode)?.players?.[attachment.seat];
        if (player && player.token === attachment.token && isConnected(ws)) {
          player.ws = ws;
          player.disconnectedAt = 0;
        }
      }
      for (const room of this.rooms.values()) {
        if (['countdown', 'goal', 'playing'].includes(room.phase)) {
          room.phase = 'paused';
          room.pauseMessage = 'Se ha recuperado la conexión';
        }
        if (room.players.every(p => isConnected(p?.ws)) && room.phase === 'paused') countdown(room);
      }
      this.prune();
      this.updateTimer();
    });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket requerido' }, 426);
    if (this.ctx.getWebSockets().length >= 120) return json({ error: 'Demasiadas conexiones' }, 429);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, data) {
    if (!isConnected(ws)) return;
    try { ws.send(JSON.stringify(data)); } catch { /* Disconnect handler will run. */ }
  }
  broadcast(room, data) {
    for (const p of room.players) this.send(p?.ws, data);
  }
  attached(room) {
    return room.players.every(p => p && isConnected(p.ws));
  }
  notify(room) {
    const now = Date.now();
    this.broadcast(room, {
      type: 'state', phase: room.phase,
      players: room.players.map(p => p ? { name: p.name, connected: isConnected(p.ws) } : null),
      scores: room.scores, paddles: room.paddles.map(p => ({ x: p.x, y: p.y })),
      puck: room.puck, phaseEnd: room.phaseEnd, serverNow: now,
      winner: room.winner, goalBy: room.goalBy, pauseMessage: room.pauseMessage
    });
  }
  async persist() {
    const snapshot = Array.from(this.rooms.entries(), ([code, room]) => [code, {
      ...room,
      players: room.players.map(p => p ? {
        name: p.name, token: p.token, disconnectedAt: p.disconnectedAt
      } : null)
    }]);
    await this.ctx.storage.put('rooms', snapshot);
  }
  prune() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      room.players.forEach((p, i) => {
        if (p && !isConnected(p.ws) && p.disconnectedAt && now - p.disconnectedAt > SEAT_TTL) room.players[i] = null;
      });
      if (!room.players.some(p => isConnected(p?.ws)) && now - room.lastUsed > ROOM_TTL) this.rooms.delete(code);
    }
  }
  newCode() {
    let code;
    do {
      const bytes = new Uint8Array(6);
      crypto.getRandomValues(bytes);
      code = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
    } while (this.rooms.has(code));
    return code;
  }
  maybeStart(room) {
    if (this.attached(room) && ['waiting', 'paused'].includes(room.phase)) countdown(room);
    this.updateTimer();
  }
  updateTimer() {
    const needsTicks = Array.from(this.rooms.values()).some(room =>
      ['playing', 'countdown', 'goal'].includes(room.phase) && this.attached(room)
    );
    if (needsTicks && !this.timer) {
      this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
    } else if (!needsTicks && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  goal(room, scorer) {
    room.scores[scorer]++;
    room.goalBy = scorer;
    room.puck.vx = room.puck.vy = 0;
    if (room.scores[scorer] >= WIN_SCORE) {
      room.phase = 'gameover';
      room.winner = scorer;
    } else {
      room.phase = 'goal';
      room.phaseEnd = Date.now() + 1300;
    }
    this.notify(room);
    this.ctx.waitUntil(this.persist());
    this.updateTimer();
  }
  tick() {
    this.frame++;
    const now = Date.now();
    let phaseChanged = false;
    for (const room of this.rooms.values()) {
      if (!this.attached(room)) continue;
      if (room.phase === 'countdown' && now >= room.phaseEnd) {
        room.phase = 'playing';
        phaseChanged = true;
      }
      if (room.phase === 'goal' && now >= room.phaseEnd) {
        countdown(room, 1 - room.goalBy);
        phaseChanged = true;
      }
      if (room.phase === 'playing' || room.phase === 'countdown') movePaddles(room, 1 / TICK_RATE);
      if (room.phase === 'playing') {
        const scorer = stepPuck(room, 1 / TICK_RATE);
        if (scorer !== null) { this.goal(room, scorer); phaseChanged = true; }
      }
      if (this.frame % (TICK_RATE / SEND_RATE) === 0) this.notify(room);
    }
    if (phaseChanged) this.ctx.waitUntil(this.persist());
  }
  async join(ws, msg) {
    const code = cleanRoomCode(msg.code);
    // First expire old rooms and disconnected seats, then look up the requested room.
    this.prune();
    const room = this.rooms.get(code);
    if (!room) return this.send(ws, { type: 'error', message: 'Esa sala no existe. Comprueba el código.' });
    if (ws.deserializeAttachment()?.roomCode) return this.send(ws, { type: 'error', message: 'Ya estás en una sala.' });
    const requestedToken = typeof msg.token === 'string' ? msg.token : '';
    let seat = room.players.findIndex(p => p?.token === requestedToken && requestedToken.length === 32);
    if (seat < 0) seat = room.players.findIndex(p => p === null);
    if (seat < 0) return this.send(ws, { type: 'error', message: 'Sala llena. Solo pueden jugar dos personas.' });
    const requestedName = typeof msg.name === 'string' ? msg.name.trim().slice(0, 20) : '';
    if (room.players[seat]) {
      const player = room.players[seat];
      if (player.ws && player.ws !== ws) {
        try { player.ws.close(4001, 'Otra sesión conectada'); } catch {}
      }
      player.ws = ws;
      player.disconnectedAt = 0;
    } else {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      room.players[seat] = { name: requestedName || `Jugador ${seat + 1}`, token, ws, disconnectedAt: 0 };
    }
    ws.serializeAttachment({ roomCode: code, seat, token: room.players[seat].token });
    room.lastUsed = Date.now();
    this.send(ws, { type: 'joined', code, seat, token: room.players[seat].token, goal: WIN_SCORE });
    this.maybeStart(room);
    this.notify(room);
    await this.persist();
  }
  async detach(ws) {
    const info = ws.deserializeAttachment();
    if (!info) return;
    const room = this.rooms.get(info.roomCode);
    const player = room?.players[info.seat];
    if (!room || player?.ws !== ws) return;
    player.ws = null;
    player.disconnectedAt = Date.now();
    room.lastUsed = Date.now();
    if (room.phase !== 'gameover') {
      room.phase = 'paused';
      room.pauseMessage = `${player.name} perdió la conexión`;
    }
    this.notify(room);
    this.updateTimer();
    await this.persist();
  }
  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 2048) return;
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'create') {
      if (ws.deserializeAttachment()?.roomCode) return;
      this.prune();
      if (this.rooms.size >= MAX_ROOMS) {
        return this.send(ws, { type: 'error', message: 'Se alcanzó el límite de salas. Intenta más tarde.' });
      }
      const code = this.newCode();
      this.rooms.set(code, makeRoom(code));
      await this.join(ws, { code, name: msg.name });
      return;
    }
    if (msg.type === 'join') return this.join(ws, msg);
    const info = ws.deserializeAttachment();
    if (!info) return;
    const room = this.rooms.get(info.roomCode);
    const player = room?.players[info.seat];
    if (!room || player?.ws !== ws || player?.token !== info.token) return;
    if (msg.type === 'move') {
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      let x = clamp(msg.x, PADDLE_R + 5, W - PADDLE_R - 5);
      let y = clamp(msg.y, H / 2 + PADDLE_R + 5, H - PADDLE_R - 20);
      if (info.seat === 1) { x = W - x; y = H - y; }
      const paddle = room.paddles[info.seat];
      paddle.tx = x;
      paddle.ty = y;
    } else if (msg.type === 'rematch' && room.phase === 'gameover' && this.attached(room)) {
      room.scores = [0, 0];
      room.winner = null;
      countdown(room);
      this.notify(room);
      this.updateTimer();
      await this.persist();
    }
  }
  async webSocketClose(ws) { await this.detach(ws); }
  async webSocketError(ws) { await this.detach(ws); }
}
