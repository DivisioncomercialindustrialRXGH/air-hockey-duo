// Versioned import: a cached 5.0.2 motion.js can never be mixed with this game.js.
import {sampleRemotePose, samplePuckPose, softenPuckPosition, serverFrameTime, pushSnapshot, playoutTime, localBounds} from './motion.js?v=5.5.0-cross-beta.1';
import {directPeer} from './peer-direct.js?v=5.4.0-direct.1';
import {qrSvg} from './qr-local.js?v=5.4.0-direct.1';
import {crossToView,crossViewBounds,crossVelocityToView} from './engine/cross.js?v=5.5.0-cross.1';
import {drawCrossBoard} from './cross-view.js?v=5.5.0-cross.1';
const W = 500, H = 900, PADDLE_R = 37, PUCK_R = 16;
// Local LAN host: both telephones load this page from the computer on the Wi-Fi.
const LAN_HOST = /^(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(location.hostname) && location.protocol==='http:';
document.documentElement.dataset.lan=String(LAN_HOST);
const REMOTE_URL='https://air-hockey-duo.global-realtor1.workers.dev/';
let selectedTransport=LAN_HOST?'lan':(navigator.onLine===false?'screen':'online');
const $ = selector => document.querySelector(selector);
const storage = {
  getItem(key) { try { return localStorage.getItem(key); } catch { return null; } },
  setItem(key, value) { try { localStorage.setItem(key, value); } catch {} }
};
const ui = {
  home: $('#home'), game: $('#game'), connection: $('#connection'), connectionText: $('#connection-text'),
  playerName: $('#player-name'), roomCode: $('#room-code'), error: $('#home-error'),
  create: $('#create-btn'), join: $('#join-btn'), leave: $('#leave-btn'),
  arena: $('#arena'), frame: $('#arena-frame'), gameOverlay: $('#game-overlay'),
  overlayIcon: $('#overlay-icon'), overlayTitle: $('#overlay-title'), overlayDesc: $('#overlay-description'),
  invite: $('#invite-box'), inviteCode: $('#invite-code'), toolbarCode: $('#toolbar-code'),
  share: $('#share-btn'), copy: $('#copy-btn'), rematch: $('#rematch-btn'),
  myName: $('#my-name'), opName: $('#op-name'), myScore: $('#my-score'), opScore: $('#op-score'),
  sound: $('#sound-btn'), fullscreen: $('#fullscreen-btn'), resetPuck: $('#reset-puck-btn'), hint: $('#game-hint'),
  time: $('#match-time'), target: $('#match-score'), powers: $('#powers-enabled'),
  timer: $('#game-time'), goalLabel: $('#game-target'), activePower: $('#active-power'),
  install: $('#install-btn'), installHelp: $('#install-help'),
  mode: $('#game-mode-select'), botDifficulty: $('#bot-difficulty'), botDifficultyOption: $('#bot-difficulty-option'), tournamentSize: $('#tournament-size'), tournamentOption: $('#tournament-option'), createTeamOption: $('#create-team-option'), createTeam: $('#create-team'), joinTeam: $('#join-team'),
  toolbarMode: $('#toolbar-mode'), playersStatus: $('#players-status'), playersStatusText: $('#players-status-text'), infoButton: $('#info-toggle'), rankingButton: $('#ranking-toggle'), tournamentPanel: $('#tournament-panel'),
  tournamentRanking: $('#tournament-ranking'), tournamentRound: $('#tournament-round'),
  audioPanel: $('#audio-panel'), audioClose: $('#audio-close'), infoClose: $('#info-close'), rankingClose: $('#ranking-close'), roomMusic: $('#room-music'), musicVolume: $('#music-volume'),
  musicPlay: $('#music-play-btn'), musicStatus: $('#music-status'),
  fxVolume: $('#sfx-volume'), musicVolumeValue: $('#music-volume-value'), fxVolumeValue: $('#sfx-volume-value'),
  chatToggle: $('#chat-toggle'), chatPanel: $('#chat-panel'), chatClose: $('#chat-close'),
  chatMessages: $('#chat-messages'), chatForm: $('#chat-form'), chatInput: $('#chat-input'),
  voiceButton: $('#voice-btn'),
  chooseOnline: $('#choose-online'), chooseLan: $('#choose-lan'), chooseDirect: $('#choose-direct'), chooseScreen: $('#choose-screen'), chooseBot: $('#choose-bot'),
  directSetup: $('#direct-setup'), directHost: $('#direct-host'), directGuest: $('#direct-guest'),
  directRemote: $('#direct-remote'), directComplete: $('#direct-complete'),directOutput: $('#direct-output'),
  directCode: $('#direct-code'),directCopy: $('#direct-copy'),directQr: $('#direct-qr'),
  directLabel: $('#direct-label'),directStatus: $('#direct-status'),
  lanSetup: $('#lan-setup'),
  lanAddress: $('#lan-address'), openLan: $('#open-lan'), lanEntry: $('#lan-remote-entry'), lanMessage: $('#lan-setup-message'),
  tournamentMode: $('#tournament-mode')
};
const ctx = ui.arena.getContext('2d');
const roomFromUrl = new URLSearchParams(location.search).get('sala')?.toUpperCase();
const app = {
  ws: null, seat: 0, room: null, name: storage.getItem('ah_name') || '', token: null, localBot: null,
  online: false, desiredJoin: null, // No entrar automáticamente: debe poder elegirse el equipo.
  pending: null, state: null, oldPhase: null, lastStateAt: 0, lastGoalBy: null, rttMs:null,
  puckDraw: null, puckFrames: [], remotePaddleFrames: [], clock:{}, trail: [], touchId: null, input: {x: W/2, y: H-127}, inputMoved: false,
  sendAt: 0, localPaddle: null, audioEnabled: storage.getItem('ah_sound') !== 'off', audio: null,
  lastFrame: performance.now(), lastUIAt:0,
  lastEventSeen: 0, lastLocalHit: 0, speculativeUntil: 0, inputV: {x:0,y:0}, prevInputAt: 0,
  particles: [], impacts: [], prevPuckR: PUCK_R, installPrompt: null, lastPower: null,
  musicVolume:Math.max(0,Math.min(1,Number(storage.getItem('ah_music_volume')??25)/100)),
  p2p:null, directHostSettings:null, inputTop:{x:W/2,y:127}, topTouchId:null, directSendAt:0,
  fxVolume:Math.max(0,Math.min(1,Number(storage.getItem('ah_fx_volume')??90)/100)),
  musicRequested:false,musicPausedByUser:false,rankAutoOpened:false,voiceEnabled:false,localStream:null,pcs:new Map(),voiceReady:[]
};
ui.playerName.value = app.name;
// Initialize BEFORE selectTransport() runs at startup, including airplane mode.
// Otherwise a Temporal Dead Zone error disables all buttons in the offline PWA.
let roomRequestTimer=null;
function selectTransport(next){
  selectedTransport=next;
  ui.chooseOnline.setAttribute('aria-pressed',String(next==='online'));
  ui.chooseLan.setAttribute('aria-pressed',String(next==='lan'));
  ui.chooseDirect.setAttribute('aria-pressed',String(next==='direct'));
  ui.chooseScreen.setAttribute('aria-pressed',String(next==='screen'));
  ui.directSetup.classList.toggle('hidden',next!=='direct');
  document.body.dataset.transport=next;
  if(['screen','direct'].includes(next)){
    app.pending=null;
    clearRoomRequestTimer();
    if(app.ws){const previous=app.ws;app.ws=null;previous.close();}
    setConnection(true);
  } else if(!app.localBot){
    // A local-mode status is NOT evidence that the Cloudflare WebSocket is open.
    // Do not make creation appear successful while a new socket is connecting.
    if(app.ws?.readyState!==WebSocket.OPEN)setConnection(false);
    if(!app.ws||![WebSocket.OPEN,WebSocket.CONNECTING].includes(app.ws.readyState))connect();
  }
  ui.lanSetup.classList.toggle('hidden',next!=='lan');
  document.querySelector('#lan-mode-banner').classList.toggle('hidden',!LAN_HOST);
  ui.lanEntry.classList.toggle('hidden',LAN_HOST);
  ui.lanMessage.textContent=LAN_HOST?'✓ Estás dentro de la red local. Crea una sala o únete con el código.':
    'Abre primero la dirección IP que muestra la computadora anfitriona.';
  // Navigating between origins is essential: the URL selects Cloudflare or the local computer.
  if(next==='online'&&LAN_HOST){
    ui.lanMessage.textContent='Para jugar a distancia, abre la versión Online.';
    ui.lanSetup.classList.remove('hidden');
    ui.lanEntry.classList.add('hidden');
  }
  updateModeFields();
}
ui.chooseOnline.addEventListener('click',()=>{
  if(LAN_HOST){location.assign(REMOTE_URL);return;}
  selectTransport('online');
});
ui.chooseLan.addEventListener('click',()=>selectTransport('lan'));
ui.chooseScreen.addEventListener('click',()=>selectTransport('screen'));
// Local BOT is available even without a WebSocket or Internet connection.
ui.chooseBot.addEventListener('click',()=>{
  selectTransport('online');
  ui.mode.value='bot';
  updateModeFields();
  createFromInput();
});
ui.chooseDirect.addEventListener('click',()=>selectTransport('direct'));
function parseLanAddress(value){
  // Intentionally limited to private IPv4 LAN addresses, not arbitrary user-supplied URLs.
  let match=value.trim().match(/^(?:(?:https?:\/\/)?)(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::(\d{2,5}))?\/?$/i);
  if(!match)return null;
  const host=match[1],port=Number(match[2]||8787);
  if(port<1024||port>65535||host.split('.').some(v=>Number(v)>255))return null;
  return `http://${host}:${port}/`;
}
ui.openLan.addEventListener('click',()=>{
  const url=parseLanAddress(ui.lanAddress.value);
  if(!url){ui.lanMessage.textContent='Escribe una IP local válida, por ejemplo 192.168.1.50:8787';return;}
  location.assign(url);
});
ui.lanAddress.addEventListener('keydown',e=>{if(e.key==='Enter')ui.openLan.click();});
selectTransport(selectedTransport);
if(roomFromUrl && /^[A-Z0-9]{6}$/.test(roomFromUrl)){ui.roomCode.value=roomFromUrl;}
function updateModeFields(){
  ui.tournamentOption.classList.toggle('hidden',ui.mode.value!=='tournament');
  const isDirect=selectedTransport==='direct',isScreen=selectedTransport==='screen';
  ui.tournamentMode.disabled=LAN_HOST||isDirect||isScreen;
  if((isDirect||isScreen)&&ui.mode.value!=='duel')ui.mode.value='duel';
  ui.mode.disabled=isDirect||isScreen;
  if(LAN_HOST&&ui.mode.value==='tournament')ui.mode.value='duel';
  ui.botDifficultyOption.classList.toggle('hidden',ui.mode.value!=='bot');
  // Cruz beta uses pure mallet + puck physics; powers stay disabled until calibrated.
  ui.powers.disabled=ui.mode.value==='cross';
  ui.powers.closest('label')?.classList.toggle('muted',ui.mode.value==='cross');
  ui.create.disabled=isDirect||(selectedTransport==='lan'&&!LAN_HOST&&ui.mode.value!=='bot');
  ui.join.disabled=isDirect||isScreen||(selectedTransport==='lan'&&!LAN_HOST);
  ui.create.innerHTML=isScreen?'<span class="button-icon">👆</span> DOS JUGADORES · INICIAR <span class="button-arrow">→</span>':LAN_HOST && ui.mode.value!=='bot'?'<span class="button-icon">📡</span> CREAR SALA WI-FI <span class="button-arrow">→</span>':ui.mode.value==='bot'?'<span class="button-icon">🤖</span> JUGAR CONTRA EL BOT <span class="button-arrow">→</span>':'<span class="button-icon">✦</span> CREAR SALA PRIVADA <span class="button-arrow">→</span>'; 
  ui.createTeamOption.classList.toggle('hidden',!['duo','cross','teams'].includes(ui.mode.value));
}
ui.mode.addEventListener('change',updateModeFields);
updateModeFields();
ui.musicVolume.value=String(Math.round(app.musicVolume*100));
ui.fxVolume.value=String(Math.round(app.fxVolume*100));
ui.musicVolumeValue.textContent=`${ui.musicVolume.value}%`;
ui.fxVolumeValue.textContent=`${ui.fxVolume.value}%`;
ui.roomCode.addEventListener('input', () => { ui.roomCode.value = ui.roomCode.value.replace(/[^a-z0-9]/gi, '').toUpperCase(); });
ui.roomCode.addEventListener('keydown', e => { if (e.key === 'Enter') joinFromInput(); });
ui.playerName.addEventListener('keydown', e => { if (e.key === 'Enter') createFromInput(); });

function setConnection(online) {
  if(app.localBot){online=true;ui.connectionText.textContent='LOCAL · SIN PING';}
  app.online = online;
  ui.connection.classList.toggle('online', online);
  ui.connection.classList.toggle('offline', !online);
  ui.connectionText.textContent = app.localBot?.kind==='screen' ? 'DOS JUGADORES · OFFLINE'
    :app.localBot ? 'LOCAL · SIN PING' :app.p2p?.link?.connected ? 'DOS CELULARES · DIRECTO'
    :selectedTransport==='direct'?'ENLACE DIRECTO · SIN SERVIDOR'
    :selectedTransport==='screen'?'PANTALLA COMPARTIDA'
    :LAN_HOST ? (online?'WI-FI LOCAL':'LAN SIN CONEXIÓN') : online ? 'EN LÍNEA' : 'SIN CONEXIÓN';
}
function send(data) {
  if(app.localBot){
    const {session,engine,kind}=app.localBot;
    const duet=kind==='screen'||kind==='direct-host';
    const rematch=duet?engine.rematchLocalDuel:engine.rematchLocalBot;
    const snapshot=duet?engine.snapshotLocalDuel:engine.snapshotLocalBot;
    const reset=duet?engine.resetLocalDuel:engine.resetLocalBot;
    if(data.type==='move')return;
    if(data.type==='rematch'&&rematch(session))handleMessage(snapshot(session));
    if(data.type==='reset-puck'){
      const error=reset(session);
      if(error)handleMessage({type:'reset-rejected',message:error});
      else handleMessage(snapshot(session));
    }
    return;
  }
  if(app.p2p?.link?.connected){app.p2p.link.send(data);return;}
  if(app.ws?.readyState===WebSocket.OPEN)app.ws.send(JSON.stringify(data));
}
// 5.0.3: every paddle move says WHICH moment of the disc the player was looking
// at (server time). Cloudflare uses it only to rewind a hit by a bounded amount;
// the client never decides collisions or goals.
function sendMove(pos){
  if(app.localBot)return true;
  if(!app.online||(app.p2p?.link?.connected?app.p2p.link.bufferedAmount>4096:app.ws?.bufferedAmount>4096))return false;
  const stamp=performance.now();
  if(stamp-app.sendAt<16)return false;
  const msg={type:'move',x:pos.x,y:pos.y,seq:(app.inputSeq||0)+1};
  // Use the last actually drawn instant, including capped extrapolation.
  if(app.puckDraw?.exact&&Number.isFinite(app.puckDraw.at)){msg.vt=app.puckDraw.at;msg.ack=app.state?.seq;}
  send(msg);app.inputSeq=msg.seq;app.lastSent={x:pos.x,y:pos.y};app.sendAt=stamp;
  return true;
}
const DEBUG_NET=new URLSearchParams(location.search).has('debug');
ui.connection.classList.toggle('debug',DEBUG_NET);
function nameFor(defaultName) {
  const name = ui.playerName.value.trim().slice(0,20) || defaultName;
  storage.setItem('ah_name', name);
  app.name = name;
  return name;
}
function connect() {
  if(app.localBot||app.p2p||selectedTransport==='direct'||selectedTransport==='screen')return;
  if(!LAN_HOST && navigator.onLine===false){setConnection(false);ui.connectionText.textContent='SIN INTERNET · JUEGO LOCAL DISPONIBLE';return;}
  if (app.ws && [WebSocket.OPEN,WebSocket.CONNECTING].includes(app.ws.readyState)) return;
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  app.ws = socket;
  ui.connectionText.textContent = 'CONECTANDO';
  socket.addEventListener('open', () => {
    if (app.ws !== socket) return;
    setConnection(true);
    const pending = app.pending;
    app.pending = null;
    if (pending) send(pending);
    else if (app.room) {
      send({ type: 'join', code: app.room, token: app.token || storage.getItem('ah_token_' + app.room), name: app.name });
    } else if (app.desiredJoin) {
      const code = app.desiredJoin; app.desiredJoin = null;
      send({type:'join', code, team:ui.joinTeam.value, token:storage.getItem('ah_token_' + code), name:nameFor('Jugador 2')});
    }
  });
  socket.addEventListener('message', e => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if(app.ws===socket)handleMessage(msg);
  });
  socket.addEventListener('close', () => {
    if (app.ws !== socket) return;
    setConnection(false);
    if (app.room) {
      ui.gameOverlay.classList.remove('hidden','transparent');
      ui.overlayIcon.textContent = '⌁';
      ui.overlayTitle.textContent = 'SIN CONEXIÓN';
      ui.overlayDesc.textContent = 'Reconectando con la partida...';
      ui.invite.classList.add('hidden'); ui.rematch.classList.add('hidden');
    }
    setTimeout(() => { if (app.ws === socket) connect(); }, 1700);
  });
  socket.addEventListener('error', () => { if (app.ws === socket) setConnection(false); });
}
function clearRoomRequestTimer(){
  if(roomRequestTimer!==null){clearTimeout(roomRequestTimer);roomRequestTimer=null;}
}
function queue(data) {
  if(!LAN_HOST && navigator.onLine===false){showError('No hay conexión a Internet. Para jugar ahora elige UNA PANTALLA o CONTRA BOT; para LAN con PC abre su IP local.');return;}
  // Previously app.online could remain true after switching from DIRECT/SCREEN,
  // while the actual WebSocket was CONNECTING. send() then silently discarded CREATE.
  clearRoomRequestTimer();
  ui.error.textContent='';
  if(app.ws?.readyState===WebSocket.OPEN){
    app.pending=null;
    send(data);
  }else{
    app.pending=data;
    setConnection(false);
    ui.connectionText.textContent='CONECTANDO AL SERVIDOR';
    connect();
  }
  roomRequestTimer=setTimeout(()=>{
    roomRequestTimer=null;
    if(!app.room){
      app.pending=null;
      showError('No se pudo '+(data.type==='create'?'crear':'abrir')+' la sala online. Comprueba Internet y pulsa de nuevo. Si persiste, puede haber un problema en el servidor.');
    }
  },15000);
}
function showError(msg) {
  clearRoomRequestTimer();
  ui.error.textContent = msg;
  if (app.room && !app.state) {
    ui.overlayTitle.textContent = 'NO SE PUDO UNIR';
    ui.overlayDesc.textContent = msg;
  }
}
function createFromInput() {
  unlockAudio();ui.error.textContent='';app.desiredJoin=null;
  const name=nameFor('Jugador 1');
  if(selectedTransport==='screen'){
    const settings={maxScore:Number(ui.target.value),timeLimit:Number(ui.time.value),
      puckSize:document.querySelector('input[name="puck-size"]:checked')?.value||'M',powers:ui.powers.checked};
    startSameScreen(settings,name).catch(err=>showError('No se pudo iniciar la pantalla compartida: '+err.message));return;
  }
  if(selectedTransport==='direct'){showError('Primero crea o responde la invitación de dos celulares.');return;}
  if(selectedTransport==='lan'&&!LAN_HOST&&ui.mode.value!=='bot'){showError('Abre primero la dirección LAN de tu computadora para crear una sala local.');return;}
  const settings={maxScore:Number(ui.target.value),timeLimit:Number(ui.time.value),
    puckSize:document.querySelector('input[name="puck-size"]:checked')?.value||'M',
    powers:ui.powers.checked,mode:ui.mode.value,botDifficulty:ui.botDifficulty.value,tournamentSize:Number(ui.tournamentSize.value)};
  ui.create.textContent='PREPARANDO PARTIDA...';
  if(settings.mode==='bot'){
    startLocalBot(settings,name).catch(error=>{
      app.localBot=null;showError('No se pudo cargar el motor local. Abre el juego con Internet para actualizarlo.');
      console.error('Solo physics failed',error);
      updateModeFields();
    });
  }else queue({type:'create',name,team:ui.createTeam.value,settings});
  setTimeout(updateModeFields,1600);
}
async function startLocalBot(settings,name){
  // The exact same physics engine runs inside this PWA, not in Cloudflare.
  const engine=await import('./local-bot.js?v=5.3.0-choices.1');
  const session=engine.createLocalBot(settings,name);
  const previous=app.ws;app.ws=null;previous?.close();
  app.localBot={engine,session,kind:'bot'};app.seat=0;
  handleMessage({type:'joined',code:'LOCAL',seat:0,token:'',settings:session.room.settings,chat:[]});
  const url=new URL(location.href);url.searchParams.delete('sala');history.replaceState(null,'',url);
  setConnection(true);
  handleMessage(engine.snapshotLocalBot(session));
  ui.hint.textContent='⚡ Entrenamiento local · sin retraso de Internet';
}
function joinFromInput() {
  unlockAudio(); ui.error.textContent = '';
  const code = ui.roomCode.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return showError('Escribe el código de seis caracteres.');
  if(selectedTransport==='lan'&&!LAN_HOST){showError('Abre primero la dirección LAN de tu computadora para entrar a esta sala.');return;}
  queue({ type:'join', code, team:ui.joinTeam.value, token:storage.getItem('ah_token_' + code), name:nameFor('Jugador 2') });
}
async function startSameScreen(settings,name){
  const engine=await import('./local-duel.js?v=5.4.0-direct.1');
  const session=engine.createLocalDuel(settings,name,'Jugador Rosa');
  const old=app.ws;app.ws=null;old?.close();
  app.localBot={engine,session,kind:'screen'};
  app.seat=0;app.input={x:W/2,y:H-127};app.inputTop={x:W/2,y:127};
  app.touchId=null;app.topTouchId=null;
  handleMessage({type:'joined',code:'LOCAL',seat:0,token:'',settings:session.room.settings,chat:[]});
  setConnection(true);
  handleMessage(engine.snapshotLocalDuel(session));
  ui.hint.textContent='Dos jugadores: azul abajo · rosa arriba · un dedo por jugador';
}

