/** Air Hockey DUO — Cloudflare Workers Free / hibernatable Durable Object (SQLite). */
import { DurableObject } from 'cloudflare:workers';
import {
  W,H,TICK_RATE,SEND_RATE,PADDLE_R,clamp,makeRoom,countdown,movePaddles,stepPuck,
  puckRadius,paddleRadius,updatePower,updateBot,sanitizeSettings,teamOf,seatsRequired,boundsForPaddle
} from './physics.js';
import {
  initializeTournament,prepareTournamentMatch,finishTournamentMatch,leaderboard
} from './tournament.js';

const LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL=30*60*1000, SEAT_TTL=2*60*1000, MAX_ROOMS=45;
const online=ws=>Boolean(ws&&ws.readyState===1);
const respond=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return respond({ok:true,release:'4.5-team-colors-nicknames',platform:'cloudflare'});
    if(url.pathname==='/ws'){
      if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return respond({error:'WebSocket requerido'},426);
      const origin=request.headers.get('Origin');
      try{if(origin&&new URL(origin).host!==url.host)return respond({error:'Origen no autorizado'},403);}catch{return respond({error:'Origen inválido'},403);}
      return env.HOCKEY_HUB.get(env.HOCKEY_HUB.idFromName('duo-hub-v1')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
export class HockeyHub extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);
    this.rooms=new Map();this.timer=null;this.frame=0;this.lastTickAt=performance.now();
    ctx.blockConcurrencyWhile(async()=>{
      const records=await ctx.storage.get('rooms')||[];
      for(const [code,data] of records){
        const room={...makeRoom(code,data.settings),...data,players:(data.players||[]).map(p=>p?{...p,ws:null}:null)};
        room.chat=Array.isArray(room.chat)?room.chat:[];
        room.voiceReady=Array.from({length:room.players.length},()=>false);
        this.rooms.set(code,room);
      }
      for(const ws of ctx.getWebSockets()){
        const a=ws.deserializeAttachment();const p=this.rooms.get(a?.roomCode)?.players?.[a?.seat];
        if(p?.token===a?.token&&online(ws)){p.ws=ws;p.disconnectedAt=0;}
      }
      for(const r of this.rooms.values()){
        if(['playing','countdown','goal','overtime','tournament_wait'].includes(r.phase)){
          r.phase='paused';r.pauseMessage='Reconectando con la partida';
        }
        this.maybeStart(r);
      }
      this.prune();this.updateTimer();
    });
  }
  async fetch(request){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return respond({error:'WebSocket requerido'},426);
    if(this.ctx.getWebSockets().length>=120)return respond({error:'Demasiadas conexiones'},429);
    const pair=new WebSocketPair();const [client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);
    return new Response(null,{status:101,webSocket:client});
  }
  send(ws,value){if(!online(ws))return;try{ws.send(JSON.stringify(value));}catch{}}
  broadcast(room,value){for(const p of room.players)this.send(p?.ws,value);}
  activeConnected(room){
    if(room.settings.mode==='tournament'&&room.phase==='tournament_wait')return room.players.some(p=>online(p?.ws));
    const required=room.settings.mode==='tournament'?room.activeSeats:room.players.map((_,i)=>i);
    return required.length>=2&&required.every(i=>room.players[i]?.bot===true||online(room.players[i]?.ws));
  }
  full(room){return room.players.every(p=>p&&(p.bot===true||online(p.ws)));}
  notify(room){
    const stamp=Date.now();
    const state={
      type:'state',code:room.code,phase:room.phase,
      players:room.players.map(p=>p?{name:p.name,connected:p.bot===true||online(p.ws),bot:p.bot===true}:null),
      scores:room.scores,paddles:room.paddles.map(p=>({x:p.x,y:p.y})),
      puck:{...room.puck,r:puckRadius(room)},settings:room.settings,
      remainingMs:room.remainingMs,power:room.power,effect:room.effect,
      event:room.lastEvent,phaseEnd:room.phaseEnd,serverNow:stamp,
      winner:room.winner,goalBy:room.goalBy,pauseMessage:room.pauseMessage,
      activeSeats:room.activeSeats,voiceReady:room.voiceReady||[],
      tournament:room.tournament?{
        started:room.tournament.started,finished:room.tournament.finished,
        round:room.tournament.round,champion:room.tournament.champion,
        history:room.tournament.history,ranking:leaderboard(room)
      }:null
    };
    const watching=room.settings.mode==='tournament'&&['playing','overtime'].includes(room.phase);
    const spectatorFrame=!watching||stamp-(room.lastSpectatorStateAt||0)>160;
    if(spectatorFrame)room.lastSpectatorStateAt=stamp;
    room.players.forEach((p,seat)=>{
      if(watching&&!room.activeSeats.includes(seat)&&!spectatorFrame)return;
      this.send(p?.ws,state);
    });
  }
  async persist(){
    const snap=[...this.rooms.entries()].map(([code,r])=>[code,{
      ...r,players:r.players.map(p=>p?{name:p.name,token:p.token,disconnectedAt:p.disconnectedAt,bot:p.bot===true}:null),
      voiceReady:[]
    }]);
    await this.ctx.storage.put('rooms',snap);
  }
  prune(){
    const now=Date.now();
    for(const [code,r] of this.rooms){
      r.players.forEach((p,i)=>{
        if(p&&!p.bot&&!online(p.ws)&&p.disconnectedAt&&now-p.disconnectedAt>SEAT_TTL&&r.settings.mode!=='tournament')r.players[i]=null;
      });
      if(!r.players.some(p=>online(p?.ws))&&now-r.lastUsed>ROOM_TTL)this.rooms.delete(code);
    }
  }
  newCode(){let code;do{const b=new Uint8Array(6);crypto.getRandomValues(b);code=[...b].map(v=>LETTERS[v%LETTERS.length]).join('');}while(this.rooms.has(code));return code;}
  maybeStart(r){
    if(r.settings.mode==='tournament'){
      if(!r.tournament.started && this.full(r)){
        initializeTournament(r);
        prepareTournamentMatch(r);
        countdown(r);
      }else if(r.tournament.started&&r.phase==='paused'&&this.activeConnected(r))countdown(r);
    }else if(this.full(r)&&['waiting','paused'].includes(r.phase))countdown(r);
    this.updateTimer();
  }
  updateTimer(){
    const need=[...this.rooms.values()].some(r=>['playing','countdown','goal','overtime','tournament_wait'].includes(r.phase)&&this.activeConnected(r));
    if(need&&!this.timer){this.lastTickAt=performance.now();this.timer=setInterval(()=>this.tick(),1000/TICK_RATE);}
    if(!need&&this.timer){clearInterval(this.timer);this.timer=null;}
  }
  goal(r,scorer){
    r.scores[scorer]++;r.goalBy=scorer;r.puck.vx=r.puck.vy=0;
    if(r.scores[scorer]>=r.settings.maxScore || (r.remainingMs===0&&r.scores[0]!==r.scores[1])){
      r.winner=scorer;
      if(r.settings.mode==='tournament'){
        finishTournamentMatch(r,scorer);r.phase='tournament_wait';r.phaseEnd=Date.now()+2500;
      }else r.phase='gameover';
    }else{r.phase='goal';r.phaseEnd=Date.now()+1350;}
    this.notify(r);this.ctx.waitUntil(this.persist());this.updateTimer();
  }
  finishOnTime(r){
    r.winner=r.scores[0]>r.scores[1]?0:1;
    if(r.settings.mode==='tournament'){
      finishTournamentMatch(r,r.winner);r.phase='tournament_wait';r.phaseEnd=Date.now()+2500;
    }else r.phase='gameover';
  }
  tick(){
    this.frame++;
    const now=Date.now(),time=performance.now();
    const dt=clamp((time-this.lastTickAt)/1000,1/120,1/30);this.lastTickAt=time;
    let changed=false;
    for(const r of this.rooms.values()){
      if(!this.activeConnected(r))continue;
      if(r.phase==='tournament_wait'&&now>=r.phaseEnd){
        const match=prepareTournamentMatch(r);
        if(!match){r.phase='champion';r.winner=null;}
        else countdown(r);
        changed=true;this.notify(r);
      }
      if(r.phase==='countdown'&&now>=r.phaseEnd){r.phase='playing';changed=true;}
      if(r.phase==='goal'&&now>=r.phaseEnd){countdown(r,1-r.goalBy);changed=true;}
      if(['playing','countdown','overtime'].includes(r.phase)){updateBot(r,now);movePaddles(r,dt);}
      if(['playing','overtime'].includes(r.phase)){
        r.elapsedMs+=dt*1000;
        if(r.remainingMs!==null&&r.remainingMs>0){
          r.remainingMs=Math.max(0,r.remainingMs-dt*1000);
          if(r.remainingMs===0){
            if(r.scores[0]!==r.scores[1]){this.finishOnTime(r);changed=true;}
            else{r.phase='overtime';changed=true;}
          }
        }
        if(r.phase==='playing'||r.phase==='overtime'){
          const evId=r.lastEvent.id;
          const scorer=stepPuck(r,dt);
          if(scorer!==null){this.goal(r,scorer);changed=true;}
          else{updatePower(r,now);if(evId!==r.lastEvent.id)this.notify(r);}
        }
      }
      const divisor=Math.max(1,Math.round(TICK_RATE/SEND_RATE));
      if(this.frame%divisor===0)this.notify(r);
    }
    if(changed){this.updateTimer();this.ctx.waitUntil(this.persist());}
  }
  async join(ws,msg){
    const code=typeof msg.code==='string'?msg.code.trim().toUpperCase():'';
    this.prune();const r=this.rooms.get(code);
    if(!r)return this.send(ws,{type:'error',message:'Esa sala no existe. Comprueba el código.'});
    if(ws.deserializeAttachment()?.roomCode)return this.send(ws,{type:'error',message:'Ya estás en otra sala.'});
    const tok=typeof msg.token==='string'?msg.token:'';
    let seat=tok.length===32?r.players.findIndex(p=>p?.token===tok):-1;
    if(seat<0 && r.settings.mode==='bot' && msg.isCreator!==true)return this.send(ws,{type:'error',message:'Esta es una partida individual contra un bot.'});
    if(seat<0 && r.settings.mode==='tournament'&&r.tournament?.started)return this.send(ws,{type:'error',message:'El torneo ya comenzó. No admite nuevos jugadores.'});
    if(seat<0){
      const requested=msg.team==='blue'?0:msg.team==='pink'?1:-1;
      const teamCount=r.settings.mode==='duo'?2:r.settings.mode==='teams'?4:0;
      if(teamCount && requested!==-1){
        const offset=requested*teamCount;
        seat=r.players.findIndex((p,i)=>p===null&&i>=offset&&i<offset+teamCount);
        if(seat<0)return this.send(ws,{type:'error',message:requested===0?'El equipo AZUL ya está lleno. Elige ROSADO.':'El equipo ROSADO ya está lleno. Elige AZUL.'});
      }else seat=r.players.findIndex(p=>p===null);
    }
    if(seat<0)return this.send(ws,{type:'error',message:'Sala llena. Espera otra partida.'});
    const name=typeof msg.name==='string'?msg.name.trim().slice(0,20):'';
    if(r.players[seat]){
      const p=r.players[seat];if(p.ws&&p.ws!==ws)try{p.ws.close(4001,'Sesión transferida');}catch{}
      p.ws=ws;p.disconnectedAt=0;
    }else{
      const b=new Uint8Array(16);crypto.getRandomValues(b);const token=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');
      r.players[seat]={name:name||`Jugador ${seat+1}`,token,ws,disconnectedAt:0};
    }
    ws.serializeAttachment({roomCode:code,seat,token:r.players[seat].token});
    r.lastUsed=Date.now();
    this.send(ws,{type:'joined',code,seat,token:r.players[seat].token,settings:r.settings,chat:r.chat||[]});
    this.maybeStart(r);this.notify(r);await this.persist();
  }
  async detach(ws){
    const a=ws.deserializeAttachment();if(!a)return;
    const r=this.rooms.get(a.roomCode),p=r?.players?.[a.seat];if(!r||p?.ws!==ws)return;
    p.ws=null;p.disconnectedAt=Date.now();r.lastUsed=Date.now();r.voiceReady[a.seat]=false;
    this.broadcast(r,{type:'voice-status',seat:a.seat,enabled:false});
    const matchSeat=r.settings.mode==='tournament'?r.activeSeats.includes(a.seat):true;
    if(matchSeat&&r.phase!=='gameover'&&r.phase!=='champion'&&r.phase!=='waiting'){
      r.phase='paused';r.pauseMessage=`${p.name} perdió la conexión`;
    }
    this.notify(r);this.updateTimer();await this.persist();
  }
  async webSocketMessage(ws,payload){
    if(typeof payload!=='string'||payload.length>8192)return;
    let msg;try{msg=JSON.parse(payload);}catch{return;}
    if(!msg||typeof msg.type!=='string')return;
    if(msg.type==='create'){
      if(ws.deserializeAttachment()?.roomCode)return;
      this.prune();if(this.rooms.size>=MAX_ROOMS)return this.send(ws,{type:'error',message:'Se alcanzó el límite temporal de salas.'});
      const code=this.newCode();const r=makeRoom(code,sanitizeSettings(msg.settings||{}));r.chat=[];r.voiceReady=Array(r.players.length).fill(false);
      if(r.settings.mode==='bot')r.players[1]={name:({easy:'🤖 Bot Fácil',hard:'🤖 Bot Difícil',god:'🤖 Bot Dios'})[r.settings.botDifficulty],token:'',ws:null,disconnectedAt:0,bot:true};
      this.rooms.set(code,r);await this.join(ws,{code,name:msg.name,team:msg.team,isCreator:true});return;
    }
    if(msg.type==='join')return this.join(ws,msg);
    const a=ws.deserializeAttachment(),r=this.rooms.get(a?.roomCode),p=r?.players?.[a?.seat];
    if(!p||p.ws!==ws||p.token!==a.token)return;
    if(msg.type==='move'){
      if(!Number.isFinite(msg.x)||!Number.isFinite(msg.y))return;
      const idx=r.settings.mode==='tournament'?r.activeSeats.indexOf(a.seat):a.seat;
      if(idx<0)return;
      const side=teamOf(r,a.seat),b=boundsForPaddle(r,idx);
      const rx=side===1?W-msg.x:msg.x,ry=side===1?H-msg.y:msg.y;
      const pad=r.paddles[idx];pad.tx=clamp(rx,b.minX,b.maxX);pad.ty=clamp(ry,b.minY,b.maxY);
    }else if(msg.type==='chat'){
      const text=typeof msg.text==='string'?msg.text.trim().slice(0,140):'';
      if(!text||Date.now()-(p.lastChat||0)<750)return;
      p.lastChat=Date.now();
      const item={seat:a.seat,name:p.name,text,at:Date.now()};
      r.chat??=[];r.chat.push(item);if(r.chat.length>30)r.chat.shift();
      this.broadcast(r,{type:'chat',message:item});
    }else if(msg.type==='voice-ready'){
      if(r.players.length>4)return;
      r.voiceReady[a.seat]=Boolean(msg.enabled);
      this.broadcast(r,{type:'voice-status',seat:a.seat,enabled:r.voiceReady[a.seat]});
    }else if(msg.type==='voice-signal'){
      if(r.players.length>4||!r.voiceReady[a.seat])return;
      const to=Number(msg.to);if(!Number.isInteger(to)||to===a.seat||to<0||to>=r.players.length||!r.voiceReady[to])return;
      const signal=msg.signal;
      if(!signal||!['offer','answer','ice'].includes(signal.type))return;
      if(JSON.stringify(signal).length>4200)return;
      this.send(r.players[to]?.ws,{type:'voice-signal',from:a.seat,signal});
    }else if(msg.type==='rematch'&&r.phase==='gameover'&&this.full(r)){
      r.elapsedMs=0;r.remainingMs=r.settings.timeLimit?r.settings.timeLimit*1000:null;
      r.lastTouch=null;r.scores=[0,0];r.winner=null;countdown(r);
      this.notify(r);this.updateTimer();await this.persist();
    }
  }
  async webSocketClose(ws){await this.detach(ws);}
  async webSocketError(ws){await this.detach(ws);}
}
