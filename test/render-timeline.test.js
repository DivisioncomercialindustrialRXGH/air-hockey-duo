import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serverFrameTime,pushSnapshot,samplePuckPose,softenPuckPosition,sampleRemotePose} from '../public/motion.js';
const src=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');

test('server timestamps ignore 20-40ms arrival jitter and duplicates',()=>{
  const clock={},frames=[];
  const times=[0,33,66,99,132,165];
  const jitters=[0,22,-19,35,1,13];
  for(let i=0;i<times.length;i++){
    const {at}=serverFrameTime(clock,150000+times[i],500+jitters[i]+times[i]);
    pushSnapshot(frames,{at,x:times[i],y:450,vx:1,vy:0,r:16});
  }
  // 5.0.3: the timeline follows the FASTEST packets (low envelope) by at most
  // 2 ms per snapshot; arrival jitter never leaks into the 33 ms spacing.
  frames.forEach((f,i)=>{if(i)assert.ok(Math.abs((f.at-frames[i-1].at)-(times[i]-times[i-1]))<=2.01);});
  assert.ok(frames.every((f,i)=>!i||f.at>frames[i-1].at));
  pushSnapshot(frames,{at:frames.at(-1).at,x:165,y:449,vx:1,vy:0,r:16});
  assert.equal(frames.length,6);
  assert.equal(frames.at(-1).y,449);
});

test('wall bounce keeps continuous puck trajectory without teleporting',()=>{
  const clock={},frames=[];
  let shown=null;const positions=[];
  const hz=1000/60,pkt=1000/30;
  const tEnd=1450;let nextPacket=0;
  const snapshots=[];
  while(nextPacket<=tEnd){
    const x=nextPacket<=550 ? 140+320*nextPacket/550 : 460-320*(nextPacket-550)/550;
    const vx=nextPacket<=550?582:-582;
    // Arrival jitter, but WebSocket is ordered.
    const arrival=nextPacket+70+Math.sin(nextPacket*.067)*20;
    snapshots.push({arrival,serverNow:100000+nextPacket,x,y:460,vx,vy:0,r:16});
    nextPacket+=pkt;
  }
  let packet=0;
  for(let t=0;t<=tEnd;t+=hz){
    while(packet<snapshots.length&&snapshots[packet].arrival<=t){
      const s=snapshots[packet++],stamp=serverFrameTime(clock,s.serverNow,s.arrival);
      pushSnapshot(frames,{...s,at:stamp.at});
    }
    if(!frames.length)continue;
    const raw=samplePuckPose(frames,t,{delayMs:115,maxExtrapolateMs:35});
    shown=softenPuckPosition(shown,raw,hz/1000);
    positions.push(shown.x);
    assert.ok(Number.isFinite(shown.x));
  }
  const differences=positions.slice(1).map((x,i)=>Math.abs(x-positions[i]));
  assert.ok(Math.max(...differences)<36,'teleport: max step '+Math.max(...differences));
  const after=positions.slice(-15);
  assert.ok(after[0]>after.at(-1),'puck must travel back after wall bounce');
});

test('long packet stall catches up at speed cap and does not snap',()=>{
  let old={x:200,y:400,vx:0,vy:0,r:16};
  const target={x:420,y:400,vx:1600,vy:0,r:16};
  let maxStep=0;
  for(let i=0;i<12;i++){
    const next=softenPuckPosition(old,target,1/60,1600);
    maxStep=Math.max(maxStep,next.x-old.x);old=next;
  }
  assert.ok(maxStep<36);
  assert.ok(Math.abs(old.x-target.x)<1);
});

test('bot continues across accelerated wall bounce in remote timeline',()=>{
  const f=[];const clock={};
  for(let i=0;i<25;i++){
    const t=i*33.33,x=i<12?160+i*14:160+12*14-(i-12)*12;
    const {at}=serverFrameTime(clock,200000+t,50+t+Math.sin(i)*18);
    pushSnapshot(f,{at,poses:[{x:250,y:700},{x,y:130}]});
  }
  let last=null,maxStep=0;
  for(let t=400;t<770;t+=1000/60){
    const p=sampleRemotePose(f,1,t,{delayMs:115,maxExtrapolateMs:35,maxSpeed:1100});
    if(last!==null)maxStep=Math.max(maxStep,Math.abs(p.x-last));
    last=p.x;
  }
  assert.ok(maxStep<10,'bot teleported by '+maxStep);
});

test('normal hit/wall events no longer clear puck history or remote paddle history',()=>{
  assert.doesNotMatch(src,/\['hit','wall','reset'\]\.includes/);
  assert.match(src,/trueTeleport=phaseChanged/);
  assert.match(src,/samplePuckPose\(app\.puckFrames/);
  assert.match(src,/softenPuckPosition\(app\.puckDraw/);
});