// --- Direct phone-to-phone LAN pairing: WebRTC DataChannel, no signaling server. ---
function directStatus(message){ui.directStatus.textContent=message;}
function directSettings(){return {mode:'duel',maxScore:Number(ui.target.value),timeLimit:Number(ui.time.value),
  puckSize:document.querySelector('input[name="puck-size"]:checked')?.value||'M',powers:ui.powers.checked};}
function cancelDirect(){
  app.p2p?.link.close();app.p2p=null;
  ui.directOutput.classList.add('hidden');
}
async function displayDirectSignal(signal,label,kind){
  ui.directOutput.classList.remove('hidden');ui.directLabel.textContent=label;
  ui.directCode.value=signal;ui.directQr.replaceChildren();
  // QR uses the installed PWA shell and never contains a remote server URL.
  try{
    const url=new URL(location.href);url.search='';url.hash=kind+'='+encodeURIComponent(signal);
    const svg=qrSvg(url.toString());
    const blob=new Blob([svg],{type:'image/svg+xml'}),src=URL.createObjectURL(blob);
    const img=new Image();img.alt='QR para transferir la '+(kind==='invite'?'invitación':'respuesta');
    img.onload=()=>URL.revokeObjectURL(src);
    img.src=src;ui.directQr.append(img);
  }catch(err){
    const fallback=document.createElement('span');fallback.textContent='El QR es demasiado grande: comparte el código de texto con AirDrop u otra opción local.';
    ui.directQr.append(fallback);
  }
}
function directLink(role){
  cancelDirect();
  const link=directPeer({
    onStatus:directStatus,
    onOpen:()=>{
      setConnection(true);
      if(role==='host')startDirectHost().then(()=>{if(app.p2p?.pendingJoin){const joining=app.p2p.pendingJoin;app.p2p.pendingJoin=null;handleDirectMessage('host',joining);}}).catch(e=>directStatus('Error iniciando partida: '+e.message));
      else link.send({type:'join',name:nameFor('Jugador Rosa')});
    },
    onMessage:msg=>handleDirectMessage(role,msg),
    onClose:()=>{
      if(app.localBot?.kind==='direct-host')app.localBot=null;
      if(app.state){app.state.phase='paused';app.state.pauseMessage='Se interrumpió el enlace directo';updateUI();}
      directStatus('Desconectado · vuelve a crear una invitación');
    }
  });
  app.p2p={link,role};return link;
}
async function startDirectHost(){
  const engine=await import('./local-duel.js?v=5.4.0-direct.1');
  const session=engine.createLocalDuel(app.directHostSettings||directSettings(),app.name||'Azul','Rosa');
  app.localBot={engine,session,kind:'direct-host'};app.seat=0;
  app.input={x:W/2,y:H-127};
  handleMessage({type:'joined',code:'DIRECT',seat:0,token:'',settings:session.room.settings,chat:[]});
  handleMessage(engine.snapshotLocalDuel(session));
  ui.hint.textContent='⚡ Anfitrión local · sin Cloudflare';
}
function handleDirectMessage(role,msg){
  if(!msg||typeof msg.type!=='string')return;
  if(role==='host'){
    const duel=app.localBot;
    if(!duel||duel.kind!=='direct-host'){if(msg.type==='join'&&app.p2p)app.p2p.pendingJoin=msg;return;}
    const {session,engine}=duel;
    if(msg.type==='join'){
      session.room.players[1].name=String(msg.name||'Jugador Rosa').trim().slice(0,20)||'Jugador Rosa';
      app.p2p.link.send({type:'joined',code:'DIRECT',seat:1,token:'',settings:session.room.settings,chat:[]});
      app.p2p.link.send(engine.snapshotLocalDuel(session));
    }
    if(msg.type==='move'&&Number.isFinite(msg.x)&&Number.isFinite(msg.y)&&Number.isSafeInteger(msg.seq)
      &&msg.seq>(app.p2p?.lastMoveSeq||0)&&['countdown','playing','overtime'].includes(session.room.phase)){
      // Inputs arrive in guest-oriented screen coordinates, rotated 180 degrees.
      engine.setDuelInput(session,1,{x:W-msg.x,y:H-msg.y});
      session.room.paddles[1].ack=msg.seq;
      app.p2p.lastMoveSeq=msg.seq;
    }
    if(msg.type==='rematch'&&engine.rematchLocalDuel(session)){
      app.p2p.link.send(engine.snapshotLocalDuel(session));
    }
    if(msg.type==='reset-puck'){
      const error=engine.resetLocalDuel(session);
      if(error)app.p2p.link.send({type:'reset-rejected',message:error});
      else app.p2p.link.send(engine.snapshotLocalDuel(session));
    }
  }else{
    if(msg.type==='joined'){
      app.localBot=null;
      handleMessage(msg);
      setConnection(true);
      ui.hint.textContent='⚡ Rival directo · sin Cloudflare';
    }else if(msg.type==='state'&&app.room)handleMessage(msg);
    else if(msg.type==='reset-rejected')handleMessage(msg);
  }
}
ui.directHost.addEventListener('click',async()=>{
  unlockAudio();selectTransport('direct');nameFor('Jugador Azul');
  app.directHostSettings=directSettings();
  directStatus('Creando invitación offline…');
  try{const link=directLink('host');await displayDirectSignal(await link.offer(),'INVITACIÓN · entrega al otro celular','invite');}
  catch(err){directStatus('No se pudo crear la invitación: '+err.message);cancelDirect();}
});
ui.directGuest.addEventListener('click',async()=>{
  unlockAudio();selectTransport('direct');
  const code=ui.directRemote.value.trim();
  if(!code){directStatus('Escanea el QR del anfitrión o pega primero su invitación.');return;}
  nameFor('Jugador Rosa');directStatus('Generando respuesta offline…');
  try{const link=directLink('guest');await displayDirectSignal(await link.answer(code),'RESPUESTA · entrega al anfitrión','reply');}
  catch(err){directStatus('No se pudo responder: '+err.message);cancelDirect();}
});
async function finishDirectAnswer(code){
  if(app.p2p?.role!=='host'){directStatus('Primero crea una invitación en este teléfono anfitrión.');return;}
  try{await app.p2p.link.complete(code);directStatus('Respuesta recibida. Estableciendo conexión directa…');}
  catch(err){directStatus('No se pudo completar: '+err.message);}
}
ui.directComplete.addEventListener('click',()=>finishDirectAnswer(ui.directRemote.value.trim()));
ui.directCopy.addEventListener('click',async()=>{
  const code=ui.directCode.value;
  try{
    if(navigator.share){await navigator.share({title:'Air Hockey DUO · conexión directa',text:code});return;}
    await navigator.clipboard.writeText(code);directStatus('Código copiado; compártelo mediante AirDrop/Quick Share.');
  }catch{
    ui.directCode.focus();ui.directCode.select();directStatus('Selecciona y comparte este código de invitación.');
  }
});
// Scanning the QR with the phone's native Camera opens a local app URL.
const signaling=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('air-hockey-duo-direct');
if(signaling)signaling.onmessage=e=>{
  if(e.data?.type==='reply'&&app.p2p?.role==='host')finishDirectAnswer(e.data.code);
};
function loadSignalFromUrl(){
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const invite=hash.get('invite'),reply=hash.get('reply');
  if(!invite&&!reply)return;
  history.replaceState(null,'',location.pathname+location.search);
  selectTransport('direct');
  if(invite){
    ui.directRemote.value=invite;
    directStatus('Invitación recibida por QR. Pulsa RESPONDER INVITACIÓN.');
  }else if(reply){
    ui.directRemote.value=reply;
    signaling?.postMessage({type:'reply',code:reply});
    try{localStorage.setItem('ah_direct_pending_reply',JSON.stringify({code:reply,at:Date.now()}));}catch{}
    directStatus('Respuesta QR recibida. Regresa a la pantalla del anfitrión o pulsa CONECTAR LA RESPUESTA.');
  }
}
loadSignalFromUrl();
// Safari can suspend a tab while the Camera app scans the answer QR.
// Keep the answer briefly so the original host can consume it on focus.
window.addEventListener('focus',()=>{
  if(app.p2p?.role!=='host')return;
  try{
    const pending=JSON.parse(localStorage.getItem('ah_direct_pending_reply')||'null');
    if(pending?.code&&Date.now()-pending.at<120000){
      localStorage.removeItem('ah_direct_pending_reply');finishDirectAnswer(pending.code);
    }
  }catch{}
});

