import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Test the actual Worker module's game events against an in-memory emulator.
// This does not replace a real wrangler dev / production end-to-end test.
class FakeDurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
globalThis.__HockeyFakeDurableObject = FakeDurableObject;
const workerUrl = new URL('../src/worker.js', import.meta.url);
const physicsUrl = new URL('../src/physics.js', import.meta.url);
const workerCode = readFileSync(workerUrl, 'utf8')
  .replace("import { DurableObject } from 'cloudflare:workers';", 'const DurableObject = globalThis.__HockeyFakeDurableObject;')
  .replace("from './physics.js';", `from '${physicsUrl.href}';`);
const { HockeyHub } = await import(`data:text/javascript;base64,${Buffer.from(workerCode).toString('base64')}`);

class Socket {
  readyState = 1;
  attachment = null;
  out = [];
  send(value) { this.out.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
  serializeAttachment(data) { this.attachment = data; }
  deserializeAttachment() { return this.attachment; }
  ofType(type) { return this.out.filter(m => m.type === type); }
}
class Context {
  constructor(storage = new Map(), sockets = []) {
    this.data = storage;
    this.sockets = sockets;
    this.pending = [];
    this.storage = {
      get: async key => this.data.get(key),
      put: async (key, value) => { this.data.set(key, structuredClone(value)); }
    };
  }
  getWebSockets() { return this.sockets; }
  blockConcurrencyWhile(fn) { this.ready = Promise.resolve().then(fn); return this.ready; }
  waitUntil(promise) { this.pending.push(Promise.resolve(promise)); }
  async flush() { await Promise.all(this.pending); this.pending = []; }
}

const send = async (hub, ws, payload) => hub.webSocketMessage(ws, JSON.stringify(payload));

test('two clients join the same real-time room, move, score, reconnect, rematch and recover storage', async () => {
  const ctx = new Context();
  const hub = new HockeyHub(ctx, {});
  await ctx.ready;
  const a = new Socket(), b = new Socket();
  ctx.sockets.push(a, b);
  await send(hub, a, { type: 'create', name: 'A' });
  const created = a.ofType('joined')[0];
  assert.match(created.code, /^[A-Z2-9]{6}$/);
  assert.equal(created.seat, 0);
  assert.equal(a.ofType('state').at(-1).phase, 'waiting');
  await send(hub, b, { type: 'join', code: created.code, name: 'B' });
  assert.equal(b.ofType('joined')[0].seat, 1);
  assert.equal(a.ofType('state').at(-1).phase, 'countdown');
  assert.equal(b.ofType('state').at(-1).phase, 'countdown');
  const room = hub.rooms.get(created.code);
  await send(hub, b, { type: 'move', x: 90, y: 700 });
  assert.equal(room.paddles[1].tx, 410);
  assert.equal(room.paddles[1].ty, 200);

  room.scores[0] = 6;
  hub.goal(room, 0);
  await ctx.flush();
  assert.equal(room.winner, 0);
  assert.equal(room.phase, 'gameover');
  assert.deepEqual(room.scores, [7, 0]);
  await send(hub, b, { type: 'rematch' });
  assert.equal(room.phase, 'countdown');
  assert.deepEqual(room.scores, [0, 0]);

  // A briefly loses mobile connectivity; its secret token retains its seat.
  a.close();
  await hub.webSocketClose(a);
  assert.equal(room.phase, 'paused');
  const a2 = new Socket();
  ctx.sockets.push(a2);
  await send(hub, a2, { type: 'join', code: created.code, token: created.token, name: 'A' });
  assert.equal(a2.ofType('joined')[0].seat, 0);
  assert.equal(room.phase, 'countdown');

  // A hibernated instance restores players from serialized WS attachments.
  clearInterval(hub.timer);
  hub.timer = null;
  room.phase = 'gameover';
  await hub.persist();
  const afterHibernation = new Context(ctx.data, [a2, b]);
  const hubRestored = new HockeyHub(afterHibernation, {});
  await afterHibernation.ready;
  const restoredRoom = hubRestored.rooms.get(created.code);
  assert.equal(restoredRoom.players[0].ws, a2);
  assert.equal(restoredRoom.players[1].ws, b);
  assert.equal(restoredRoom.phase, 'gameover');
  clearInterval(hubRestored.timer);
});

test('invalid room codes and third players are refused', async () => {
  const ctx = new Context();
  const hub = new HockeyHub(ctx, {});
  await ctx.ready;
  const a = new Socket(), b = new Socket(), intruder = new Socket();
  ctx.sockets.push(a,b,intruder);
  await send(hub, intruder, { type:'join', code: 'NOPE00', name:'test' });
  assert.match(intruder.ofType('error')[0].message, /no existe/);
  await send(hub, a, { type:'create', name:'Uno' });
  const code = a.ofType('joined')[0].code;
  await send(hub, b, { type:'join', code, name:'Dos' });
  await send(hub, intruder, { type:'join', code, name:'Tres' });
  assert.match(intruder.ofType('error').at(-1).message, /llena/);
  clearInterval(hub.timer);
});
