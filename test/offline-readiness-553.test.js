import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const game=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const CACHE='hockey-duo-v5-5-3-offline-ready',MARKER='/__offline_ready_553';
const script=game.slice(game.indexOf('async function refreshOfflineReadiness(){'),game.indexOf('function showOfflineInstallError(){'));
assert.ok(script.startsWith('async function refreshOfflineReadiness(){'));
function setup({ready=false,onLine=true}={}){
  const tag={dataset:{},textContent:''},lookups=[];
  const caches={
    has:async key=>{lookups.push(['cache',key]);return ready;},
    open:async key=>{assert.equal(key,CACHE);return {match:async path=>{
      lookups.push(['match',path]);return ready?{status:200}:undefined;
    }};}
  };
  const window={caches},navigator={onLine,serviceWorker:{}};
  const document={querySelector:id=>id==='#offline-ready'?tag:null};
  const check=Function('document','window','navigator','caches','LAN_HOST',
    script+'\nreturn refreshOfflineReadiness;')(document,window,navigator,caches,false);
  return {tag,check,lookups};
}
test('first installation shows ready without requiring service worker controller',async()=>{
  const {check,tag,lookups}=setup({ready:true});
  assert.equal(await check(),true);assert.equal(tag.dataset.ready,'true');
  assert.match(tag.textContent,/LISTO SIN INTERNET/);
  assert.deepEqual(lookups,[['cache',CACHE],['match',MARKER]]);
});
test('incomplete install cannot be falsely marked ready',async()=>{
  const {check,tag,lookups}=setup({ready:false});
  assert.equal(await check(),false);assert.equal(tag.dataset.ready,'false');
  assert.match(tag.textContent,/Guardando/);
  assert.deepEqual(lookups,[['cache',CACHE]]);
});
test('offline before initial installation requires network once',async()=>{
  const {check,tag}=setup({ready:false,onLine:false});
  assert.equal(await check(),false);assert.match(tag.textContent,/Conéctate una vez/);
});
test('PWA caches imported modules and readiness has one source of truth',()=>{
  const core=(worker.match(/const CORE=\[([\s\S]*?)\];/)||[])[1];assert.ok(core);
  const required=[...game.matchAll(/(?:from\s+|import\s*\()\s*['"]\.\/([^'"]+)['"]/g)].map(x=>'/'+x[1]);
  for(const path of required)assert.ok(core.includes("'"+path+"'"),'Missing cached JS import '+path);
  const htmlScript=html.match(/<script type="module" src="([^"]+)"/);
  const htmlStyles=html.match(/<link rel="stylesheet" href="([^"]+)"/);
  assert.ok(core.includes("'"+htmlScript?.[1]+"'"));
  assert.ok(core.includes("'"+htmlStyles?.[1]+"'"));
  assert.match(worker,/const READY_MARKER='\/__offline_ready_553'/);
  assert.doesNotMatch(script,/5\.5\.0-cross-beta/);
});
