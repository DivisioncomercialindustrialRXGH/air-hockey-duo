import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const lib=process.env.AUDIT_PLAYWRIGHT;
const {chromium}=await import(lib?pathToFileURL(lib).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.AUDIT_BROWSER?{executablePath:process.env.AUDIT_BROWSER}:{})});
const errors=[],pageResults=[];
try{
  const mobile={viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true};
  const context=await browser.newContext(mobile),other=await browser.newContext(mobile);
  for(const c of [context,other])await c.addInitScript(()=>{
    globalThis.__audit={paints:[],moves:[]};
    const transform=CanvasRenderingContext2D.prototype.setTransform;
    CanvasRenderingContext2D.prototype.setTransform=function(...args){
      if(this.canvas.id==='arena')__audit.paints.push(performance.now());
      return transform.apply(this,args);
    };
    const send=WebSocket.prototype.send;
    WebSocket.prototype.send=function(value){
      try{const m=JSON.parse(value);if(m.type==='move')__audit.moves.push({seq:m.seq,ack:m.ack,hasView:Number.isFinite(m.vt)});}catch{}
      return send.call(this,value);
    };
  });
  const a=await context.newPage(),b=await other.newPage();
  for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
  await a.goto('http://127.0.0.1:8787/?debug=1');
  await a.locator('#player-name').fill('Audit blue');
  await a.locator('#create-btn').click();
  await a.locator('#toolbar-code').waitFor({state:'visible'});
  const code=(await a.locator('#toolbar-code').textContent()).trim();
  assert.match(code,/^[A-Z2-9]{6}$/);
  await b.goto('http://127.0.0.1:8787/?debug=1');
  await b.locator('#player-name').fill('Audit pink');
  await b.locator('#room-code').fill(code);await b.locator('#join-btn').click();
  await b.locator('#toolbar-code').waitFor({state:'visible'});
  await a.waitForTimeout(3500);
  await a.waitForFunction(()=>document.querySelector('#game-overlay').classList.contains('hidden'));
  await b.waitForFunction(()=>document.querySelector('#game-overlay').classList.contains('hidden'));
  for(const page of [a,b]){
    await page.evaluate(()=>{__audit.paints=[];__audit.moves=[];});
    const box=await page.locator('#arena').boundingBox();assert.ok(box.width>100&&box.height>100);
    const cdp=await page.context().newCDPSession(page);
    const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
    await touch('touchStart',box.x+box.width*.5,box.y+box.height*.8);
    for(let i=1;i<=12;i++){await touch('touchMove',box.x+box.width*(.5+.15*i/12),box.y+box.height*(.8-.2*i/12));await page.waitForTimeout(17);}
    await touch('touchEnd');await cdp.detach();
  }
  // Measure steady rendering separately from fullscreen transitions and the
  // screenshot operation, which can suspend headless Chrome's paint loop.
  for(const page of [a,b])await page.evaluate(()=>{__audit.paints=[];});
  await a.waitForTimeout(3500);
  for(const page of [a,b]){
    pageResults.push(await page.evaluate(()=>{const frames=__audit.paints,gaps=frames.slice(1).map((t,i)=>t-frames[i]).sort((a,b)=>a-b);return {connection:document.querySelector('#connection-text').textContent,
      score:[document.querySelector('#my-score').textContent,document.querySelector('#op-score').textContent],
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth,canvas:[document.querySelector('#arena').width,document.querySelector('#arena').height],
      paintedFrames:frames.length,paintFps:(frames.length-1)*1000/(frames.at(-1)-frames[0]),paintGapP95Ms:gaps[Math.floor(gaps.length*.95)],
      touchMoves:__audit.moves.length,movesWithVerifiedView:__audit.moves.filter(m=>m.hasView&&m.ack>0).length};}));
  }
  console.log({pageResults});assert.ok(pageResults.every(p=>!p.horizontalOverflow));assert.deepEqual(errors,[]);
  assert.ok(pageResults.every(p=>p.touchMoves>2&&p.movesWithVerifiedView>0&&p.paintedFrames>60));
  await a.screenshot({path:'docs/audit/rc2/browser-mobile-chromium.png',fullPage:true});
  // Versioned core modules must have been precached for offline PWA startup.
  await a.evaluate(()=>navigator.serviceWorker.ready);
  await a.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const cached=await a.evaluate(async()=>{
    const keys=await caches.keys(),name=keys.find(k=>k.includes('v5-0-4'));
    const cache=await caches.open(name);return (await cache.keys()).map(r=>new URL(r.url).pathname+new URL(r.url).search);
  });
  for(const path of ['/game.js?v=5.0.4-rc.2','/motion.js?v=5.0.4-rc.2'])assert.ok(cached.includes(path));
  console.log({cached,controller:await a.evaluate(()=>navigator.serviceWorker.controller.scriptURL)});
  await context.setOffline(true);await a.goto('http://127.0.0.1:8787/');await a.locator('#create-btn').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);
  const result={browser:'Headless Chromium; 390 x 844 emulation, NOT a physical phone',pageResults,errors,offlineShell:true,cached};
  writeFileSync('docs/audit/rc2/browser-smoke.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser.close();}
