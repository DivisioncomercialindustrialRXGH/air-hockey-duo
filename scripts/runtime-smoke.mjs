import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const origin=process.env.AUDIT_ORIGIN||'http://127.0.0.1:8787';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'local test only');
const health=await (await fetch(`${origin}/health`)).json();
assert.equal(health.release,'5.0.4-rc.2-audited');assert.equal(health.lagCompensation.maxJumpPx,14);
assert.equal(health.lagCompensation.maxMs,360,'deployed config must match the tested history window');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function client(){
  const ws=new WebSocket(origin.replace('http','ws')+'/ws'),messages=[];
  ws.addEventListener('message',e=>messages.push({...JSON.parse(e.data),arrived:performance.now()}));
  await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});
  return {ws,messages,send:m=>ws.send(JSON.stringify(m)),async until(type,predicate=()=>true){
    for(let i=0;i<300;i++){const m=messages.find(m=>m.type===type&&predicate(m));if(m)return m;await wait(20);}throw Error(`timeout ${type}`);
  }};
}
const clients=[];
try{
  const a=await client(),b=await client();clients.push(a,b);
  a.send({type:'create',name:'Audit A',settings:{powers:true,timeLimit:0}});
  const j=await a.until('joined');b.send({type:'join',code:j.code,name:'Audit B'});await b.until('joined');
  await a.until('state',m=>m.phase==='playing');
  for(let i=1;i<=180;i++){
    const state=a.messages.filter(m=>m.type==='state').at(-1);
    a.send({type:'move',seq:i,ack:state.seq,vt:state.serverNow-40,x:250+150*Math.sin(i*.1),y:650});
    if(i%30===0)a.send({type:'ping',at:i});await wait(1000/60);
  }
  const states=a.messages.filter(m=>m.type==='state'&&m.phase==='playing');
  assert.ok(states.length>50);
  assert.ok(states.every(s=>s.paddles.every(p=>Number.isFinite(p.r)&&p.r>0)),'rendered radii come from the authority');
  for(let i=1;i<states.length;i++){assert.ok(states[i].seq>states[i-1].seq);assert.ok(states[i].serverNow>states[i-1].serverNow);}
  const scores=states.at(-1).scores;
  a.ws.close();await b.until('state',m=>m.phase==='paused');
  const a2=await client();clients.push(a2);a2.send({type:'join',code:j.code,token:j.token,name:'Audit A'});
  const rejoin=await a2.until('joined');assert.equal(rejoin.seat,j.seat);
  const resumed=await a2.until('state',m=>m.phase==='countdown');assert.deepEqual(resumed.scores,scores);
  const gaps=states.slice(1).map((m,i)=>m.arrived-states[i].arrived).sort((a,b)=>a-b);
  const result={health,snapshots:states.length,snapshotGapP50:gaps[Math.floor(gaps.length*.5)],snapshotGapP95:gaps[Math.floor(gaps.length*.95)],
    stateBytesMean:states.reduce((a,m)=>a+JSON.stringify(m).length,0)/states.length,reconnected:true,scoresPreserved:true};
  writeFileSync('docs/audit/rc2/runtime-smoke.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{for(const c of clients)c.ws.close();}
