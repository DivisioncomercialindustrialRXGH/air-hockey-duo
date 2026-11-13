import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Test exactly the functions shipped to the browser, so changing the renderer
// cannot silently switch to "the local player is always blue" again.
const source=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
const start=source.indexOf('function paddleTeam(');
const end=source.indexOf('function isPlaying(',start);
assert.ok(start>=0 && end>start,'team helpers must exist');
const {paddleTeam,teamColor,isTeamMatch}=new Function(`${source.slice(start,end)}; return {paddleTeam,teamColor,isTeamMatch};`)();

test('duel keeps blue and pink independent of the viewing phone',()=>{
  const s={settings:{mode:'duel'}};
  assert.equal(paddleTeam(s,0),0);
  assert.equal(paddleTeam(s,1),1);
  assert.equal(teamColor(paddleTeam(s,0)),'#51e5ff');
  assert.equal(teamColor(paddleTeam(s,1)),'#ff65b9');
});

test('2 vs 2 colors follow team seats (both phone orientations)',()=>{
  const s={settings:{mode:'duo'}};
  assert.deepEqual(Array.from({length:4},(_,i)=>paddleTeam(s,i)),[0,0,1,1]);
  assert.equal(isTeamMatch(s),true);
});

test('4 vs 4 colors follow team seats',()=>{
  const s={settings:{mode:'teams'}};
  assert.deepEqual(Array.from({length:8},(_,i)=>paddleTeam(s,i)),[0,0,0,0,1,1,1,1]);
  assert.equal(isTeamMatch(s),true);
});

test('labels draw from the authoritative player seat and have responsive width caps',()=>{
  assert.match(source,/name:namesOnPaddles\?s\.players\[i\]\?\.name:null/);
  assert.match(source,/const laneWidth=s\.settings\?\.mode==='teams'\?105:170/);
  assert.match(source,/drawPaddle\(visual,me\.team,me\.r,me\.name,laneWidth,me\.lane\)/);
});