ui.create.addEventListener('click', createFromInput);
ui.join.addEventListener('click', joinFromInput);

function handleMessage(msg) {
  if(msg.type==='pong'){
    const ping=performance.now()-msg.at;
    if(Number.isFinite(ping) && ping>=0 && ping<5000){
      app.rttMs=app.rttMs===null?ping:app.rttMs*.72+ping*.28;
      ui.connectionText.textContent=(LAN_HOST?'LAN · ':app.rttMs>240?'RED LENTA · ':'EN LÍNEA · ')+Math.round(app.rttMs)+'ms';
      // ?debug=1 → numbers needed for the two-phone test protocol.
      if(DEBUG_NET)ui.connectionText.textContent+=` · buf ${Math.round(app.clock?.delayMs||0)} · jit ${Math.round(app.clock?.jitter||0)} · vista ${msg.viewLag??'-'} · comp ${app.compHits||0}`;
    }
    return;
  }
  if (msg.type === 'error') { showError(msg.message || 'Ha ocurrido un error.'); return; }
  if (msg.type === 'joined') {
    clearRoomRequestTimer();
    app.pending=null;
    app.room = msg.code; app.seat = msg.seat; app.token = msg.token;
    app.musicPausedByUser=false; app.musicRequested=false; ui.toolbarMode.textContent=({duel:'DUELO',duo:'2 VS 2 CLÁSICO',cross:'CRUZ 2 VS 2',teams:'4 VS 4',tournament:'TORNEO',bot:'VS BOT'})[msg.settings?.mode]||'DUELO';
    ui.voiceButton.disabled= LAN_HOST || !!app.localBot || !!app.p2p || !['duel','duo','cross'].includes(msg.settings?.mode);
    ui.voiceButton.classList.toggle('hidden',msg.settings?.mode==='bot');
    ui.chatToggle.classList.toggle('hidden',msg.settings?.mode==='bot'||!!app.localBot||!!app.p2p);
    ui.share.classList.toggle('hidden',msg.settings?.mode==='bot'||!!app.localBot||!!app.p2p);
    ui.copy.classList.toggle('hidden',msg.settings?.mode==='bot'||!!app.localBot||!!app.p2p);
    ui.voiceButton.title=ui.voiceButton.disabled?'Voz disponible en duelo y 2 vs 2':'Chat de voz experimental';
    ui.chatMessages.replaceChildren();
    (msg.chat||[]).forEach(addChat);
    app.state = null; app.oldPhase = null; app.lastGoalBy = null; app.trail = []; app.puckDraw = null; app.puckFrames = []; app.remotePaddleFrames=[]; app.clock={};app.inputSeq=0;app.lastSent=null;app.compHits=0; app.localPaddle = null;app.inputMoved=false;
    app.lastEventSeen=0;app.particles=[];app.speculativeUntil=0;app.prevInputAt=0;app.goalFx=null;app.rankSignature='';app.rankAutoOpened=false;closeControlPanels();
    app.input = msg.settings?.mode==='cross'?{x:450,y:760}:{x:W/2,y:H-127}; app.inputMoved = false;
    ui.frame.classList.toggle('cross-arena',msg.settings?.mode==='cross');
    if(!app.localBot&&!app.p2p)storage.setItem('ah_token_' + msg.code, msg.token);
    const url = new URL(location.href); if(app.localBot||app.p2p)url.searchParams.delete('sala');else url.searchParams.set('sala', msg.code); history.replaceState(null,'',url);
    ui.home.classList.add('hidden'); ui.game.classList.remove('hidden');
    ui.toolbarCode.textContent = msg.settings?.mode==='bot'?'SOLO':msg.code;
    ui.inviteCode.textContent = msg.code;
    ui.gameOverlay.classList.remove('hidden');
    ui.hint.textContent = 'Desliza para golpear · ¡Atrapa los poderes!';
    // La música no se descarga hasta que el jugador la solicite expresamente.
    ui.musicStatus.textContent='Pulsa ▶ REPRODUCIR MEZCLA para activar la música. El juego no espera al audio.';
    resizeCanvas();
  }
  if(msg.type==='reset-rejected'){
    ui.resetPuck.disabled=false;
    ui.hint.textContent=msg.message;
    return;
  }
  if(msg.type==='chat' && app.room){addChat(msg.message);return;}
  if(msg.type==='voice-status' && app.room){
    app.voiceReady[msg.seat]=Boolean(msg.enabled);
    if(!msg.enabled)closePeer(msg.seat);
    else if(app.voiceEnabled && app.seat < msg.seat)startPeerOffer(msg.seat).catch(()=>{});
    return;
  }
  if(msg.type==='voice-signal' && app.room){handleVoiceSignal(msg.from,msg.signal).catch(()=>{});return;}
  if (msg.type === 'state' && app.room) {
    const prev=app.state;
    if(Number.isFinite(msg.seq)&&Number.isFinite(prev?.seq)&&msg.seq<=prev.seq)return;
    const phaseChanged=!prev || prev.phase !== msg.phase;
    app.state=msg;
    app.voiceReady=msg.voiceReady||app.voiceReady;
    const oldSide=prev?sideFor(prev):sideFor(msg);
    if(prev&&oldSide!==sideFor(msg)){
      app.localPaddle=null;
      app.inputMoved=false;app.puckDraw=null;app.puckFrames=[];app.remotePaddleFrames=[];app.trail=[];app.input=msg.settings?.mode==='cross'?{x:450,y:760}:{x:W/2,y:H-127};
    }
    app.lastStateAt=performance.now();
    // Server timestamps are uniformly spaced even if packets arrive in bursts.
    // Keep ordinary hit/wall snapshots; discarding them caused visual teleports.
    const tick=serverFrameTime(app.clock,msg.serverNow,app.lastStateAt);
    const trueTeleport=phaseChanged || msg.event?.type==='reset' &&
      msg.event.id!==prev?.event?.id || tick.reset;
    if(trueTeleport){
      app.puckFrames=[];app.remotePaddleFrames=[];
      app.puckDraw=null;app.trail=[];
    }
    pushSnapshot(app.remotePaddleFrames,{at:msg.serverNow,poses:msg.paddles.map(p=>({...orient(p,msg),r:p.r}))});
    const facing=sideFor(msg)===1?-1:1;
    const v=msg.settings?.mode==='cross'?crossVelocityToView(app.seat,msg.puck):{vx:msg.puck.vx*facing,vy:msg.puck.vy*facing};
    const oriented=orient(msg.puck,msg);
    pushSnapshot(app.puckFrames,{at:msg.serverNow,x:oriented.x,y:oriented.y,
      vx:v.vx,vy:v.vy,r:msg.puck.r||PUCK_R,
      eventContact:msg.event?.id!==prev?.event?.id&&['hit','wall'].includes(msg.event?.type)&&Number.isFinite(msg.event?.at)?{...crossEventContact(msg.event,msg)}:null,
      eventKind:msg.event?.id!==prev?.event?.id?msg.event?.type:null});
    if (msg.event && msg.event.id > app.lastEventSeen) {
      app.lastEventSeen=msg.event.id;
      const e=orient(msg.event);
      if(msg.event.type==='hit'){
        if(msg.event.comp&&Number(msg.event.detail)===(msg.settings?.mode==='tournament'?msg.activeSeats.indexOf(app.seat):app.seat))app.compHits=(app.compHits||0)+1;
        burst(e.x,e.y,'#bcecff',9);
        if(performance.now()-app.lastLocalHit>155) sound('hit');
      }else if(msg.event.type==='wall'){
        if(performance.now()-app.lastWallAt>140){sound('wall');app.lastWallAt=performance.now();}
      }else if(msg.event.type==='power'){
        burst(e.x,e.y,'#ffe477',26);sound('power');
      }else if(msg.event.type==='reset'){
        app.puckFrames=[];app.puckDraw=null;app.trail=[];
        ui.hint.textContent='↻ Disco recentrado · El marcador no cambió';
        sound('start');
      }else if(msg.event.type==='spawn')sound('spawn');
    }
    if (phaseChanged) {
      if(['goal','countdown','paused','gameover'].includes(msg.phase)){app.localPaddle=null;app.inputMoved=false;}
      if(['goal','gameover','tournament_wait'].includes(msg.phase)){
        const e=orient(msg.puck);
        burst(e.x,Math.max(10,Math.min(H-10,e.y)),msg.goalBy===sideFor(msg)?'#51e5ff':'#ff65b9',32);
        app.goalFx={start:performance.now(),side:msg.goalBy};
        if(msg.phase==='goal'||msg.phase==='tournament_wait')sound(msg.goalBy===sideFor(msg)?'goal':'lost');
        else sound(msg.winner===sideFor(msg)?'win':'lost');
        if(navigator.vibrate)navigator.vibrate(msg.goalBy===sideFor(msg)?[55,35,85]:[110]);
      } else if(msg.phase==='playing')sound('start');
    }
    if(phaseChanged||performance.now()-app.lastUIAt>120){updateUI();app.lastUIAt=performance.now();}
  }
}
function crossEventContact(e,s){return {at:e.at,...orient(e,s)};}
function isCross(s=app.state){return s?.settings?.mode==='cross';}
function sideFor(s=app.state){
  if(!s)return 0;
  const mode=s.settings?.mode;
  if(mode==='tournament')return s.activeSeats?.indexOf(app.seat)??-1;
  if(mode==='duo'||mode==='cross')return app.seat<2?0:1;
  if(mode==='teams')return app.seat<4?0:1;
  return app.seat;
}
/** Team color belongs to the player's seat, NEVER to who is viewing this screen. */
function paddleTeam(s, paddleIndex) {
  const mode = s?.settings?.mode;
  if (mode === 'duo'||mode==='cross') return paddleIndex < 2 ? 0 : 1;
  if (mode === 'teams') return paddleIndex < 4 ? 0 : 1;
  return paddleIndex === 0 ? 0 : 1;
}
function teamColor(team){return team === 0 ? '#51e5ff' : '#ff65b9';}
function isTeamMatch(s){return ['duo','cross','teams'].includes(s?.settings?.mode);}
/**
 * Carril de la paleta convertido a coordenadas de la pantalla actual.
 * En el equipo rosado orient(p) rota 180° tanto X como Y; el carril
 * de la etiqueta debe reflejarse igual o se quedara pegada al centro.
 * Esta función es SOLO visual, no afecta a la física ni a las entradas.
 */
