import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';

function nextEvent(ws,pred,timeout=8000){
  return new Promise((resolve,reject)=>{
    let timer;
    const done=(fn,value)=>{clearTimeout(timer);ws.removeEventListener('message',on);ws.removeEventListener('close',closed);fn(value);};
    const on=e=>{let msg;try{msg=JSON.parse(e.data)}catch{return;}if(pred(msg))done(resolve,msg);};
    const closed=()=>done(reject,new Error('closed before expected message'));
    ws.addEventListener('message',on);ws.addEventListener('close',closed);
    timer=setTimeout(()=>done(reject,new Error('LAN message timeout')),timeout);
  });
}
async function getPort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('LAN connects two phones with code, two paddles and no Cloudflare',async()=>{
  const port=await getPort();
  const child=spawn(process.execPath,['lan/server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const url=`http://127.0.0.1:${port}`;let a,b;
  try{
    let ok=false;
    for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error('LAN host stopped: '+logs);
      try{const r=await fetch(url+'/health');if(r.ok){ok=true;break;}}catch{}await sleep(40);}
    assert.ok(ok,'LAN server not started: '+logs);
    const h=await (await fetch(url+'/')).text();
    assert.match(h,/lan-mode-banner/);
    assert.match(await (await fetch(url+'/game.js')).text(),/LAN_HOST/);
    assert.equal((await fetch(url+'/favicon.svg')).status,200); // bundled assets stay on LAN
    a=new WebSocket(url.replace('http','ws')+'/ws');
    await new Promise((resolve,reject)=>{a.addEventListener('open',resolve,{once:true});a.addEventListener('error',reject,{once:true});});
    const joinedPromise=nextEvent(a,x=>x.type==='joined');
    a.send(JSON.stringify({type:'create',name:'Celular azul',settings:{mode:'duel',maxScore:5,powers:true,timeLimit:90}}));
    const joined=await joinedPromise;
    assert.match(joined.code,/^[A-Z0-9]{6}$/);assert.equal(joined.seat,0);
    const ping=nextEvent(a,x=>x.type==='pong');a.send(JSON.stringify({type:'ping',at:33}));assert.equal((await ping).at,33);
    b=new WebSocket(url.replace('http','ws')+'/ws');
    await new Promise((resolve,reject)=>{b.addEventListener('open',resolve,{once:true});b.addEventListener('error',reject,{once:true});});
    const bJoin=nextEvent(b,x=>x.type==='joined');
    const aWait=nextEvent(a,x=>x.phase==='countdown');
    b.send(JSON.stringify({type:'join',code:joined.code,name:'Celular rosa'}));
    assert.equal((await bJoin).seat,1);await aWait;
    const aPlaying=nextEvent(a,x=>x.type==='state'&&x.phase==='playing',6000);
    const bPlaying=nextEvent(b,x=>x.type==='state'&&x.phase==='playing',6000);
    const [sa,sb]=await Promise.all([aPlaying,bPlaying]);
    assert.equal(sa.players[0].name,'Celular azul');assert.equal(sb.players[1].name,'Celular rosa');
    assert.equal(sa.paddles.length,2);assert.equal(sa.settings.mode,'duel');
    const aAck=nextEvent(a,x=>x.type==='state'&&x.paddles[0].ack===44);
    const bAck=nextEvent(b,x=>x.type==='state'&&x.paddles[1].ack===55);
    a.send(JSON.stringify({type:'move',x:120,y:740,seq:44}));
    b.send(JSON.stringify({type:'move',x:380,y:740,seq:55}));
    const [ap,bp]=await Promise.all([aAck,bAck]);
    assert.equal(ap.paddles[0].ack,44);assert.equal(bp.paddles[1].ack,55);
    // Pink client's x=380 is rotated to 500-380=120 on the authoritative field.
    assert.ok(Math.abs(bp.paddles[1].x-250)<140);
    assert.ok(sa.seq>0&&sb.seq>0);
    const before=await (await fetch(url+'/health')).json();assert.equal(before.rooms,1);
  }finally{try{a?.close();b?.close();}catch{}child.kill('SIGTERM');}
});
