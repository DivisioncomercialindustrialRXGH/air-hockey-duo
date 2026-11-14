import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalDuel,tickLocalDuel} from '../public/local-duel.js';
import {createLocalBot,tickLocalBot} from '../public/local-bot.js';
import {sampleLocalPuck} from '../public/local-motion.js';
import {readFileSync} from 'node:fs';
function assertHighRefreshSmooth(create,tick,bot,hz=120){
 const session=create({timeLimit:0,powers:false,puckSize:'M'},'Azul','Rosa',1000);
 session.room.phase='playing';session.room.puck={x:170,y:450,vx:650,vy:0};
 const points=[];
 for(let i=0;i<31;i++){
   const at=i*1000/hz;
   const state=bot?tick(session,at,{x:250,y:773}):tick(session,at,[{x:250,y:773},{x:250,y:127}]);
   const pose=sampleLocalPuck(session,state.puck,state.phase);
   if(i>=6&&i<=25)points.push(pose.x);
 }
 const steps=points.slice(1).map((v,i)=>v-points[i]);
 assert.ok(steps.every(v=>v>.1),JSON.stringify(steps));
 assert.ok(Math.max(...steps)<9,JSON.stringify(steps));
}
test('same-screen duet looks fluid on 120Hz display',()=>assertHighRefreshSmooth(createLocalDuel,tickLocalDuel,false));
test('local bot looks fluid on 120Hz display',()=>assertHighRefreshSmooth(createLocalBot,tickLocalBot,true));
test('do not interpolate through a reported collision or goal',()=>{
 const s={visualPuckPrevious:{x:220,y:350},visualPuckSafe:false,accumulator:8};
 assert.equal(sampleLocalPuck(s,{x:270,y:350},'playing').x,270);
 assert.equal(sampleLocalPuck({...s,visualPuckSafe:true},{x:270,y:350},'goal').x,270);
});
test('local rendering uses every animation frame',()=>{
 const js=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
 assert.match(js,/if\(app\.localBot\)app\.nextPaintAt=0;/);
 assert.match(js,/sampleLocalPuck\(app\.localBot\.session/);
});

test('shared screen stays fluid at 90Hz',()=>assertHighRefreshSmooth(createLocalDuel,tickLocalDuel,false,90));