function screenLaneFor(index,s){
  const perTeam=s?.settings?.mode==='teams'?4:2;
  const col=index%perTeam;
  const left=col*W/perTeam, right=(col+1)*W/perTeam;
  return sideFor(s)===1?[W-right,W-left]:[left,right];
}
function isPlaying(s=app.state){return s&&sideFor(s)!==-1&&['playing','overtime','countdown'].includes(s.phase);}
function labelTeam(s,side){
  if(s.settings?.mode==='tournament'){
    const seat=s.activeSeats?.[side];return seat==null?'ESPERANDO':s.players[seat]?.name||`Jugador ${seat+1}`;
  }
  if(['duo','cross','teams'].includes(s.settings?.mode))return side===0?'AZUL':'ROSA';
  return s.players[side]?.name||`Jugador ${side+1}`;
}
function updateRanking(s){
  const isTournament=s.settings?.mode==='tournament';
  ui.rankingButton.classList.toggle('hidden',!isTournament);
  if(!isTournament){if(!ui.tournamentPanel.classList.contains('hidden'))closeControlPanels();return;}
  if(s.tournament?.finished && !app.rankAutoOpened){app.rankAutoOpened=true;openControlPanel('tournament');}
  const info=s.tournament;ui.tournamentRound.textContent=info?.finished?'FINALIZADO':info?.started?`RONDA ${info.round}`:'POR COMENZAR';
  const ranking=info?.ranking||[];
  const signature=`${info?.round}|${info?.finished}|${(info?.history||[]).map(m=>m.winner??'x').join(',')}`;
  if(signature===app.rankSignature)return;
  app.rankSignature=signature;
  ui.tournamentRanking.replaceChildren();
  if(!ranking.length){ui.tournamentRanking.textContent='Los puestos aparecerán cuando empiece el torneo.';return;}
  ranking.forEach((p,i)=>{
    const el=document.createElement('div');el.className='rank-person'+(p.champion?' champion':'');
    const name=document.createElement('span');name.className='rank-name';name.textContent=`${i+1}. ${p.name}`;
    const stat=document.createElement('em');stat.textContent=`${p.wins} V · ${p.gf} G`;
    el.append(name,stat);ui.tournamentRanking.append(el);
  });
}
function updateUI(){
  const s=app.state;if(!s)return;
  const mine=sideFor(s),view=mine===-1?0:mine,other=1-view;
  const formats={duel:'DUELO 1 vs 1',cross:'ARENA CRUZ 2 vs 2',duo:'EQUIPOS 2 vs 2',teams:'EQUIPOS 4 vs 4',tournament:'TORNEO',bot:'ENTRENAMIENTO VS BOT'};
  ui.toolbarMode.textContent=({duel:'DUELO',duo:'2 VS 2 CLÁSICO',cross:'CRUZ 2 VS 2',teams:'4 VS 4',tournament:'TORNEO',bot:'VS BOT'})[s.settings?.mode]||'DUELO';
  ui.goalLabel.textContent=`A ${s.settings?.maxScore||7} GOLES · DISCO ${s.settings?.puckSize||'M'}`;
  const time=s.remainingMs;
  ui.timer.classList.toggle('overtime',s.phase==='overtime');
  ui.timer.textContent=s.phase==='overtime'?'GOL DE ORO':time==null?'∞':`${String(Math.floor(Math.max(0,time)/60000)).padStart(2,'0')}:${String(Math.floor(Math.max(0,time)%60000/1000)).padStart(2,'0')}`;
  const labels={turbo:'⚡ TURBO',giantPuck:'🔵 DISCO GIGANTE',giantPaddle:'🛡️ PALETA GIGANTE',miniRival:'🩷 MINI PALETA RIVAL',slowPuck:'🐢 BOLA LENTA',powerShot:'🚀 DISPARO CARGADO'};
  ui.activePower.classList.toggle('hidden',!s.effect);
  if(s.effect)ui.activePower.textContent=(labels[s.effect.type]||'PODER')+` · ${Math.max(0,Math.ceil((s.effect.until-(s.serverNow+performance.now()-app.lastStateAt))/1000))}s`;
  // Scores follow each team's fixed hue on BOTH phones (pink remains pink).
  ui.game.style.setProperty('--my-team-color',teamColor(view));
  ui.game.style.setProperty('--their-team-color',teamColor(other));
  ui.myScore.textContent=s.scores[view]||0;ui.opScore.textContent=s.scores[other]||0;
  ui.myName.textContent=labelTeam(s,view);ui.opName.textContent=labelTeam(s,other);
  const count=s.players.filter(p=>p?.connected).length;
  const teamCount=['duo','cross'].includes(s.settings?.mode)?2:s.settings?.mode==='teams'?4:0;
  if(teamCount){
    const blue=s.players.slice(0,teamCount).map(p=>p?.name||'Disponible').join(' · ');
    const pink=s.players.slice(teamCount).map(p=>p?.name||'Disponible').join(' · ');
    ui.playersStatusText.textContent=`👥 ${count}/${s.players.length} conectados · 🔵 AZUL: ${blue} · 🩷 ROSADO: ${pink}`;
  }else ui.playersStatusText.textContent=`${formats[s.settings?.mode]||'PARTIDA'} · 👥 ${count}/${s.players.length} conectados${mine===-1?' · Esperando tu turno':''}`;
  updateRanking(s);
  ui.hint.textContent=isSharedScreen()?'👆 Azul controla abajo · Rosa controla arriba · dos dedos':mine===-1?'👀 Estás viendo el partido. ¡Tu turno llegará!':s.settings?.mode==='cross'?'Arena Cruz: protege tu portería y marca en cualquier arco rival':s.settings?.mode==='duo'||s.settings?.mode==='teams'?'Desliza tu paleta dentro de tu carril · ¡A ganar en equipo!':'Desliza tu paleta · ¡Atrapa los poderes!';
  const show=!['playing','overtime'].includes(s.phase)||mine===-1;
  ui.gameOverlay.classList.toggle('hidden',!show);
  ui.gameOverlay.classList.toggle('transparent',['countdown','goal','tournament_wait'].includes(s.phase));
  ui.invite.classList.toggle('hidden',!!app.localBot||!!app.p2p||s.settings?.mode==='bot'||!['waiting','paused'].includes(s.phase));
  ui.rematch.classList.toggle('hidden',s.phase!=='gameover');
  const seconds=Math.max(1,Math.ceil((s.phaseEnd-(s.serverNow+performance.now()-app.lastStateAt))/1000));
  ui.overlayTitle.style.color='';
  if(s.phase==='waiting'){
    ui.overlayIcon.textContent='⌁';ui.overlayTitle.textContent='ESPERANDO JUGADORES';
    ui.overlayDesc.textContent=`Comparte la sala. Faltan ${Math.max(0,s.players.length-count)} jugadores para empezar.`;
  }else if(s.phase==='paused'){
    ui.overlayIcon.textContent='◌';ui.overlayTitle.textContent='PARTIDA EN PAUSA';
    ui.overlayDesc.textContent=`${s.pauseMessage||'Esperando reconexión'}…`;
  }else if(s.phase==='countdown'){
    ui.overlayIcon.textContent='';ui.overlayTitle.textContent=String(seconds);ui.overlayDesc.textContent=mine===-1?'Observa la partida':'¡PREPÁRATE!';
  }else if(s.phase==='goal'){
    ui.overlayIcon.textContent='';ui.overlayTitle.textContent=s.goalBy===view?'¡GOOOOL!':'¡GOL RIVAL!';
    ui.overlayTitle.style.color=s.goalBy===view?'#51e5ff':'#ff65b9';
    ui.overlayDesc.textContent='¡La bola cruzó la portería! Próxima jugada…';
  }else if(s.phase==='tournament_wait'){
    ui.overlayIcon.textContent='🏆';ui.overlayTitle.textContent='RONDA TERMINADA';ui.overlayDesc.textContent='Preparando siguiente duelo aleatorio…';
  }else if(s.phase==='champion'){
    const champion=s.players[s.tournament?.champion]?.name||'Campeón';
    ui.overlayIcon.textContent='🏆';ui.overlayTitle.textContent='¡CAMPEÓN!';ui.overlayDesc.textContent=`${champion} ganó el torneo. Revisa la clasificación final.`;
  }else if(s.phase==='gameover'){
    ui.overlayIcon.textContent=s.winner===view?'★':'⚡';
    ui.overlayTitle.textContent=isSharedScreen()?(s.winner===0?'¡AZUL GANA!':'¡ROSA GANA!'):s.settings?.mode==='bot'?(s.winner===view?'¡LE GANASTE AL BOT!':'¡EL BOT GANÓ!'):(s.winner===view?'¡GANARON!':'¡BUEN DUELO!');
    ui.overlayTitle.style.color=s.winner===view?'#51e5ff':'#ff9cb6';
    ui.overlayDesc.textContent=s.winner===view?'¡Qué partidazo! ¿Otra ronda?':'¿Revancha?';
  }else if(mine===-1){
    ui.overlayIcon.textContent='👀';ui.overlayTitle.textContent='ESPERANDO TU TURNO';
    ui.overlayDesc.textContent='Puedes seguir el torneo, ver la tabla y chatear.';
  }
}

