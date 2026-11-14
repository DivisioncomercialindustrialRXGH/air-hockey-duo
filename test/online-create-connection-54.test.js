import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
const fn=code.match(/function queue\(data\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(fn,'The room queue must remain a separately testable function');
function scenario(socket){
  const messages=[],calls=[],app={ws:socket,online:true,pending:null,room:null},ui={error:{textContent:''},connectionText:{textContent:''}};
  let nextId=0;const timers=new Map();
  const ctx={app,ui,navigator:{onLine:true},LAN_HOST:false,WebSocket:{OPEN:1,CONNECTING:0},
    send:x=>messages.push(x),connect:()=>calls.push('connect'),setConnection:x=>calls.push('state:'+x),
    showError:x=>calls.push('error:'+x),
    setTimeout:(cb,ms)=>{assert.equal(ms,15000);const id=++nextId;timers.set(id,cb);return id;},
    clearTimeout:id=>timers.delete(id)};
  let queue=Function(...Object.keys(ctx),'let roomRequestTimer=null;function clearRoomRequestTimer(){if(roomRequestTimer!==null){clearTimeout(roomRequestTimer);roomRequestTimer=null;}};'+fn+';return queue')(...Object.values(ctx));
  return {queue,app,messages,calls,timers};
}
test('online CREATE is never dropped when local UI falsely says connected but WebSocket is connecting',()=>{
  const s=scenario({readyState:0});s.queue({type:'create',name:'A'});
  assert.deepEqual(s.messages,[]);assert.equal(s.app.pending.type,'create');assert.deepEqual(s.calls,['state:false','connect']);
});
test('online CREATE is sent exactly once if WebSocket already open',()=>{
  const s=scenario({readyState:1});s.queue({type:'create',name:'A'});
  assert.equal(s.messages.length,1);assert.equal(s.app.pending,null);assert.deepEqual(s.calls,[]);
});
test('online room request is visibly timed out instead of disappearing forever',()=>{
  const s=scenario({readyState:0});s.queue({type:'create',name:'A'});
  for(const cb of s.timers.values())cb();
  assert.equal(s.app.pending,null);assert.ok(s.calls.some(x=>/error:No se pudo crear/.test(x)));
});
test('switching away from direct mode must reset stale connection state',()=>{
  assert.match(code,/if\(app\.ws\?\.readyState!==WebSocket\.OPEN\)setConnection\(false\)/);
});
