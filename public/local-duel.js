/** Local two-human duel. Shared by same-screen and direct WebRTC host.
 * Gameplay (including powers and goals) is identical to the authoritative server engine.
 * Neither player position nor collisions depend on Cloudflare.
 */
import {makeRoom,countdown,movePaddles,stepPuck,updatePower,recenterPuck,
  puckRadius,paddleRadius,boundsForPaddle,clamp,TICK_RATE,W,H} from './engine/physics.js';

const QUANTUM=1000/TICK_RATE;
const valid=phase=>['playing','overtime','countdown'].includes(phase);
const safeName=(name,fallback)=>String(name||fallback).trim().slice(0,20)||fallback;

export function createLocalDuel(settings, hostName='Azul', guestName='Rosado', now=Date.now()) {
  const room=makeRoom('DIRECT',{...settings,mode:'duel'});
  room.players[0]={name:safeName(hostName,'Azul'),bot:false};
  room.players[1]={name:safeName(guestName,'Rosado'),bot:false};
  countdown(room);
  return {room,accumulator:0,lastFrame:null,now,seq:0,lastManualResetAt:-Infinity};
}

function goal(room,scorer,now){
  room.scores[scorer]++;room.goalBy=scorer;
  room.puck.vx=room.puck.vy=0;
  if(room.scores[scorer]>=room.settings.maxScore || (room.remainingMs===0&&room.scores[0]!==room.scores[1])){
    room.winner=scorer;room.phase='gameover';
  }else {room.phase='goal';room.phaseEnd=now+1350;}
}

function moveTarget(room,i,desired){
  if(!desired||!Number.isFinite(desired.x)||!Number.isFinite(desired.y))return;
  const b=boundsForPaddle(room,i),p=room.paddles[i];
  p.tx=clamp(desired.x,b.minX,b.maxX);
  p.ty=clamp(desired.y,b.minY,b.maxY);
}
export function setDuelInput(session,side,point){
  if(side!==0&&side!==1)return;
  moveTarget(session.room,side,point);
}
export function tickLocalDuel(session,at,inputs) {
  if(!Number.isFinite(at))return snapshotLocalDuel(session);
  if(session.lastFrame===null)session.lastFrame=at;
  session.accumulator+=Math.min(100,Math.max(0,at-session.lastFrame));
  session.lastFrame=at;
  const steps=Math.min(6,Math.floor((session.accumulator+1e-5)/QUANTUM));
  session.accumulator-=steps*QUANTUM;
  for(let i=0;i<steps;i++){
    session.now+=QUANTUM;
    const t=session.now,room=session.room;
    if(room.phase==='goal'&&t>=room.phaseEnd)countdown(room,1-room.goalBy);
    if(room.phase==='countdown'&&t>=room.phaseEnd)room.phase='playing';
    if(!valid(room.phase))continue;
    if(inputs){moveTarget(room,0,inputs[0]);moveTarget(room,1,inputs[1]);}
    room.simTime=t;
    movePaddles(room,1/TICK_RATE);
    if(room.phase!=='playing'&&room.phase!=='overtime')continue;
    room.elapsedMs+=QUANTUM;
    if(room.remainingMs!==null&&room.remainingMs>0){
      room.remainingMs=Math.max(0,room.remainingMs-QUANTUM);
      if(room.remainingMs===0){
        if(room.scores[0]!==room.scores[1]){
          room.winner=room.scores[0]>room.scores[1]?0:1;
          room.phase='gameover';
        }else room.phase='overtime';
      }
    }
    if(room.phase==='playing'||room.phase==='overtime'){
      const scorer=stepPuck(room,1/TICK_RATE);
      if(scorer!==null)goal(room,scorer,t);
      else updatePower(room,t);
    }
  }
  return snapshotLocalDuel(session);
}
export function snapshotLocalDuel(session){
  const r=session.room;
  return {type:'state',code:'DIRECT',phase:r.phase,
    players:r.players.map(p=>({name:p.name,connected:true,bot:false})),
    paddles:r.paddles.map((p,i)=>({x:p.x,y:p.y,r:paddleRadius(r,i),ack:p.ack||0})),
    puck:{...r.puck,r:puckRadius(r)},scores:[...r.scores],
    settings:r.settings,remainingMs:r.remainingMs,power:r.power,effect:r.effect,
    event:r.lastEvent,phaseEnd:r.phaseEnd,serverNow:session.now,seq:++session.seq,
    winner:r.winner,goalBy:r.goalBy,pauseMessage:'',activeSeats:[0,1],voiceReady:[false,false],tournament:null};
}
export function rematchLocalDuel(session){
  const r=session.room;
  if(r.phase!=='gameover')return false;
  r.elapsedMs=0;r.remainingMs=r.settings.timeLimit?r.settings.timeLimit*1000:null;
  r.lastTouch=null;r.scores=[0,0];r.winner=null;
  countdown(r);session.accumulator=0;
  return true;
}
export function resetLocalDuel(session){
  const t=session.now,r=session.room;
  if(!['playing','overtime'].includes(r.phase))return 'Recentrar está disponible durante la partida.';
  if(t-session.lastManualResetAt<15000)return `Puedes volver a recentrar en ${Math.ceil((15000-(t-session.lastManualResetAt))/1000)} s.`;
  session.lastManualResetAt=t;
  recenterPuck(r,t);
  return null;
}