const inviteUrl = () => {
  const url = new URL(location.href);
  url.searchParams.set('sala', app.room);
  return url.toString();
};
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement('textarea'); el.value = text;
    el.style.position='fixed'; el.style.opacity='0'; document.body.appendChild(el); el.select();
    const ok = document.execCommand('copy'); el.remove(); return ok;
  }
}
function flashButton(button,text) {
  const previous = button.textContent; button.textContent = text;
  setTimeout(() => { button.textContent = previous; }, 1700);
}
ui.copy.addEventListener('click', async () => {
  if (await copy(app.room)) flashButton(ui.copy,'✓ CÓDIGO COPIADO');
});
ui.share.addEventListener('click', async () => {
  const text = '🏒 ¡Te reto a Air Hockey DUO! Entra aquí desde tu teléfono para jugar conmigo:';
  if (navigator.share) {
    try { await navigator.share({ title:'Air Hockey DUO', text, url:inviteUrl() }); return; } catch {}
  }
  if (await copy(`${text}\n${inviteUrl()}\nCódigo: ${app.room}`)) flashButton(ui.share,'✓ ENLACE COPIADO');
});
ui.rematch.addEventListener('click', () => { unlockAudio(); send({type:'rematch'}); });
ui.leave.addEventListener('click', () => {
  if (!confirm('¿Salir de la partida?')) return;
  app.localBot=null;
  app.p2p?.link?.close();app.p2p=null;
  app.topTouchId=null;
  const oldWs = app.ws;
  clearRoomRequestTimer();app.pending=null;
  app.ws = null; app.room = null; app.token = null; app.state = null; app.desiredJoin = null;
  app.pending = null; app.touchId = null; app.localPaddle=null;app.musicPausedByUser=false;closeControlPanels();stopMusic();stopVoice();
  oldWs?.close();
  const url = new URL(location.href); url.searchParams.delete('sala'); history.replaceState(null,'',url);
  ui.game.classList.add('hidden'); ui.home.classList.remove('hidden');ui.frame.classList.remove('cross-arena');
  ui.error.textContent = ''; if(selectedTransport==='online'||selectedTransport==='lan')connect();else setConnection(false);
});
// Paneles flotantes: mantienen la pista a tamaño completo y se cierran entre sí.
const controlPanels = [
  {key:'audio', panel:ui.audioPanel, button:ui.sound},
  {key:'chat', panel:ui.chatPanel, button:ui.chatToggle},
  {key:'info', panel:ui.playersStatus, button:ui.infoButton},
  {key:'tournament', panel:ui.tournamentPanel, button:ui.rankingButton}
];
function closeControlPanels(){
  for(const {panel,button} of controlPanels){panel.classList.add('hidden');button.classList.remove('selected');button.setAttribute('aria-expanded','false');}
}
function openControlPanel(key){
  const selected=controlPanels.find(item=>item.key===key);
  if(!selected)return;
  const wasOpen=!selected.panel.classList.contains('hidden');
  closeControlPanels();
  if(!wasOpen){selected.panel.classList.remove('hidden');selected.button.classList.add('selected');selected.button.setAttribute('aria-expanded','true');}
  if(key==='chat')ui.chatToggle.classList.remove('unread');
  if(key==='audio')updateMusicControls();
}
ui.sound.addEventListener('click',()=>openControlPanel('audio'));
ui.infoButton.addEventListener('click',()=>openControlPanel('info'));
ui.rankingButton.addEventListener('click',()=>openControlPanel('tournament'));
ui.audioClose.addEventListener('click',closeControlPanels);
ui.infoClose.addEventListener('click',closeControlPanels);
ui.rankingClose.addEventListener('click',closeControlPanels);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeControlPanels();});
document.addEventListener('pointerdown',event=>{
  if(!ui.game.classList.contains('hidden') && !event.target.closest('.hud-drawer, .toolbar-actions'))closeControlPanels();
},{passive:true});
ui.musicPlay.addEventListener('click',()=>{
  if(!app.room)return;
  if(!ui.roomMusic.paused){app.musicPausedByUser=true;stopMusic();}
  else {
    app.musicPausedByUser=false;
    if(app.musicVolume===0){app.musicVolume=.25;ui.musicVolume.value='25';ui.musicVolumeValue.textContent='25%';storage.setItem('ah_music_volume','25');}
    unlockAudio();startMusic();
  }
  updateMusicControls();
});
ui.musicVolume.addEventListener('input',()=>{
  app.musicVolume=Number(ui.musicVolume.value)/100;
  ui.musicVolumeValue.textContent=`${ui.musicVolume.value}%`;
  storage.setItem('ah_music_volume',ui.musicVolume.value);
  ui.roomMusic.volume=app.musicVolume;
  if(app.musicVolume===0)stopMusic();else if(app.room&&!app.musicPausedByUser){unlockAudio();startMusic();}
  updateMusicControls();
});
ui.fxVolume.addEventListener('input',()=>{
  app.fxVolume=Number(ui.fxVolume.value)/100;
  ui.fxVolumeValue.textContent=`${ui.fxVolume.value}%`;
  storage.setItem('ah_fx_volume',ui.fxVolume.value);
});
ui.chatToggle.addEventListener('click',()=>openControlPanel('chat'));
ui.chatClose.addEventListener('click',closeControlPanels);
ui.chatForm.addEventListener('submit',e=>{
  e.preventDefault();const text=ui.chatInput.value.trim();if(!text)return;
  send({type:'chat',text:text.slice(0,140)});ui.chatInput.value='';
});
document.querySelectorAll('[data-emoji]').forEach(btn=>btn.addEventListener('click',()=>send({type:'chat',text:btn.dataset.emoji})));
function addChat(item){
  if(!item||typeof item.text!=='string')return;
  const row=document.createElement('div');row.className='chat-line'+(item.seat===app.seat?' mine':'');
  const name=document.createElement('strong');name.textContent=`${item.name||'Jugador'}:`;
  const msg=document.createElement('span');msg.textContent=item.text;
  row.append(name,msg);ui.chatMessages.append(row);
  while(ui.chatMessages.children.length>40)ui.chatMessages.firstChild.remove();
  ui.chatMessages.scrollTop=ui.chatMessages.scrollHeight;
  if(ui.chatPanel.classList.contains('hidden'))ui.chatToggle.classList.add('unread');
}
ui.resetPuck.addEventListener('click',()=>{
  if(!app.room||!['playing','overtime'].includes(app.state?.phase)){
    ui.hint.textContent='Espera a que empiece la partida para recentrar.';
    return;
  }
  send({type:'reset-puck'});
  ui.resetPuck.disabled=true;
  setTimeout(()=>{ui.resetPuck.disabled=false;},15000);
});
ui.fullscreen.addEventListener('click', async () => {
  try {
    if(document.fullscreenElement)await document.exitFullscreen();
    else if(ui.frame.requestFullscreen)await ui.frame.requestFullscreen({navigationUI:'hide'});
    else showInstallHelp();
  }catch{showInstallHelp();}
});

