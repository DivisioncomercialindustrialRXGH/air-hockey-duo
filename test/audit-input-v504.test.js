import test from 'node:test';
import assert from 'node:assert/strict';
import {trackSnapshot,acceptMove} from '../src/input.js';
const fixture=()=>{const ws={};trackSnapshot(ws,10,1000,1000);return ws;};
test('only increasing inputs with an issued snapshot can request bounded rewind',()=>{
  const ws=fixture();
  assert.deepEqual(acceptMove(ws,{seq:1,ack:10,vt:980},1060),{seq:1,vt:980});
  assert.equal(acceptMove(ws,{seq:1,ack:10,vt:980},1060),null);
  assert.equal(acceptMove(ws,{seq:0},1060),null);
});
for(const [name,msg,now] of [
  ['forged snapshot',{seq:1,ack:9,vt:980},1060],
  ['future time',{seq:1,ack:10,vt:1080},1060],
  ['too old',{seq:1,ack:10,vt:600},1060],
  ['stale snapshot',{seq:1,ack:10,vt:1550},1600],
  ['no sequence',{ack:10,vt:980},1060],
  ['legacy client',{},1060]
])test(`input: ${name} keeps movement but has no compensation`,()=>assert.equal(acceptMove(fixture(),msg,now).vt,null));
test('a new socket cannot use the former socket snapshot evidence',()=>{
  fixture();assert.equal(acceptMove({},{seq:1,ack:10,vt:980},1060).vt,null);
});
test('render time cannot rewind between commands',()=>{
  const ws=fixture();acceptMove(ws,{seq:1,ack:10,vt:980},1060);
  assert.equal(acceptMove(ws,{seq:2,ack:10,vt:970},1061).vt,null);
});
