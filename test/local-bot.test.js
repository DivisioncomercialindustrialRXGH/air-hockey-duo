import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLocalBot,tickLocalBot,rematchLocalBot,resetLocalBot} from '../public/local-bot.js';
import {unsafeDelayedGoalShot,MAX_PUCK_SPEED,H} from '../src/physics.js';
const input={x:250,y:740};

test('browser physics is byte-for-byte identical to authoritative server engine',()=>{
  for(const file of ['physics.js','geometry.js']){
    const server=readFileSync(new URL(`../src/${file}`,import.meta.url));
    const browser=readFileSync(new URL(`../public/engine/${file}`,import.meta.url));
    assert.deepEqual(browser,server);
  }
});
test('solo BOT has exactly two players and starts immediately without socket',()=>{
  const session=createLocalBot({mode:'bot',botDifficulty:'god',powers:true,maxScore:7,timeLimit:120},'Atacante',10_000);
  assert.equal(session.room.players.length,2);
  assert.equal(session.room.players[1].bot,true);
  assert.equal(session.room.phase,'countdown');
  assert.equal(session.room.settings.mode,'bot');
});
test('solo simulation at 60 ticks per second keeps positions and speed finite',()=>{
  const session=createLocalBot({mode:'bot',botDifficulty:'hard',powers:true,maxScore:15,timeLimit:0},'Jugador');
  session.room.phase='playing';
  let lastFrame=0;
  for(let i=0;i<6000;i++){
    const frame=i*1000/60;
    const state=tickLocalBot(session,frame,{x:250+Math.sin(i/33)*160,y:690+Math.cos(i/25)*70});
    assert.ok(['playing','goal','countdown','gameover','overtime'].includes(state.phase));
    assert.ok(Number.isFinite(state.puck.x)&&Number.isFinite(state.puck.y));
    assert.ok(Math.hypot(state.puck.vx,state.puck.vy)<MAX_PUCK_SPEED+1e-5);
    assert.equal(state.paddles.length,2);
    assert.ok(state.puck.x>=0&&state.puck.x<=500);
    lastFrame=frame;
  }
  assert.ok(lastFrame>90_000);
});
test('solo scores, reset, cooldown and rematch use the same match rules',()=>{
  const session=createLocalBot({mode:'bot',maxScore:3,powers:false},'Atacante');
  session.room.phase='playing';session.now=Date.now()+20_000;
  assert.equal(resetLocalBot(session),null);
  assert.match(resetLocalBot(session),/volver a recentrar/);
  session.room.phase='gameover';session.room.scores=[3,2];session.room.winner=0;
  assert.equal(rematchLocalBot(session),true);
  assert.deepEqual(session.room.scores,[0,0]);
  assert.equal(session.room.phase,'countdown');
});
test('late compensated bounce cannot be turned into an immediate goal-side cannon',()=>{
  assert.equal(unsafeDelayedGoalShot({x:250,y:120,vy:410},0,-1300,110),true);
  assert.equal(unsafeDelayedGoalShot({x:250,y:H-115,vy:-410},0,1300,110),true);
  assert.equal(unsafeDelayedGoalShot({x:250,y:120,vy:-1300},0,800,110),false);
  assert.equal(unsafeDelayedGoalShot({x:250,y:H-120,vy:1300},0,-800,110),false);
  assert.equal(unsafeDelayedGoalShot({x:250,y:450,vy:410},0,-1300,110),false);
  assert.equal(unsafeDelayedGoalShot({x:250,y:120,vy:410},0,-1300,10),false);
});
test('local game never sends a websocket movement or requires Cloudflare for bot state',()=>{
  const game=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
  assert.match(game,/if\(settings.mode==='bot'\)/);
  assert.match(game,/engine\.tickLocalBot/);
  assert.match(game,/app\.localBot\?\{\.\.\.puckTarget\}/);
});

test('standalone installation caches the entire local physics engine and arena preview',()=>{
  const worker=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
  for(const file of ['/engine/physics.js','/engine/geometry.js','/local-bot.js?v=5.3.0-choices.1','/arena-lab.html'])
    assert.ok(worker.includes(file),file);
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/arena-lab\.html/);
});
