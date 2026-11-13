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
const tournamentUrl = new URL('../src/tournament.js', import.meta.url);
const workerCode = readFileSync(workerUrl, 'utf8')
  .replace("import { DurableObject } from 'cloudflare:workers';", 'const DurableObject = globalThis.__HockeyFakeDurableObject;')
  .replace("from './physics.js';", `from '${physicsUrl.href}';`)
  .replace("from './tournament.js';", `from '${tournamentUrl.href}';`);
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

test('2 vs 2 creates four independent seats, assigns team zones and relays chat with emojis', async()=>{
  const ctx=new Context();const hub=new HockeyHub(ctx,{});await ctx.ready;
  const sockets=Array.from({length:4},()=>new Socket());ctx.sockets.push(...sockets);
  await send(hub,sockets[0],{type:'create',name:'Azul A',settings:{mode:'duo',puckSize:'L',maxScore:5}});
  const code=sockets[0].ofType('joined')[0].code;
  for(let i=1;i<4;i++)await send(hub,sockets[i],{type:'join',code,name:`P${i}`});
  const r=hub.rooms.get(code);assert.equal(r.players.length,4);assert.equal(r.paddles.length,4);
  assert.equal(r.phase,'countdown');assert.equal(r.settings.puckSize,'L');
  await send(hub,sockets[2],{type:'move',x:420,y:755});
  // Team 1 has mirrored display coordinates.
  assert.ok(r.paddles[2].tx < 250);assert.ok(r.paddles[2].ty < 450);
  await send(hub,sockets[3],{type:'chat',text:'👏 ¡Vamos!'});
  assert.equal(sockets[0].ofType('chat').at(-1).message.text,'👏 ¡Vamos!');
  clearInterval(hub.timer);
});

test('4 vs 4 allocates eight paddles across four non-overlapping lanes per side',async()=>{
  const ctx=new Context();const hub=new HockeyHub(ctx,{});await ctx.ready;
  const sockets=Array.from({length:8},()=>new Socket());ctx.sockets.push(...sockets);
  await send(hub,sockets[0],{type:'create',settings:{mode:'teams',puckSize:'S'}});
  const code=sockets[0].ofType('joined')[0].code;
  for(let i=1;i<8;i++)await send(hub,sockets[i],{type:'join',code,name:`J${i}`});
  const r=hub.rooms.get(code);assert.equal(r.paddles.length,8);
  assert.equal(r.phase,'countdown');
  assert.ok(r.paddles.slice(0,4).every(p=>p.y>450));
  assert.ok(r.paddles.slice(4).every(p=>p.y<450));
  clearInterval(hub.timer);
});

test('4-person tournament draws pairs, advances winners and crowns a champion',async()=>{
  const ctx=new Context();const hub=new HockeyHub(ctx,{});await ctx.ready;
  const sockets=Array.from({length:4},()=>new Socket());ctx.sockets.push(...sockets);
  await send(hub,sockets[0],{type:'create',name:'A',settings:{mode:'tournament',tournamentSize:4,maxScore:3,timeLimit:60}});
  const code=sockets[0].ofType('joined')[0].code;
  for(let i=1;i<4;i++)await send(hub,sockets[i],{type:'join',code,name:`P${i}`});
  const r=hub.rooms.get(code);
  assert.equal(r.tournament.started,true);assert.equal(r.tournament.round,1);
  assert.equal(r.activeSeats.length,2);
  for(let match=0;match<3;match++){
    r.scores[0]=2;hub.goal(r,0);
    assert.equal(r.phase,'tournament_wait');
    r.phaseEnd=Date.now()-1;hub.tick();
  }
  assert.equal(r.phase,'champion');assert.equal(r.tournament.finished,true);
  assert.equal(r.tournament.history.filter(m=>!m.bye).length,3);
  assert.equal(r.tournament.stats[r.tournament.champion].wins,2);
  clearInterval(hub.timer);await ctx.flush();
});
