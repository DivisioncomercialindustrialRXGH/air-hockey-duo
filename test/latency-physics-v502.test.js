import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRoom,movePaddles,stepPuck,MAX_PUCK_SPEED} from '../src/physics.js';
import {serverFrameTime,pushSnapshot,samplePuckPose,softenPuckPosition} from '../public/motion.js';

test('18,000 high-speed online physics frames do not teleport across the court',()=>{
  let seed=19429;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const r=makeRoom('STRESS',{mode:'duel',powers:false});
  r.puck={x:250,y:450,vx:1200,vy:720};
  let largest=0;
  for(let i=0;i<18000;i++){
    for(let j=0;j<2;j++){
      r.paddles[j].tx=37+426*random();
      r.paddles[j].ty=j===0?495+360*random():45+360*random();
    }
    movePaddles(r,1/60);
    const from={...r.puck};
    const scored=stepPuck(r,1/60);
    const moved=Math.hypot(r.puck.x-from.x,r.puck.y-from.y);
    largest=Math.max(largest,moved);
    assert.ok(Number.isFinite(moved));
    assert.ok(moved<43,`physical teleport at frame ${i}: ${moved}`);
    assert.ok(Math.hypot(r.puck.vx,r.puck.vy)<MAX_PUCK_SPEED+.1);
    if(scored!==null)r.puck={x:250,y:450,vx:(random()-.5)*1200,vy:(random()-.5)*1200};
  }
  assert.ok(largest>10);
});

test('mobile 70-130ms RTT uses the measured playout delay, never 245ms (5.0.3)',()=>{
  const code=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
  assert.match(code,/function networkViewDelay\(\)/);
  assert.match(code,/Math\.min\(170,app\.clock\?\.delayMs\?\?60\)/);
  assert.match(code,/maxExtrapolateMs:50/);
  assert.doesNotMatch(code,/Math\.min\(245,\(app\.clock\.delayMs/);
  assert.match(code,/const maxDelta=3600\*dt/);
});

test('variable network arrivals keep server timestamps monotonic and visual movement bounded',()=>{
  const clock={};const frames=[];let ball=null;const steps=[];
  const packets=[];
  for(let i=0;i<100;i++){
    const server=i*1000/30;
    const jitter=Math.sin(i*.71)*18+Math.sin(i*.1)*12;
    packets.push({arrival:server+45+jitter,serverNow:100000+server,
      x:250+130*Math.sin(server/420),y:450+110*Math.cos(server/480),r:16,
      vx:130/420*1000*Math.cos(server/420),vy:-110/480*1000*Math.sin(server/480)});
  }
  let cursor=0,prev=null;
  for(let t=0;t<3400;t+=1000/60){
    while(cursor<packets.length&&packets[cursor].arrival<=t){
      const p=packets[cursor++];const stamp=serverFrameTime(clock,p.serverNow,p.arrival);
      pushSnapshot(frames,{...p,at:stamp.at});
    }
    if(!frames.length)continue;
    const target=samplePuckPose(frames,t,{delayMs:Math.max(45,Math.min(100,48+(clock.jitter||0)*.6)),maxExtrapolateMs:58});
    ball=softenPuckPosition(ball,target,1/60);
    if(prev)steps.push(Math.hypot(ball.x-prev.x,ball.y-prev.y));
    prev={...ball};
  }
  assert.ok(steps.length>100);
  assert.ok(Math.max(...steps)<37,`visual teleport: ${Math.max(...steps)}`);
  assert.ok(clock.delayMs<100,`buffer ${clock.delayMs}`);
});