function unlockAudio() {
  if (app.fxVolume===0 && app.musicVolume===0) return;
  try {
    if(!app.audio){
      app.audio=new (window.AudioContext || window.webkitAudioContext)();
      app.fxLimiter=app.audio.createDynamicsCompressor();
      app.fxLimiter.threshold.value=-16;app.fxLimiter.knee.value=12;
      app.fxLimiter.ratio.value=5;app.fxLimiter.attack.value=.003;app.fxLimiter.release.value=.16;
      app.fxLimiter.connect(app.audio.destination);
    }
    if (app.audio.state === 'suspended') app.audio.resume().catch(()=>{});
  } catch {}
}
function note(freq,start,duration,volume=.015,type='sine',music=false){
  if(!app.audio||(music?app.musicVolume:app.fxVolume)===0)return;
  const a=app.audio,osc=a.createOscillator(),g=a.createGain();
  osc.type=type;osc.frequency.setValueAtTime(freq,start);
  g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(volume*(music?app.musicVolume:app.fxVolume),start+.015);
  g.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(g);g.connect(music?a.destination:(app.fxLimiter||a.destination));osc.start(start);osc.stop(start+duration+.01);
}
function sound(type){
  if(app.fxVolume<=0||!app.audio||app.audio.state!=='running')return;
  const t=app.audio.currentTime;
  if(type==='hit'){
    note(170,t,.105,.17,'triangle');note(370,t+.009,.07,.057,'sine');
  }else if(type==='wall'){note(230,t,.065,.09,'triangle');note(460,t+.008,.04,.025,'sine');}
  else if(type==='power'){[510,660,900].forEach((f,i)=>note(f,t+i*.055,.13,.047,'sine'));}
  else if(type==='spawn')note(650,t,.09,.012);
  else{
    const notes=type==='goal'?[590,790,1050]:type==='win'?[520,660,790,1040]:type==='lost'?[440,325]:[390,520];
    notes.forEach((f,i)=>note(f,t+i*.086,.16,.055,type==='lost'?'triangle':'sine'));
  }
}
// La mezcla suministrada se transmite de forma progresiva (AAC, ~50 kbps).
// No se descarga al abrir la portada y el service worker nunca la guarda en caché.
ui.roomMusic.volume=app.musicVolume;
function updateMusicControls(){
  const playing=!ui.roomMusic.paused && !ui.roomMusic.ended;
  ui.musicPlay.textContent=playing?'⏸ PAUSAR MEZCLA':'▶ REPRODUCIR MEZCLA';
  ui.musicPlay.disabled=!app.room;
}
ui.roomMusic.addEventListener('play',()=>{ui.musicStatus.textContent='♫ Reproduciendo la mezcla de house';updateMusicControls();});
ui.roomMusic.addEventListener('pause',updateMusicControls);
ui.roomMusic.addEventListener('waiting',()=>{if(app.room)ui.musicStatus.textContent='Cargando música… la partida continúa normalmente.';});
ui.roomMusic.addEventListener('error',()=>{ui.musicStatus.textContent='No se pudo cargar la música. Comprueba tu conexión.';updateMusicControls();});
function startMusic(){
  if(!app.room||app.musicVolume===0||app.musicPausedByUser)return;
  ui.roomMusic.volume=app.musicVolume;
  if(!app.musicRequested){app.musicRequested=true;ui.roomMusic.load();}
  if(!ui.roomMusic.paused)return;
  const attempt=ui.roomMusic.play();
  if(attempt?.catch)attempt.catch(()=>{
    ui.musicStatus.textContent='Pulsa ▶ Reproducir mezcla para activar el audio en tu celular.';
    updateMusicControls();
  });
}
function stopMusic(){ui.roomMusic.pause();updateMusicControls();}
updateMusicControls();
function burst(x,y,color,count){
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,v=65+Math.random()*350;
    app.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.45+Math.random()*.4,max:.85,color,size:1.5+Math.random()*4});
  }
  if(app.particles.length>70)app.particles.splice(0,app.particles.length-70);
}
function showInstallHelp(){
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);
  ui.installHelp.classList.remove('hidden');
  ui.installHelp.textContent=ios ? 'En iPhone: abre este juego en Safari → botón Compartir ⤴ → Añadir a pantalla de inicio. Luego ábrelo desde su icono.' : 'En Android: abre el menú ⋮ de Chrome → Instalar aplicación o Añadir a pantalla de inicio. La app se abrirá sin la barra del navegador.';
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();app.installPrompt=e;ui.install.classList.remove('hidden');});
ui.install.addEventListener('click',async()=>{
  if(app.installPrompt){const prompt=app.installPrompt;app.installPrompt=null;await prompt.prompt();}
  else showInstallHelp();
});
window.addEventListener('appinstalled',()=>{ui.install.textContent='✓ INSTALADA';ui.installHelp.classList.add('hidden');});
if(LAN_HOST||window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)ui.install.classList.add('hidden');
// Display offline availability only after the entire versioned app shell
// was saved. A connection to local Wi-Fi is still needed for LAN/direct.
async function refreshOfflineReadiness(){
  const tag=document.querySelector('#offline-ready');
  if(!tag)return;
  if(LAN_HOST){tag.dataset.ready='true';tag.textContent='📡 LAN LOCAL · No se necesita Internet. Mantén encendida la computadora anfitriona.';return;}
  if(!('serviceWorker' in navigator)||!('caches' in window)){
    tag.dataset.ready='false';tag.textContent='Para abrir el juego sin Internet, usa Safari/Chrome actualizado e instala la app.';return;
  }
  const key='hockey-duo-v5-5-1-offline-hotfix';
  try{
    if(!navigator.serviceWorker.controller)throw Error('La página no está controlada por la app guardada');
    if(!await caches.has(key))throw Error('La descarga aún no termina');
    const cache=await caches.open(key);
    const paths=['/','/game.js?v=5.5.0-cross-beta.1','/styles.css?v=5.5.0-cross-beta.1',
      '/local-duel.js?v=5.4.0-direct.1','/local-bot.js?v=5.3.0-choices.1',
      '/motion.js?v=5.5.0-cross-beta.1','/engine/physics.js','/engine/geometry.js','/engine/cross.js?v=5.5.0-cross.1','/cross-view.js?v=5.5.0-cross.1'];
    const matches=await Promise.all(paths.map(path=>cache.match(path)));
    if(matches.some(m=>!m))throw Error('Faltan archivos locales');
    tag.dataset.ready='true';
    tag.textContent='✓ LISTO SIN INTERNET · Dos jugadores en una pantalla y contra BOT. Para LAN, conecta a tu Wi-Fi local.';
  }catch{
    tag.dataset.ready='false';
    tag.textContent='⏳ Instalando archivos locales. Con Internet abre la app y espera a que aparezca «LISTO SIN INTERNET» antes de activar modo avión.';
  }
}
window.addEventListener('online',()=>{if(!LAN_HOST && ['online','lan'].includes(selectedTransport))connect();refreshOfflineReadiness();});
window.addEventListener('offline',()=>{if(!LAN_HOST && selectedTransport==='online'){setConnection(false);ui.connectionText.textContent='SIN INTERNET · ELIGE UNA PANTALLA';}refreshOfflineReadiness();});
if('serviceWorker' in navigator)window.addEventListener('load',async()=>{
  try{
    await navigator.serviceWorker.register('/sw.js');
    await refreshOfflineReadiness(); // Informar si la caché aún no está lista.
    await navigator.serviceWorker.ready;
    await refreshOfflineReadiness();
    navigator.serviceWorker.addEventListener('controllerchange',refreshOfflineReadiness);
  }catch{refreshOfflineReadiness();}
});


// Optional voice: browser-to-browser WebRTC with STUN. Some networks need TURN (not included).
function createVoicePeer(seat){
  if(app.pcs.has(seat))return app.pcs.get(seat);
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  app.pcs.set(seat,pc);
  app.localStream?.getTracks().forEach(track=>pc.addTrack(track,app.localStream));
  const audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.style.display='none';
  audio.dataset.voiceSeat=String(seat);document.body.append(audio);
  pc.ontrack=e=>{audio.srcObject=e.streams[0]||new MediaStream([e.track]);audio.play().catch(()=>{});};
  pc.onicecandidate=e=>{if(e.candidate)send({type:'voice-signal',to:seat,signal:{type:'ice',candidate:e.candidate.toJSON()}});};
  pc.onconnectionstatechange=()=>{
    if(['failed','closed','disconnected'].includes(pc.connectionState)&&!app.voiceReady[seat])closePeer(seat);
  };
  return pc;
}
function closePeer(seat){
  app.pcs.get(seat)?.close();app.pcs.delete(seat);
  document.querySelector(`audio[data-voice-seat="${seat}"]`)?.remove();
}
async function startPeerOffer(seat){
  if(!app.voiceEnabled||seat===app.seat||!app.voiceReady[seat])return;
  const pc=createVoicePeer(seat);
  if(pc.signalingState!=='stable')return;
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  send({type:'voice-signal',to:seat,signal:{type:'offer',sdp:pc.localDescription.sdp}});
}
async function handleVoiceSignal(from,signal){
  if(!app.voiceEnabled||!app.voiceReady[from]||!signal)return;
  const pc=createVoicePeer(from);
  if(signal.type==='offer'){
    await pc.setRemoteDescription({type:'offer',sdp:signal.sdp});
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    send({type:'voice-signal',to:from,signal:{type:'answer',sdp:pc.localDescription.sdp}});
  }else if(signal.type==='answer'){
    if(pc.signalingState==='have-local-offer')await pc.setRemoteDescription({type:'answer',sdp:signal.sdp});
  }else if(signal.type==='ice'&&signal.candidate){
    try{await pc.addIceCandidate(signal.candidate);}catch{}
  }
}
function stopVoice(){
  if(app.voiceEnabled)send({type:'voice-ready',enabled:false});
  app.voiceEnabled=false;
  app.localStream?.getTracks().forEach(t=>t.stop());app.localStream=null;
  for(const seat of [...app.pcs.keys()])closePeer(seat);
  ui.voiceButton.classList.remove('active');ui.voiceButton.textContent='🎙';
}
ui.voiceButton.addEventListener('click',async()=>{
  if(ui.voiceButton.disabled)return;
  if(app.voiceEnabled){stopVoice();return;}
  if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined'){
    alert('Tu navegador no permite chat de voz. Usa Chrome o Safari actualizado y HTTPS.');return;
  }
  try{
    app.localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    app.voiceEnabled=true;ui.voiceButton.classList.add('active');ui.voiceButton.textContent='🟢';
    send({type:'voice-ready',enabled:true});
    for(let i=0;i<app.voiceReady.length;i++)if(i!==app.seat&&i>app.seat&&app.voiceReady[i])await startPeerOffer(i);
  }catch{alert('No fue posible activar el micrófono. Revisa los permisos del navegador.');}
});

function ownBounds(){return isCross()?crossViewBounds(app.state?.paddles?.[app.seat]?.r??37):localBounds(app.state,app.seat,sideFor());}
function pointerPosition(e){
  const rect=ui.arena.getBoundingClientRect(),b=ownBounds(),size=isCross()?900:W,sy=isCross()?900:H;
  return {
    x:Math.min(b.hi,Math.max(b.lo,(e.clientX-rect.left)/rect.width*size)),
    y:Math.min(b.maxY,Math.max(b.minY,(e.clientY-rect.top)/rect.height*sy))
  };
}
function moveInput(e, force=false) {
  if (!app.room || !isPlaying() || !['playing','countdown','overtime'].includes(app.state.phase)) return;
  const p = pointerPosition(e);
  const stamp=performance.now(),delta=Math.max(10,stamp-(app.prevInputAt||stamp-16));
  app.inputV={x:(p.x-app.input.x)*1000/delta,y:(p.y-app.input.y)*1000/delta};
  app.prevInputAt=stamp;app.input=p;app.inputMoved=true;
  const now = performance.now();
  if(force || now-app.sendAt>=16)sendMove(p);
}
function isSharedScreen(){return app.localBot?.kind==='screen';}
function moveUpperInput(e){
  if(!isSharedScreen()||!app.state||!isPlaying())return;
  const rect=ui.arena.getBoundingClientRect(),r=app.state.paddles[1]?.r??PADDLE_R;
  const rawX=(e.clientX-rect.left)/rect.width*W;
  const rawY=(e.clientY-rect.top)/rect.height*H;
  app.inputTop={x:Math.max(r+2,Math.min(W-r-2,rawX)),
    y:Math.max(r+19,Math.min(H/2-r-5,rawY))};
}
ui.arena.addEventListener('pointerdown',e=>{
  if(isSharedScreen()){
    const rect=ui.arena.getBoundingClientRect();
    const upper=(e.clientY-rect.top)/rect.height*H<H/2;
    if(upper){if(app.topTouchId!==null)return;app.topTouchId=e.pointerId;}
    else {if(app.touchId!==null)return;app.touchId=e.pointerId;}
    ui.arena.setPointerCapture?.(e.pointerId);
    unlockAudio();if(upper)moveUpperInput(e);else moveInput(e,true);
    return;
  }
  if(app.touchId!==null)return;
  app.touchId=e.pointerId;
  ui.arena.setPointerCapture?.(e.pointerId);
  unlockAudio();moveInput(e,true);
});
ui.arena.addEventListener('pointermove',e=>{
  if(app.touchId===e.pointerId)moveInput(e);
  else if(isSharedScreen()&&app.topTouchId===e.pointerId)moveUpperInput(e);
});
function releasePointer(e){
  if(app.touchId!==e.pointerId&&app.topTouchId!==e.pointerId)return;
  if(e.type==='pointerup'){
    if(app.touchId===e.pointerId)moveInput(e,true);
    else moveUpperInput(e);
  }
  if(app.touchId===e.pointerId)app.touchId=null;
  if(app.topTouchId===e.pointerId)app.topTouchId=null;
  try{if(ui.arena.hasPointerCapture(e.pointerId))ui.arena.releasePointerCapture(e.pointerId);}catch{}
}
ui.arena.addEventListener('pointerup',releasePointer);
ui.arena.addEventListener('pointercancel',releasePointer);
ui.arena.addEventListener('lostpointercapture',e=>{if(app.touchId===e.pointerId)app.touchId=null;if(app.topTouchId===e.pointerId)app.topTouchId=null;});
window.addEventListener('blur',()=>{app.touchId=null;app.topTouchId=null;keys.clear();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){app.touchId=null;app.topTouchId=null;}});
// Control opcional desde un ordenador: WASD o flechas.
const keys = new Set();
window.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS','KeyA','KeyD'].includes(e.code)) {keys.add(e.code); e.preventDefault();}
});
window.addEventListener('keyup', e => keys.delete(e.code));

