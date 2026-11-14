import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {samplePuckPose} from '../public/motion.js';
const root=new URL('../public/',import.meta.url);
const sw=readFileSync(new URL('sw.js',root),'utf8');
const html=readFileSync(new URL('index.html',root),'utf8');
const game=readFileSync(new URL('game.js',root),'utf8');
const CACHE='hockey-duo-v5-5-0-cross-beta';
const VERSION='5.5.0-cross-beta.1';
function harness(networkWorks=true){
  const listeners={},db=new Map(),deleted=[];
  const response={ok:true,status:200,type:'basic',clone(){return this;}};
  function area(name){
    if(!db.has(name))db.set(name,new Map());
    return {
      async addAll(paths){
        for(const path of paths){
          if(!path.startsWith('/'))throw Error('Absolute path required');
          if(!networkWorks)throw Error('offline during install');
          db.get(name).set(path,response);
        }
      },
      async match(request){return db.get(name).get(typeof request==='string'?request:request.url.replace('https://test.invalid',''));},
      async put(req,res){db.get(name).set(typeof req==='string'?req:req.url.replace('https://test.invalid',''),res);}
    };
  }
  const caches={open:async name=>area(name),keys:async()=>[...db.keys()],delete:async key=>{deleted.push(key);return db.delete(key);},
    match:async req=>{for(const name of db.keys()){let val=await area(name).match(req);if(val)return val;}return undefined;}};
  const fetch=async()=>{if(!networkWorks)throw Error('No Internet');return response;};
  const self={location:{origin:'https://test.invalid'},clients:{claim:async()=>{}},
    addEventListener:(name,cb)=>listeners[name]=cb,skipWaiting:async()=>{}};
  runInNewContext(sw,{self,caches,fetch,URL,Response:{error:()=>({status:0})}});
  return {db,listeners,caches,response,deleted};
}
test('offline app shell caches every imported local engine and current version',async()=>{
  const h=harness();let pending;
  h.listeners.install({waitUntil:x=>pending=x});await pending;
  const cached=h.db.get(CACHE);assert.ok(cached?.size>=16);
  for(const path of ['/','/engine/physics.js','/engine/geometry.js','/local-duel.js?v=5.4.0-direct.1',
     '/local-bot.js?v=5.3.0-choices.1',`/game.js?v=${VERSION}`,`/motion.js?v=${VERSION}`])assert.ok(cached.has(path),path);
  assert.ok(!cached.has('/index.html'),'avoid redirected navigation entry');
  assert.match(html,/id="offline-ready"/);
  assert.match(html,/5\.5\.0-cross-beta\.1/);
  assert.match(game,/refreshOfflineReadiness/);
  assert.match(game,/navigator\.onLine===false\?'screen':'online'/);
});
test('offline restart serves cached PWA shell for any route including room links',async()=>{
  const h=harness();let install;
  h.listeners.install({waitUntil:x=>install=x});await install;
  const calls=[];const req={method:'GET',url:'https://test.invalid/?sala=ABCDEF',mode:'navigate',headers:{has:()=>false}};
  let result;
  const f=async()=>{throw Error('Offline');};
  const listeners={};const self={location:{origin:'https://test.invalid'},addEventListener:(name,cb)=>listeners[name]=cb,clients:{claim:async()=>{}},skipWaiting:async()=>{}};
  runInNewContext(sw,{self,caches:h.caches,fetch:f,URL,Response:{error:()=>({status:0})}});
  listeners.fetch({request:req,respondWith:p=>result=p,waitUntil:x=>calls.push(x)});
  assert.equal(await result,h.response);
});
test('online websocket and health are never intercepted by offline cache',()=>{
  const h=harness();
  for(const path of ['/ws','/health']){
    let used=false;
    h.listeners.fetch({request:{method:'GET',url:'https://test.invalid'+path,mode:'no-cors',headers:{has:()=>false}},respondWith:()=>{used=true;}});
    assert.equal(used,false,path);
  }
});
test('offline mode keeps two-player same-screen and Wi-Fi LAN routes',()=>{
  assert.match(game,/if\(selectedTransport==='screen'\)/);
  assert.match(game,/startSameScreen\(settings,name\)/);
  assert.match(game,/const LAN_HOST/);
  assert.match(html,/LAN CON PC/);
});
test('collision-aware puck interpolation follows a real reversal rather than visually crossing the mallet',()=>{
  const frames=[{at:0,x:200,y:450,vx:1000,vy:0,r:16},
    {at:100,x:200,y:450,vx:-1000,vy:0,r:16,eventKind:'wall'}];
  const a=samplePuckPose(frames,50,{delayMs:0});
  assert.ok(Math.abs(a.x-250)<.01,'must travel to inferred impact at x=250, not freeze at 200');
  assert.equal(a.y,450);
  const b=samplePuckPose(frames,75,{delayMs:0});
  assert.ok(Math.abs(b.x-225)<.01,'must travel back after impact');
});
test('unreliable reversal falls back to bounded existing interpolation',()=>{
  const frames=[{at:0,x:200,y:450,vx:1000,vy:0,r:16},
    {at:100,x:490,y:450,vx:-1000,vy:0,r:16}];
  const a=samplePuckPose(frames,50,{delayMs:0});
  assert.equal(a.x,345);
});
