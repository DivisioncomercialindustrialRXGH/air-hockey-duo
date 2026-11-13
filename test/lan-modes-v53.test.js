import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {readFileSync} from 'node:fs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
function waitFor(ws,check,ms=7000){return new Promise((resolve,reject)=>{
  let timer;const cleanup=()=>{clearTimeout(timer);ws.removeEventListener('message',read);ws.removeEventListener('close',closed);};
  const read=e=>{let msg;try{msg=JSON.parse(e.data)}catch{return;}if(check(msg)){cleanup();resolve(msg);}};
  const closed=()=>{cleanup();reject(new Error('LAN WebSocket closed'));};
  ws.addEventListener('message',read);ws.addEventListener('close',closed);
  timer=setTimeout(()=>{cleanup();reject(new Error('Timed out waiting for LAN message'));},ms);
});}
async function connect(url){const ws=new WebSocket(url.replace('http','ws')+'/ws');await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});return ws;}
async function runLan(check){const port=await freePort(),url=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['lan/server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  const clients=[];let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  try{
    let ready=false;
    for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(url+'/health')).ok){ready=true;break;}}catch{}await sleep(30);}
    assert.ok(ready,logs);
    await check(url,async()=>{const ws=await connect(url);clients.push(ws);return ws;});
  }finally{for(const ws of clients)ws.close();child.kill('SIGTERM');}
}
test('LAN 2v2 honors team choice and starts only with four players',async()=>{
  await runLan(async(url,join)=>{
    const owner=await join(),j=waitFor(owner,x=>x.type==='joined');owner.send(JSON.stringify({type:'create',name:'Pink owner',team:'pink',settings:{mode:'duo',powers:true,maxScore:3}}));
    const start=await j;assert.equal(start.seat,2);assert.equal(start.settings.mode,'duo');
    const seats=[2];let lastState;
    for(const [name,team] of [['Blue 1','blue'],['Pink 2','pink'],['Blue 2','blue']]){
      const ws=await join(),received=waitFor(ws,x=>x.type==='joined'),state=waitFor(ws,x=>x.type==='state');
      ws.send(JSON.stringify({type:'join',code:start.code,name,team}));
      const info=await received;seats.push(info.seat);
      lastState=await state;
    }
    assert.deepEqual(seats,[2,0,3,1]);assert.equal(lastState.players.length,4);
    assert.equal(lastState.settings.mode,'duo');assert.equal(lastState.phase,'countdown');
    const chat=waitFor(owner,x=>x.type==='chat');
    const ws=await join(); // spectating is not allowed: room full
    const err=waitFor(ws,x=>x.type==='error');ws.send(JSON.stringify({type:'join',code:start.code,name:'Extra'}));
    assert.match((await err).message,/llena/i);
    const client=lastState;assert.ok(client.paddles.length===4);
    const player=owner;player.send(JSON.stringify({type:'chat',text:'vamos equipo'}));
    assert.equal((await chat).message.text,'vamos equipo');
  });
});
test('LAN 4v4 uses eight distinct seats, server never silently downgrades mode',async()=>{
  await runLan(async(url,join)=>{
    const owner=await join(),promise=waitFor(owner,x=>x.type==='joined');
    owner.send(JSON.stringify({type:'create',name:'Maker',settings:{mode:'teams',puckSize:'S'}}));
    const info=await promise;assert.equal(info.settings.mode,'teams');assert.equal(info.seat,0);
    let final;
    for(let i=1;i<8;i++){
      const ws=await join(),started=waitFor(ws,x=>x.type==='joined'),state=i===7?waitFor(ws,x=>x.type==='state'):null;
      ws.send(JSON.stringify({type:'join',code:info.code,name:`P${i}`}));
      const joined=await started;assert.equal(joined.seat,i);
      if(i===7){final=await state;}
    }
    assert.equal(final.phase,'countdown');assert.equal(final.paddles.length,8);
    assert.equal(final.players.filter(x=>x?.connected).length,8);
    assert.deepEqual(final.activeSeats,[0,1,2,3,4,5,6,7]);
  });
});
test('home offers both distinct remote and private-WiFi contexts',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
  assert.match(html,/id="choose-online"/);assert.match(html,/id="choose-lan"/);
  assert.match(html,/id="lan-address"/);assert.match(html,/mismo Wi-Fi/);
  assert.match(game,/location\.assign\(REMOTE_URL\)/);
  assert.match(game,/parseLanAddress/);
  assert.match(game,/mode==='bot'/);
  assert.doesNotMatch(game,/\bselectedTransport==='lan'\s*\?\s*new WebSocket/);
});
test('LAN reconnect resets input sequence and never leaves the returning mallet frozen',async()=>{
  await runLan(async(url,join)=>{
    const a=await join(),started=waitFor(a,x=>x.type==='joined');
    a.send(JSON.stringify({type:'create',name:'Rejoin-test',settings:{mode:'duel',maxScore:3}}));
    const info=await started;const b=await join(),joinedB=waitFor(b,x=>x.type==='joined');
    b.send(JSON.stringify({type:'join',code:info.code,name:'Other'}));await joinedB;
    a.send(JSON.stringify({type:'move',x:360,y:760,seq:888}));
    await sleep(60);a.close();await sleep(60);
    const replacement=await join(),joined=waitFor(replacement,x=>x.type==='joined');
    replacement.send(JSON.stringify({type:'join',code:info.code,name:'Rejoin-test',token:info.token}));
    assert.equal((await joined).seat,0);
    const state=waitFor(replacement,x=>x.type==='state'&&x.paddles?.[0]?.ack===1);
    replacement.send(JSON.stringify({type:'move',x:180,y:760,seq:1}));
    assert.equal((await state).paddles[0].ack,1);
  });
});