function resizeCanvas() {
  const rect = ui.arena.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(devicePixelRatio || 1, 1.35);
  ui.arena.width = Math.max(1,Math.round(rect.width*ratio));
  ui.arena.height = Math.max(1,Math.round(rect.height*ratio));
}
new ResizeObserver(resizeCanvas).observe(ui.arena);
const orient = (p,s=app.state) => isCross(s)?crossToView(app.seat,p):sideFor(s) === 1 ? {x:W-p.x,y:H-p.y} : {x:p.x,y:p.y};
function roundRect(x,y,w,h,r) {
  const rad = Math.min(r,w/2,h/2);
  ctx.beginPath();ctx.moveTo(x+rad,y);ctx.arcTo(x+w,y,x+w,y+h,rad);ctx.arcTo(x+w,y+h,x,y+h,rad);ctx.arcTo(x,y+h,x,y,rad);ctx.arcTo(x,y,x+w,y,rad);ctx.closePath();
}
function drawArena(c,bottomTeam=0) {
  const bottomBlue=bottomTeam===0;
  const base = c.createLinearGradient(0,0,W,H);base.addColorStop(0,'#102d4b');base.addColorStop(.5,'#0b1b37');base.addColorStop(1,'#071b30');
  c.fillStyle=base;c.fillRect(0,0,W,H);
  // Pista geométrica y reflejos.
  c.strokeStyle='rgba(107,190,231,.075)';c.lineWidth=1;
  for(let x=0;x<=W;x+=50){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke();}
  for(let y=0;y<=H;y+=50){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}
  const top=c.createRadialGradient(W/2,-60,10,W/2,20,440);
  top.addColorStop(0,bottomBlue?'rgba(254,83,162,.17)':'rgba(48,230,255,.15)');top.addColorStop(1,'rgba(254,83,162,0)');
  c.fillStyle=top;c.fillRect(0,0,W,H/2);
  const bottom=c.createRadialGradient(W/2,H+60,10,W/2,H-20,440);
  bottom.addColorStop(0,bottomBlue?'rgba(48,230,255,.15)':'rgba(254,83,162,.17)');bottom.addColorStop(1,'rgba(48,230,255,0)');
  c.fillStyle=bottom;c.fillRect(0,H/2,W,H/2);
  c.shadowBlur=0;
  // Bordes de la pista con aperturas REALES en la portería: sin una línea invisible.
  const left=W/2-94,right=W/2+94;
  for(const [margin,width,color] of [[4,7,'#395a7a'],[13,2,'rgba(94,166,212,.35)']]){
    c.lineWidth=width;c.strokeStyle=color;c.beginPath();
    c.moveTo(margin,margin);c.lineTo(left,margin);
    c.moveTo(right,margin);c.lineTo(W-margin,margin);
    c.lineTo(W-margin,H-margin);c.lineTo(right,H-margin);
    c.moveTo(left,H-margin);c.lineTo(margin,H-margin);c.lineTo(margin,margin);c.stroke();
  }
  c.strokeStyle='#81c7ef44';c.lineWidth=3;
  c.beginPath();c.moveTo(13,H/2);c.lineTo(W-13,H/2);c.stroke();
  c.beginPath();c.arc(W/2,H/2,93,0,Math.PI*2);c.stroke();
  c.beginPath();c.arc(W/2,H/2,21,0,Math.PI*2);c.stroke();
  c.strokeStyle=bottomBlue?'#ff65b95a':'#51e5ff65';c.lineWidth=3;
  c.beginPath();c.arc(W/2,0,136,0,Math.PI);c.stroke();
  c.strokeStyle=bottomBlue?'#51e5ff65':'#ff65b95a';c.beginPath();c.arc(W/2,H,136,Math.PI,2*Math.PI);c.stroke();
  // Redes: huecos abiertos en los que el disco puede entrar.
  c.fillStyle='rgba(5,6,23,.8)';c.fillRect(left,0,right-left,25);c.fillRect(left,H-25,right-left,25);
  c.fillStyle=bottomBlue?'rgba(255,77,170,.12)':'rgba(74,232,255,.15)';c.fillRect(left,0,right-left,32);
  c.fillStyle=bottomBlue?'rgba(74,232,255,.15)':'rgba(255,77,170,.12)';c.fillRect(left,H-32,right-left,32);
  c.lineWidth=4;c.shadowBlur=16;
  c.strokeStyle=bottomBlue?'#ff65b9':'#51e5ff';c.shadowColor=c.strokeStyle;c.beginPath();
  c.moveTo(left,0);c.lineTo(left,29);c.moveTo(right,0);c.lineTo(right,29);c.stroke();
  c.strokeStyle=bottomBlue?'#51e5ff':'#ff65b9';c.shadowColor=c.strokeStyle;c.beginPath();
  c.moveTo(left,H);c.lineTo(left,H-29);c.moveTo(right,H);c.lineTo(right,H-29);c.stroke();
  c.shadowBlur=0;
  c.font='900 27px system-ui';c.textAlign='center';c.textBaseline='middle';
  c.fillStyle=bottomBlue?'rgba(255,118,184,.13)':'rgba(86,229,255,.15)';c.save();c.translate(W/2,95);c.rotate(Math.PI);c.fillText('RIVAL',0,0);c.restore();
  c.fillStyle=bottomBlue?'rgba(86,229,255,.15)':'rgba(255,118,184,.13)';c.fillText('TU ZONA',W/2,H-94);
  // Pequeñas flechas hacia la portería contraria.
  c.fillStyle='rgba(164,202,238,.14)';c.font='40px sans-serif';c.fillText('⌃',W/2,350);
  c.fillText('⌄',W/2,550);
  const glint=.5;
  c.fillStyle=`rgba(92,220,251,${glint*.1})`;c.fillRect(22,H/2+18,4,110);
}
// Cache expensive glows and gradients. Colors, shapes and sizes are unchanged.
const paddleImages=new Map();
function getPaddleImage(team,r){
  const key=team+':'+r;
  if(paddleImages.has(key))return paddleImages.get(key);
  const pad=Math.ceil(r+30),scale=1.6;
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=Math.ceil(pad*2*scale);
  const pen=canvas.getContext('2d');pen.scale(scale,scale);
  const blue = team === 0;
  const color = teamColor(team);
  pen.save();pen.translate(pad,pad);
  pen.shadowColor=color;pen.shadowBlur=24;
  pen.fillStyle=blue?'#22acd7':'#b82a76';pen.beginPath();pen.arc(0,0,r,0,Math.PI*2);pen.fill();
  pen.shadowBlur=0;
  pen.strokeStyle=blue?'#8cf1ff':'#ffaad8';pen.lineWidth=7;pen.beginPath();pen.arc(0,0,r-4,0,Math.PI*2);pen.stroke();
  const g=pen.createRadialGradient(-12,-14,1,0,0,r);
  if(blue){g.addColorStop(0,'#c4ffff');g.addColorStop(.25,'#5cdaf4');g.addColorStop(.65,'#167cae');g.addColorStop(1,'#073152');}
  else{g.addColorStop(0,'#ffd4ed');g.addColorStop(.25,'#ff79b8');g.addColorStop(.65,'#a32873');g.addColorStop(1,'#48143f');}
  pen.fillStyle=g;pen.beginPath();pen.arc(0,0,r-11,0,Math.PI*2);pen.fill();
  pen.strokeStyle='#ffffff3a';pen.lineWidth=2;pen.beginPath();pen.arc(-7,-7,13,Math.PI,Math.PI*1.6);pen.stroke();
  pen.restore();
  const image={canvas,pad};paddleImages.set(key,image);return image;
}
function drawPaddle(p, team, r=PADDLE_R, name=null, labelWidth=125, lane=null){
  const sprite=getPaddleImage(team,r);
  ctx.drawImage(sprite.canvas,p.x-sprite.pad,p.y-sprite.pad,sprite.pad*2,sprite.pad*2);
  if(name)drawNameTag(p,r,name,team,labelWidth,lane);
}
/** Names for team matches: drawn in screen-space, never upside down on pink devices. */
function drawNameTag(p,r,name,team,widthCap=125,lane=null){
  const full=String(name||'').trim();
  if(!full)return;
  ctx.save();
  ctx.font='800 13px system-ui, sans-serif';
  const maxText=Math.min(widthCap-16,158);
  const glyphs=Array.from(full); // Supports emoji names, without splitting surrogate pairs.
  let caption=full;
  if(ctx.measureText(caption).width>maxText){
    while(glyphs.length>1&&ctx.measureText(glyphs.join('')+'…').width>maxText)glyphs.pop();
    caption=glyphs.join('')+'…';
  }
  const w=Math.max(32,Math.min(widthCap,ctx.measureText(caption).width+17));
  const [left,right]=lane||[0,W];
  // Keep labels strictly within their team's lane, especially in 4 vs. 4.
  const cx=Math.max(left+w/2+2,Math.min(right-w/2-2,p.x));
  const cy=Math.max(16,Math.min(H-16,p.y-r-20));
  const x=cx-w/2,y=cy-13;
  ctx.fillStyle='rgba(4,13,31,.91)';
  ctx.strokeStyle=teamColor(team);ctx.lineWidth=1.3;
  ctx.beginPath();ctx.roundRect(x,y,w,26,9);ctx.fill();ctx.stroke();
  ctx.fillStyle='#f3f9ff';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(caption,cx,cy);
  ctx.restore();
}
const puckImages=new Map();
function getPuckImage(R){
  if(puckImages.has(R))return puckImages.get(R);
  const pad=Math.ceil(R+28),scale=1.6;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=Math.ceil(2*pad*scale);
  const pen=canvas.getContext('2d');pen.scale(scale,scale);
  pen.save();pen.translate(pad,pad);pen.shadowColor='#dbf4ff';pen.shadowBlur=21;
  pen.fillStyle='#dce9f4';pen.beginPath();pen.arc(0,0,R,0,Math.PI*2);pen.fill();
  pen.shadowBlur=0;pen.fillStyle='#253952';pen.beginPath();pen.arc(0,0,R-5,0,Math.PI*2);pen.fill();
  const g=pen.createRadialGradient(-5,-6,0,0,0,R-7);g.addColorStop(0,'#ffffff');g.addColorStop(.5,'#bfd8ea');g.addColorStop(1,'#5f88ac');
  pen.fillStyle=g;pen.beginPath();pen.arc(0,0,R-8,0,Math.PI*2);pen.fill();
  pen.restore();
  const image={canvas,pad};puckImages.set(R,image);return image;
}
function drawPuck(p){
  const R=p.r || PUCK_R;
  const trail=app.trail;
  if (!trail.length || Math.hypot(trail[trail.length-1].x-p.x,trail[trail.length-1].y-p.y)>400) trail.length=0;
  if (!trail.length || Math.hypot(trail[trail.length-1].x-p.x,trail[trail.length-1].y-p.y)>5) trail.push({...p});
  if (trail.length>13) trail.shift();
  for(let i=0;i<trail.length;i++) {
    const point=trail[i], alpha=(i/trail.length)*.19;
    ctx.fillStyle=`rgba(149,224,252,${alpha})`;
    ctx.beginPath();ctx.arc(point.x,point.y,R*(.55+i/trail.length*.3),0,Math.PI*2);ctx.fill();
  }
  const sprite=getPuckImage(R);
  ctx.drawImage(sprite.canvas,p.x-sprite.pad,p.y-sprite.pad,sprite.pad*2,sprite.pad*2);
}
const backdrops=[0,1].map(side=>{
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  drawArena(canvas.getContext('2d'),side);return canvas;
});
function drawPower(s,t){
  if(!s.power)return;
  const p=orient(s.power),icons={turbo:'⚡',giantPuck:'●',giantPaddle:'⬡',miniRival:'🫧',slowPuck:'🐢',powerShot:'🚀'};
  const glow=.7+Math.sin(t/150)*.18;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.sin(t/450)*.2);
  ctx.shadowColor='#ffd876';ctx.shadowBlur=17*glow;
  ctx.beginPath();ctx.arc(0,0,23+Math.sin(t/190)*2,0,Math.PI*2);
  ctx.fillStyle='rgba(255,202,69,.22)';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#ffd66e';ctx.stroke();
  ctx.shadowBlur=0;ctx.fillStyle='#fff1b4';ctx.font='bold 26px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(icons[s.power.type]||'✦',0,0);
  ctx.restore();
}
/** Always render from the server timeline. Ordinary bounces must not reset
 * the puck's interpolation window; only real goals/serves/resets may snap. */
