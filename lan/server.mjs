/** Air Hockey DUO LAN: dependency-free Node 22+ host, no cloud/network required.
 * This is a LOCAL server. Its WebSocket implementation handles masked, fragmented,
 * bounded client messages; physics is imported from the exact shared engine.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  W,H,TICK_RATE,makeRoom,countdown,movePaddles,stepPuck,updatePower,
  recenterPuck,puckRadius,paddleRadius,boundsForPaddle,clamp
} from '../src/physics.js';
import {crossFromView} from '../src/cross.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(__dirname,'../public');
const PORT=Number(process.env.PORT)||8787;
const HOST=process.env.HOST||'0.0.0.0';
const LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QUANTUM=1000/TICK_RATE;
const MAX_FRAME=16384,MAX_CONNECTIONS=24,MAX_ROOMS=20;
const rooms=new Map(),connections=new Set();
let nowSim=Date.now(),lastAt=performance.now(),accum=0,frame=0;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.m4a':'audio/mp4','.ico':'image/x-icon'};
const connected=client=>client && !client.closed;
function pack(opcode,body=Buffer.alloc(0)){
  const data=Buffer.isBuffer(body)?body:Buffer.from(body);
  const len=data.length;
  const header=Buffer.alloc(len<126?2:len<65536?4:10);
  header[0]=0x80|opcode;
  if(len<126)header[1]=len;
  else if(len<65536){header[1]=126;header.writeUInt16BE(len,2);}
  else{header[1]=127;header.writeBigUInt64BE(BigInt(len),2);}
  return Buffer.concat([header,data]);
}
function send(ws,value){if(!connected(ws))return;try{ws.socket.write(pack(1,JSON.stringify(value)));}catch{ws.close();}}
function makeCode(){let code;do{code=Array.from(randomBytes(6),v=>LETTERS[v%LETTERS.length]).join('');}while(rooms.has(code));return code;}
function announce(room){
  const stamp=Date.now();
  const state={type:'state',code:room.code,phase:room.phase,
    players:room.players.map(p=>p?{name:p.name,connected:connected(p.ws),bot:false}:null),
    scores:[...room.scores],paddles:room.paddles.map((p,i)=>({x:p.x,y:p.y,r:paddleRadius(room,i),ack:p.inputSeq||0})),
    puck:{...room.puck,r:puckRadius(room)},settings:room.settings,
    remainingMs:room.remainingMs,power:room.power,effect:room.effect,
    event:room.lastEvent,phaseEnd:room.phaseEnd,serverNow:room.simTime||stamp,
    seq:room.stateSeq=(room.stateSeq||0)+1,winner:room.winner,goalBy:room.goalBy,
    pauseMessage:room.pauseMessage,activeSeats:room.activeSeats,voiceReady:Array(room.players.length).fill(false),tournament:null};
  for(const p of room.players)if((p?.ws?.socket?.writableLength||0)<32768)send(p?.ws,state);
}
function ready(room){return room.players.length>=2&&room.players.every(p=>connected(p?.ws));}
function goal(room,scorer){
  room.scores[scorer]++;room.goalBy=scorer;room.puck.vx=room.puck.vy=0;
  if(room.scores[scorer]>=room.settings.maxScore || (room.remainingMs===0 && room.scores[0]!==room.scores[1])){
    room.winner=scorer;room.phase='gameover';
  }else{room.phase='goal';room.phaseEnd=room.simTime+1350;}
  announce(room);
}
function tick(){
  const t=performance.now();accum+=Math.min(150,Math.max(0,t-lastAt));lastAt=t;
  const steps=Math.min(8,Math.floor((accum+1e-5)/QUANTUM));
  accum=Math.max(0,accum-steps*QUANTUM);
  if(accum>QUANTUM*2){accum=0;}// Discard excess time, never teleport on background wakeup.
  for(let i=0;i<steps;i++){
    nowSim+=QUANTUM;frame++;
    for(const r of rooms.values()){
      if(!ready(r))continue;
      r.simTime=nowSim;
      if(r.phase==='goal'&&nowSim>=r.phaseEnd)countdown(r,1-r.goalBy);
      if(r.phase==='countdown'&&nowSim>=r.phaseEnd)r.phase='playing';
      if(!['playing','overtime','countdown'].includes(r.phase))continue;
      movePaddles(r,1/TICK_RATE);
      if(r.phase==='playing'||r.phase==='overtime'){
        r.elapsedMs+=QUANTUM;
        if(r.remainingMs!==null&&r.remainingMs>0){
          r.remainingMs=Math.max(0,r.remainingMs-QUANTUM);
          if(r.remainingMs===0){
            if(r.scores[0]!==r.scores[1]){r.winner=r.scores[0]>r.scores[1]?0:1;r.phase='gameover';}
            else r.phase='overtime';
          }
        }
        if(['playing','overtime'].includes(r.phase)){
          const scorer=stepPuck(r,1/TICK_RATE);
          if(scorer!==null)goal(r,scorer);
          else if(r.settings.mode!=='cross')updatePower(r,nowSim);
        }
      }
    }
    for(const r of rooms.values()){
      const every=['duo','cross','teams'].includes(r.settings.mode)?3:2;
      if(frame%every===0 && ready(r))announce(r);
    }
  }
}
function join(ws,msg){
  const room=rooms.get(String(msg.code||'').trim().toUpperCase());
  if(!room){send(ws,{type:'error',message:'Sala LAN no encontrada. Ambos deben estar en el mismo Wi-Fi.'});return;}
  if(ws.room){send(ws,{type:'error',message:'Ya participas en una sala.'});return;}
  const token=typeof msg.token==='string'?msg.token:'';
  let seat=room.players.findIndex(p=>p?.token===token&&token.length===32);
  if(seat<0){
    const n=['duo','cross'].includes(room.settings.mode)?2:room.settings.mode==='teams'?4:1;
    const team=msg.team==='blue'?0:msg.team==='pink'?1:-1;
    if(n>1&&team>=0){
      const start=team*n;
      seat=room.players.findIndex((p,i)=>!p&&i>=start&&i<start+n);
      if(seat<0){send(ws,{type:'error',message:'El equipo elegido ya está completo. Prueba con el otro.'});return;}
    } else seat=room.players.findIndex(p=>!p);
  }
  if(seat<0){send(ws,{type:'error',message:'La sala local está llena.'});return;}
  const prev=room.players[seat]?.ws;
  if(prev&&prev!==ws)prev.close();
  const secret=seat===0&&room.players[seat]?.token?room.players[seat].token:room.players[seat]?.token||randomBytes(16).toString('hex');
  room.players[seat]={name:String(msg.name||`Jugador ${seat+1}`).slice(0,20),token:secret,ws,disconnectedAt:0,bot:false};
  ws.room=room;ws.seat=seat;
  // The browser resets its sequence on join/reconnect. Reset the corresponding
  // authoritative ack or the mallet would ignore input until it caught up to
  // the former session's (possibly thousands of) movements.
  room.paddles[seat].inputSeq=0;
  room.paddles[seat].tx=room.paddles[seat].x;
  room.paddles[seat].ty=room.paddles[seat].y;
  send(ws,{type:'joined',code:room.code,seat,token:secret,settings:room.settings,chat:[]});
  if(ready(room)&&['waiting','paused'].includes(room.phase))countdown(room);
  announce(room);
}
function message(ws,msg){
  if(!msg||typeof msg.type!=='string')return;
  if(msg.type==='ping'){if(Number.isFinite(msg.at))send(ws,{type:'pong',at:msg.at});return;}
  if(msg.type==='create'){
    if(ws.room)return;
    if(rooms.size>=MAX_ROOMS){send(ws,{type:'error',message:'Demasiadas salas locales.'});return;}
    const code=makeCode();
    // LAN shares the existing 2-goal physics: duel (2), duo (4), teams (8).
    // New three/four-GOAL arenas are preview only and deliberately not selectable.
    const requested=msg.settings?.mode;
    const mode=['duel','duo','cross','teams'].includes(requested)?requested:'duel';
    const room=makeRoom(code,{...msg.settings,mode});
    rooms.set(code,room);join(ws,{code,name:msg.name,team:msg.team});return;
  }
  if(msg.type==='join'){join(ws,msg);return;}
  const room=ws.room,seat=ws.seat;
  if(!room||room.players[seat]?.ws!==ws)return;
  if(msg.type==='move'){
    if(!Number.isFinite(msg.x)||!Number.isFinite(msg.y))return;
    if(!Number.isSafeInteger(msg.seq)||msg.seq<0||msg.seq<=(room.paddles[seat].inputSeq||0))return;
    const pad=room.paddles[seat],b=boundsForPaddle(room,seat);
    const half=room.players.length/2,opposite=seat>=half;
    const world=room.settings.mode==='cross'?crossFromView(seat,{x:msg.x,y:msg.y}):null;
    pad.tx=clamp(world?world.x:opposite?W-msg.x:msg.x,b.minX,b.maxX);
    pad.ty=clamp(world?world.y:opposite?H-msg.y:msg.y,b.minY,b.maxY);
    if(Number.isSafeInteger(msg.seq)&&msg.seq>=0&&msg.seq>(pad.inputSeq||0))pad.inputSeq=msg.seq;
  }else if(msg.type==='rematch'){
    if(room.phase!=='gameover')return;
    room.rematchVotes??=new Set();room.rematchVotes.add(seat);
    if(room.rematchVotes.size===room.players.length){room.rematchVotes.clear();room.scores=[0,0];room.winner=null;room.goalBy=null;
      room.remainingMs=room.settings.timeLimit?room.settings.timeLimit*1000:null;room.elapsedMs=0;countdown(room);announce(room);}
    else send(ws,{type:'chat',message:{name:'LAN',text:'Esperando que el rival confirme la revancha.',seat:0,at:Date.now()}});
  }else if(msg.type==='chat'){
    const text=String(msg.text||'').trim().slice(0,140);
    if(!text||Date.now()-(ws.lastChat||0)<650)return;
    ws.lastChat=Date.now();
    const item={seat,name:room.players[seat].name,text,at:Date.now()};
    for(const player of room.players)send(player?.ws,{type:'chat',message:item});
  }else if(msg.type==='reset-puck'){
    if(!['playing','overtime'].includes(room.phase)){send(ws,{type:'reset-rejected',message:'Solo puedes recentrar durante la partida.'});return;}
    if(room.lastManualResetAt&&nowSim-room.lastManualResetAt<15000){send(ws,{type:'reset-rejected',message:'Espera unos segundos para recentrar.'});return;}
    room.lastManualResetAt=nowSim;recenterPuck(room,nowSim);announce(room);
  }
}
class Peer {
  constructor(socket){this.socket=socket;this.buffer=Buffer.alloc(0);this.parts=[];this.closed=false;this.room=null;
    socket.on('data',chunk=>this.onData(chunk));socket.on('close',()=>this.close());socket.on('error',()=>this.close());}
  close(){if(this.closed)return;this.closed=true;connections.delete(this);
    const room=this.room;if(room&&room.players[this.seat]?.ws===this){room.players[this.seat].ws=null;
      room.pauseMessage=`${room.players[this.seat].name} se desconectó`;
      if(['playing','countdown','goal','overtime'].includes(room.phase))room.phase='paused';
      announce(room);
    }
    try{this.socket.end(pack(8));this.socket.destroy();}catch{}
  }
  onData(chunk){
    if(this.closed)return;
    this.buffer=Buffer.concat([this.buffer,chunk]);
    if(this.buffer.length>MAX_FRAME*2){this.close();return;}
    while(this.buffer.length>=2){
      const b=this.buffer,opcode=b[0]&0xf,fin=Boolean(b[0]&0x80),masked=Boolean(b[1]&0x80);
      let length=b[1]&0x7f,offset=2;
      if(length===126){if(b.length<4)return;length=b.readUInt16BE(2);offset=4;}
      else if(length===127){if(b.length<10)return;const big=b.readBigUInt64BE(2);if(big>BigInt(MAX_FRAME)){this.close();return;}length=Number(big);offset=10;}
      if(!masked||length>MAX_FRAME){this.close();return;}
      if(b.length<offset+4+length)return;
      const mask=b.subarray(offset,offset+4);offset+=4;
      const data=Buffer.from(b.subarray(offset,offset+length));for(let i=0;i<data.length;i++)data[i]^=mask[i%4];
      this.buffer=b.subarray(offset+length);
      if(opcode===8){this.close();return;}
      if(opcode===9){this.socket.write(pack(10,data));continue;}
      if(opcode===10)continue;
      if(opcode===1){if(this.parts.length){this.close();return;}this.parts.push(data);}
      else if(opcode===0&&this.parts.length)this.parts.push(data);
      else{this.close();return;}
      if(this.parts.reduce((n,p)=>n+p.length,0)>MAX_FRAME){this.close();return;}
      if(!fin)continue;
      const raw=Buffer.concat(this.parts);this.parts=[];
      try{message(this,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));}catch{this.close();return;}
    }
  }
}
const server=http.createServer(async(req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  if(pathname==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,release:'5.3.0-LAN-rc.1',platform:'local-wifi',rooms:rooms.size}));return;}
  const requested=path.posix.normalize(pathname);
  const file=path.resolve(ROOT,'.'+(requested==='/'?'/index.html':requested));
  if(!(file===ROOT||file.startsWith(ROOT+path.sep))){res.writeHead(403);res.end();return;}
  try{
    const info=await stat(file);if(!info.isFile())throw Error('Not a file');
    const bytes=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(bytes);
  }catch{res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Recurso no encontrado');}
});
server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/ws'||connections.size>=MAX_CONNECTIONS||req.headers.upgrade?.toLowerCase()!=='websocket')return socket.destroy();
  const key=req.headers['sec-websocket-key'],origin=req.headers.origin;
  if(typeof key!=='string'||Buffer.from(key,'base64').length!==16||req.headers['sec-websocket-version']!=='13')return socket.destroy();
  if(origin){try{const o=new URL(origin);if(o.host!==req.headers.host)return socket.destroy();}catch{return socket.destroy();}}
  const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const peer=new Peer(socket);connections.add(peer);if(head?.length)peer.onData(head);
});
if(process.env.LAN_TEST!=='1')setInterval(tick,1000/TICK_RATE).unref();
server.listen(PORT,HOST,()=>{
  console.log('\n🏒 AIR HOCKEY DUO — MULTIJUGADOR LAN (SIN INTERNET)');
  console.log('Servidor local disponible en el mismo Wi-Fi:\n');
  for(const iface of Object.values(os.networkInterfaces()))for(const a of iface||[]){if(a.family==='IPv4'&&!a.internal)console.log('  http://'+a.address+':'+PORT);}
  console.log('  http://localhost:'+PORT);
  console.log('\nEn ambos teléfonos, abrir la misma dirección. Crear sala y compartir el código de 6 caracteres.');
  console.log('Mantén esta computadora encendida. No cierres esta terminal. Pulsa Ctrl+C para salir.\n');
});
export {server,rooms,tick};
