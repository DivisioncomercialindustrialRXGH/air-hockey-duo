import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const game=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
test('offline boot initializes room timer before auto-selection (no top-level ReferenceError)',()=>{
 assert.ok(game.indexOf('let roomRequestTimer=null;')<game.indexOf('selectTransport(selectedTransport);'));
 assert.match(game,/navigator\.onLine===false\?'screen':'online'/);
});
test('local BOT has its own visible launch button with no network requirement',()=>{
 assert.match(html,/id="choose-bot"/);
 assert.match(game,/ui\.chooseBot\.addEventListener\('click',[\s\S]*?ui\.mode\.value='bot';[\s\S]*?createFromInput\(\)/);
 assert.match(game,/import\('\.\/local-bot\.js\?v=5\.5\.2-local\.1'\)/);
});
test('offline shell version matches HTML and cache',()=>{
 assert.match(sw,/hockey-duo-v5-5-3-offline-ready/);
 assert.match(html,/game\.js\?v=5\.5\.3-offline-ready\.1/);
 assert.match(game,/hockey-duo-v5-5-3-offline-ready/);
});
test('optional assets do not abort service worker installation',()=>{
 assert.match(sw,/const OPTIONAL=/);
 assert.match(sw,/Promise\.allSettled\(OPTIONAL\.map/);
 assert.match(sw,/await caches\.delete\(CACHE\)/);
});
