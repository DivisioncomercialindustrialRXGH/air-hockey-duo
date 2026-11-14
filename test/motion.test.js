import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sampleRemotePose} from '../public/motion.js';

test('Bot animation interpolates 30 Hz snapshots without stop-motion at 60 FPS',()=>{
  const frames=[];
  const velocity=420;
  const outputs=[];
  const framesAt=[];
  let nextPacket=0;
  for(let now=0;now<=1550;now+=1000/60){
    while(nextPacket<=now+.001){
      const x=70+velocity*nextPacket/1000;
      frames.push({at:nextPacket,poses:[{x:250,y:700},{x,y:130}]});
      if(frames.length>12)frames.shift();
      nextPacket+=1000/30;
    }
    const pose=sampleRemotePose(frames,1,now,{delayMs:92,maxExtrapolateMs:55,maxSpeed:1100});
    if(now>215&&now<800){outputs.push(pose.x);framesAt.push(now);}
  }
  const steps=outputs.slice(1).map((x,i)=>x-outputs[i]);
  const frozen=steps.filter(dx=>Math.abs(dx)<.01).length;
  assert.equal(frozen,0,`30 Hz interpolation should not freeze (was frozen ${frozen} frames)`);
  assert.ok(Math.min(...steps)>0);
  assert.ok(Math.max(...steps)<12,`jumpy: ${Math.max(...steps)}`);
});

test('Never extrapolates remote paddle indefinitely during stalled network',()=>{
  const frames=[{at:0,poses:[{x:100,y:100}]},{at:33,poses:[{x:112,y:100}]}];
  const at300=sampleRemotePose(frames,0,300,{delayMs:92,maxExtrapolateMs:55,maxSpeed:1100,bounds:{minX:37,maxX:463,minY:37,maxY:863}});
  const at600=sampleRemotePose(frames,0,600,{delayMs:92,maxExtrapolateMs:55,maxSpeed:1100,bounds:{minX:37,maxX:463,minY:37,maxY:863}});
  assert.deepEqual(at300,at600);
  assert.ok(at300.x>112 && at300.x<140);
});

test('Moves continuously and without overshoot when directions reverse',()=>{
  const frames=[{at:0,poses:[{x:100,y:110}]},{at:33,poses:[{x:150,y:110}]},{at:66,poses:[{x:130,y:110}]}];
  for(let t=125;t<=155;t+=2){
    const pose=sampleRemotePose(frames,0,t,{delayMs:92});
    assert.ok(pose.x>=100 && pose.x<=150,`overshot at ${t}: ${pose.x}`);
  }
});

test('Reset button is actually in visible HUD and no duplicated ID exists',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const hud=html.match(/<div class="toolbar-actions"[\s\S]*?<\/div>/)?.[0];
  assert.ok(hud?.includes('id="reset-puck-btn"'));
  assert.equal((html.match(/id="reset-puck-btn"/g)||[]).length,1);
  assert.match(html,/game\.js\?v=5\.4\.2-stability-offline\.1/);
});