/** Playout delay (5.0.3): measured by motion.js from the real lateness of the
 * snapshots (p90 + half an interval), not from RTT. 5.0.1 used 115–245 ms and
 * 5.0.2 a fixed 48–100 ms anchored on the first packet. Bot and online share
 * it: the bot's snapshots cross the same mobile network. */
function networkViewDelay(){
  return Math.max(24,Math.min(170,app.clock?.delayMs??60));
}
function samplePuck(now,phase){
  if(!app.puckFrames.length)return app.puckDraw;
  if(!['playing','overtime'].includes(phase))return {...app.puckFrames.at(-1)};
  return samplePuckPose(app.puckFrames,app.renderTime??now,{
    delayMs:0,
    maxExtrapolateMs:isCross()?24:50,
    board:isCross()?'cross':'classic'
  });
}

function drawGoalFx(t){
  const g=app.goalFx;if(!g)return;
  const age=(t-g.start)/1000;if(age>.8){app.goalFx=null;return;}
  const ourSide=sideFor(),y=g.side===ourSide?0:H;
  const alpha=(1-age/.8)*.5;
  ctx.save();ctx.globalAlpha=alpha;
  ctx.strokeStyle=g.side===ourSide?'#67f5fc':'#ff88ca';
  for(let i=0;i<3;i++){
    const width=80+age*210+i*25;
    ctx.lineWidth=5-i;ctx.beginPath();ctx.ellipse(W/2,y,width,24+age*85,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
function drawParticles(dt){
  const particles=app.particles;
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];p.life-=dt;
    if(p.life<=0){particles.splice(i,1);continue;}
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;
    ctx.globalAlpha=Math.min(1,p.life/.6);
    ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
}
/** All remote mallets follow a short buffered timeline, not each network packet.
 * 4.6 used only 55ms of delay with 20Hz packets and 22ms of extrapolation;
 * the remote mallet froze for ~20-30ms after most packets. This was the
 * stop-motion effect, even though the bot movement on the server was smooth.
 * 4.7 uses 30Hz snapshots for solo games and an adaptive visual buffer. */
function sampleRemotePaddle(index, now, fallback) {
  const isBot=app.state?.settings?.mode==='bot';
  const xMax=isCross()?900:W,yMax=isCross()?900:H;
  const sampled=sampleRemotePose(app.remotePaddleFrames,index,app.renderTime??now,{
    delayMs:0,
    maxExtrapolateMs:50,
    maxSpeed:isBot?1100:3600,
    bounds:{minX:PADDLE_R,maxX:xMax-PADDLE_R,minY:PADDLE_R,maxY:yMax-PADDLE_R}
  });
  return sampled||fallback;
}

function drawCrossGame(t,dt){
  const s=app.state,seat=app.seat;
  ctx.setTransform(ui.arena.width/900,0,0,ui.arena.height/900,0,0);
  drawCrossBoard(ctx,seat);
  if(!s)return;
  if(keys.size&&isPlaying(s)){
    const vx=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
    const vy=(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0);
    const b=ownBounds();app.input.x=Math.max(b.lo,Math.min(b.hi,app.input.x+vx*900*dt));
    app.input.y=Math.max(b.minY,Math.min(b.maxY,app.input.y+vy*900*dt));
    app.inputV={x:vx*900,y:vy*900};app.inputMoved=true;
    if(t-app.sendAt>=16)sendMove(app.input);
  }
  if(app.inputMoved&&isPlaying(s)&&(!app.lastSent||app.lastSent.x!==app.input.x||app.lastSent.y!==app.input.y))sendMove(app.input);
  app.renderTime=playoutTime(app.clock,t);
  const target=samplePuck(t,s.phase)||{...orient(s.puck),r:s.puck.r||PUCK_R};
  app.puckDraw=['playing','overtime'].includes(s.phase)?softenPuckPosition(app.puckDraw,target,dt):{...target};
  for(let i=0;i<s.paddles.length;i++){
    if(i===seat)continue;
    const p=orient(s.paddles[i]);
    const smoothed=sampleRemotePaddle(i,t,p);
    drawPaddle(smoothed,i<2?0:1,s.paddles[i].r||37,null);
  }
  drawPuck(app.puckDraw);
  const me=orient(s.paddles[seat]);
  if(me){
    const b=ownBounds(),wanted=app.inputMoved?app.input:me;
    const requested={x:Math.max(b.lo,Math.min(b.hi,wanted.x)),y:Math.max(b.minY,Math.min(b.maxY,wanted.y))};
    const ack=s.paddles[seat].ack;
    if(ack===app.inputSeq&&t-app.prevInputAt>120&&!keys.size){requested.x=me.x;requested.y=me.y;}
    if(!app.localPaddle)app.localPaddle={...me};
    const pad=app.localPaddle,dx=requested.x-pad.x,dy=requested.y-pad.y,dist=Math.hypot(dx,dy);
    if(dist>.001){const frac=Math.min(1,3600*dt/dist);pad.x+=dx*frac;pad.y+=dy*frac;}
    drawPaddle(pad,seat<2?0:1,s.paddles[seat].r||37);
  }
  drawParticles(dt);
}
function draw(t){
  if(ui.game.classList.contains('hidden')||document.hidden){
    app.nextPaintAt=0;
    setTimeout(()=>requestAnimationFrame(draw),160);
    return;
  }
  requestAnimationFrame(draw);
  // Frame pacing: ~60 FPS on 60/90/120 Hz screens. Simple 15ms skipping
  // produced 45 FPS on 90Hz phones; an accumulator avoids that regression.
  if(!app.nextPaintAt)app.nextPaintAt=t;
  if(t+.75<app.nextPaintAt)return;
  app.nextPaintAt=Math.max(app.nextPaintAt+1000/60,t+1000/120);
  const dt=Math.min(.04,Math.max(.001,(t-app.lastFrame)/1000));app.lastFrame=t;
  if(app.localBot){
    const {session,engine,kind}=app.localBot;
    const localState=kind==='bot'?engine.tickLocalBot(session,t,app.input)
      :engine.tickLocalDuel(session,t,[app.input,kind==='screen'?app.inputTop:null]);
    handleMessage(localState);
    if(kind==='direct-host'&&app.p2p?.link?.connected&&(t-app.directSendAt>=33||localState.phase!==app.directLastPhase||localState.event?.id!==app.directLastEvent)){
      app.p2p.link.send(localState);
      app.directSendAt=t;app.directLastPhase=localState.phase;app.directLastEvent=localState.event?.id;
    }
  }
  if(isCross(app.state)){drawCrossGame(t,dt);return;}
  ctx.setTransform(ui.arena.width/W,0,0,ui.arena.height/H,0,0);
  ctx.drawImage(backdrops[sideFor(app.state)===1?1:0],0,0,W,H);
  const s=app.state;
  if(!s){drawPaddle({x:W/2,y:127},1);drawPuck({x:W/2,y:H/2,r:PUCK_R});drawPaddle({x:W/2,y:H-127},0);return;}
  if(keys.size&&isPlaying(s)){
    const vx=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
    const vy=(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0);
    const b=ownBounds();app.input.x=Math.max(b.lo,Math.min(b.hi,app.input.x+vx*900*dt));
    app.input.y=Math.max(b.minY,Math.min(b.maxY,app.input.y+vy*900*dt));
    app.inputV={x:vx*900,y:vy*900};app.inputMoved=true;
    if(t-app.sendAt>=16)sendMove(app.input);
  }
  // El último evento táctil también se envía si Android agrupa eventos.
  // Mantiene la entrada fluida sin saturar el servidor con cada evento táctil.
  if(app.inputMoved&&isPlaying(s)&&(!app.lastSent||app.lastSent.x!==app.input.x||app.lastSent.y!==app.input.y))sendMove(app.input);
  app.renderTime=app.localBot?null:playoutTime(app.clock,t);
  const puckTarget=app.localBot?{...orient(s.puck),vx:s.puck.vx,vy:s.puck.vy,r:s.puck.r||PUCK_R,at:s.serverNow,exact:true}:
    samplePuck(t,s.phase)||{...orient(s.puck),vx:0,vy:0,r:s.puck.r||PUCK_R};
  app.puckDraw=app.localBot?{...puckTarget}:['playing','overtime'].includes(s.phase)?softenPuckPosition(app.puckDraw,puckTarget,dt):{...puckTarget};
  app.renderPhase=s.phase;
  drawPower(s,t);
  const localIndex=s.settings?.mode==='tournament'?s.activeSeats.indexOf(app.seat):app.seat;
  const side=sideFor(s);
  const namesOnPaddles=isTeamMatch(s);
  const laneWidth=s.settings?.mode==='teams'?105:170;
  const displayed=s.paddles.map((pad,i)=>({i,p:orient(pad),mine:i===localIndex,
    team:paddleTeam(s,i),name:namesOnPaddles?s.players[i]?.name:null,
    lane:namesOnPaddles?screenLaneFor(i,s):null,
    r:pad.r??(s.effect?.type==='giantPaddle'&&s.effect.owner===i?PADDLE_R*1.42:
      s.effect?.type==='miniRival' && ((i<(s.paddles.length/2))!==(s.effect.owner<(s.paddles.length/2)))?PADDLE_R*.67:PADDLE_R)}));
  for(const pad of displayed.filter(p=>!p.mine)){
    const smoothed=app.localBot?pad.p:sampleRemotePaddle(pad.i,t,pad.p);
    drawPaddle(smoothed,pad.team,smoothed.r??pad.r,pad.name,laneWidth,pad.lane);
  }
  drawPuck(app.puckDraw);
  drawGoalFx(t);
  if(localIndex>=0){
    const me=displayed.find(p=>p.mine);
    // PREDICCIÓN VISUAL LOCAL: la paleta no puede depender de snapshots
    // del servidor a 20 Hz. Esos datos llegan a saltos por la red y causan
    // sensación de arrastre en Android. Esta predicción NO altera la pelota.
    // El servidor conserva la física autoritativa con colisiones continuas.
    const b=ownBounds(),wanted=app.inputMoved?app.input:me.p;
    const requested={x:Math.max(b.lo,Math.min(b.hi,wanted.x)),y:Math.max(b.minY,Math.min(b.maxY,wanted.y))};
    // Once input has settled and been acknowledged, reconcile contact-constrained
    // travel to the server. Active new input still follows the finger immediately.
    const ack=s.paddles[localIndex].ack;
    if(ack===app.inputSeq&&t-app.prevInputAt>120&&!keys.size){requested.x=me.p.x;requested.y=me.p.y;}
    if(!app.localPaddle)app.localPaddle={...me.p};
    if(app.localBot){app.localPaddle={...me.p};drawPaddle(me.p,me.team,me.r,me.name,laneWidth,me.lane);}
    else{
    const visual=app.localPaddle;
    const dx=requested.x-visual.x,dy=requested.y-visual.y;
    const distance=Math.hypot(dx,dy);
    // Seguimiento independiente de la red; mismo límite de 3.600 px/s del servidor.
    const maxDelta=3600*dt;
    if(distance>0.001){const scale=Math.min(1,maxDelta/distance);visual.x+=dx*scale;visual.y+=dy*scale;}
    // Sin arrastres ni reposicionamientos bruscos: al soltar el dedo,
    // el dato autoritativo termina de alcanzar el objetivo naturalmente.
    drawPaddle(visual,me.team,me.r,me.name,laneWidth,me.lane);
    }
  }
  drawParticles(dt);
  return;

}
requestAnimationFrame(draw);
// Light ping every 3s gives players an honest RTT indicator; no paid service.
setInterval(()=>{if(app.online&&app.room&&!app.localBot&&!app.p2p)send({type:'ping',at:performance.now()});},3000);
connect();
