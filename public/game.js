import {sampleRemotePose} from './motion.js';
const W = 500, H = 900, PADDLE_R = 37, PUCK_R = 16;
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
  voiceButton: $('#voice-btn')
};
const ctx = ui.arena.getContext('2d');
const roomFromUrl = new URLSearchParams(location.search).get('sala')?.toUpperCase();
const app = {
  ws: null, seat: 0, room: null, name: storage.getItem('ah_name') || '', token: null,
  online: false, desiredJoin: null, // No entrar automáticamente: debe poder elegirse el equipo.
  pending: null, state: null, oldPhase: null, lastStateAt: 0, lastGoalBy: null,
  puckDraw: null, puckFrames: [], remotePaddleFrames: [], trail: [], touchId: null, input: {x: W/2, y: H-127}, inputMoved: false,
  sendAt: 0, localPaddle: null, audioEnabled: storage.getItem('ah_sound') !== 'off', audio: null,
  lastFrame: performance.now(), lastUIAt:0,
  lastEventSeen: 0, lastLocalHit: 0, speculativeUntil: 0, inputV: {x:0,y:0}, prevInputAt: 0,
  particles: [], impacts: [], prevPuckR: PUCK_R, installPrompt: null, lastPower: null,
  musicVolume:Math.max(0,Math.min(1,Number(storage.getItem('ah_music_volume')??25)/100)),
  fxVolume:Math.max(0,Math.min(1,Number(storage.getItem('ah_fx_volume')??90)/100)),
  musicRequested:false,musicPausedByUser:false,rankAutoOpened:false,voiceEnabled:false,localStream:null,pcs:new Map(),voiceReady:[]
};
ui.playerName.value = app.name;
if(roomFromUrl && /^[A-Z0-9]{6}$/.test(roomFromUrl)){ui.roomCode.value=roomFromUrl;}
function updateModeFields(){
  ui.tournamentOption.classList.toggle('hidden',ui.mode.value!=='tournament');
  ui.botDifficultyOption.classList.toggle('hidden',ui.mode.value!=='bot');
  ui.create.innerHTML=ui.mode.value==='bot'?'<span class="button-icon">🤖</span> JUGAR CONTRA EL BOT <span class="button-arrow">→</span>':'<span class="button-icon">✦</span> CREAR SALA PRIVADA <span class="button-arrow">→</span>'; 
  ui.createTeamOption.classList.toggle('hidden',!['duo','teams'].includes(ui.mode.value));
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
  app.online = online;
  ui.connection.classList.toggle('online', online);
  ui.connection.classList.toggle('offline', !online);
  ui.connectionText.textContent = online ? 'EN LÍNEA' : 'SIN CONEXIÓN';
}
function send(data) { if (app.ws?.readyState === WebSocket.OPEN) app.ws.send(JSON.stringify(data)); }
function nameFor(defaultName) {
  const name = ui.playerName.value.trim().slice(0,20) || defaultName;
  storage.setItem('ah_name', name);
  app.name = name;
  return name;
}
function connect() {
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
    handleMessage(msg);
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
function queue(data) {
  if (app.online) send(data);
  else { app.pending = data; connect(); }
}
function showError(msg) {
  ui.error.textContent = msg;
  if (app.room && !app.state) {
    ui.overlayTitle.textContent = 'NO SE PUDO UNIR';
    ui.overlayDesc.textContent = msg;
  }
}
function createFromInput() {
  unlockAudio(); ui.error.textContent = '';
  app.desiredJoin = null;
  queue({type:'create',name:nameFor('Jugador 1'),team:ui.createTeam.value,settings:{
    maxScore:Number(ui.target.value),timeLimit:Number(ui.time.value),
    puckSize:document.querySelector('input[name="puck-size"]:checked')?.value || 'M',
    powers:ui.powers.checked,mode:ui.mode.value,botDifficulty:ui.botDifficulty.value,tournamentSize:Number(ui.tournamentSize.value)
  }});
  ui.create.textContent = 'CREANDO SALA...';
  setTimeout(updateModeFields,1600);
}
function joinFromInput() {
  unlockAudio(); ui.error.textContent = '';
  const code = ui.roomCode.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return showError('Escribe el código de seis caracteres.');
  queue({ type:'join', code, team:ui.joinTeam.value, token:storage.getItem('ah_token_' + code), name:nameFor('Jugador 2') });
}
ui.create.addEventListener('click', createFromInput);
ui.join.addEventListener('click', joinFromInput);

function handleMessage(msg) {
  if (msg.type === 'error') { showError(msg.message || 'Ha ocurrido un error.'); return; }
  if (msg.type === 'joined') {
    app.room = msg.code; app.seat = msg.seat; app.token = msg.token;
    app.musicPausedByUser=false; app.musicRequested=false; ui.toolbarMode.textContent=({duel:'DUELO',duo:'2 VS 2',teams:'4 VS 4',tournament:'TORNEO',bot:'VS BOT'})[msg.settings?.mode]||'DUELO';
    ui.voiceButton.disabled= !['duel','duo'].includes(msg.settings?.mode);
    ui.voiceButton.classList.toggle('hidden',msg.settings?.mode==='bot');
    ui.chatToggle.classList.toggle('hidden',msg.settings?.mode==='bot');
    ui.share.classList.toggle('hidden',msg.settings?.mode==='bot');
    ui.copy.classList.toggle('hidden',msg.settings?.mode==='bot');
    ui.voiceButton.title=ui.voiceButton.disabled?'Voz disponible en duelo y 2 vs 2':'Chat de voz experimental';
    ui.chatMessages.replaceChildren();
    (msg.chat||[]).forEach(addChat);
    app.state = null; app.oldPhase = null; app.lastGoalBy = null; app.trail = []; app.puckDraw = null; app.puckFrames = []; app.remotePaddleFrames=[]; app.localPaddle = null;app.inputMoved=false;
    app.lastEventSeen=0;app.particles=[];app.speculativeUntil=0;app.prevInputAt=0;app.goalFx=null;app.rankSignature='';app.rankAutoOpened=false;closeControlPanels();
    app.input = { x: W/2, y: H - 127 }; app.inputMoved = false;
    storage.setItem('ah_token_' + msg.code, msg.token);
    const url = new URL(location.href); url.searchParams.set('sala', msg.code); history.replaceState(null,'',url);
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
    const phaseChanged=!prev || prev.phase !== msg.phase;
    app.state=msg;
    app.voiceReady=msg.voiceReady||app.voiceReady;
    const oldSide=prev?sideFor(prev):sideFor(msg);
    if(prev&&oldSide!==sideFor(msg)){
      app.localPaddle=null;
      app.inputMoved=false;app.puckDraw=null;app.puckFrames=[];app.remotePaddleFrames=[];app.trail=[];app.input={x:W/2,y:H-127};
    }
    app.lastStateAt=performance.now();
    // Dibujamos snapshots autoritativos; no se ejecuta otra física distinta en el celular.
    // Si hubo choque/gol, empezamos una nueva curva, nunca interpolamos "a través" del rebote.
    if(phaseChanged || (prev && msg.event?.id!==prev.event?.id && ['hit','wall','reset'].includes(msg.event?.type))){
      app.puckFrames=[];
      app.remotePaddleFrames=[];
    }
    // Interpolate remote mallets using the SAME visual timeline as the puck.
    // Drawing raw 20 Hz snapshots caused the bot to appear to vibrate even
    // when its server-side position was perfectly smooth at 60 Hz.
    app.remotePaddleFrames.push({at:app.lastStateAt,poses:msg.paddles.map(p=>orient(p,msg))});
    if(app.remotePaddleFrames.length>12)app.remotePaddleFrames.shift();
    const facing=sideFor(msg)===1?-1:1;
    const oriented=orient(msg.puck,msg);
    app.puckFrames.push({at:app.lastStateAt,x:oriented.x,y:oriented.y,vx:msg.puck.vx*facing,vy:msg.puck.vy*facing,r:msg.puck.r||PUCK_R});
    if(app.puckFrames.length>5)app.puckFrames.shift();
    if (msg.event && msg.event.id > app.lastEventSeen) {
      app.lastEventSeen=msg.event.id;
      const e=orient(msg.event);
      if(msg.event.type==='hit'){
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
function sideFor(s=app.state){
  if(!s)return 0;
  const mode=s.settings?.mode;
  if(mode==='tournament')return s.activeSeats?.indexOf(app.seat)??-1;
  if(mode==='duo')return app.seat<2?0:1;
  if(mode==='teams')return app.seat<4?0:1;
  return app.seat;
}
/** Team color belongs to the player's seat, NEVER to who is viewing this screen. */
function paddleTeam(s, paddleIndex) {
  const mode = s?.settings?.mode;
  if (mode === 'duo') return paddleIndex < 2 ? 0 : 1;
  if (mode === 'teams') return paddleIndex < 4 ? 0 : 1;
  return paddleIndex === 0 ? 0 : 1;
}
function teamColor(team){return team === 0 ? '#51e5ff' : '#ff65b9';}
function isTeamMatch(s){return s?.settings?.mode === 'duo' || s?.settings?.mode === 'teams';}
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
  if(s.settings?.mode==='duo'||s.settings?.mode==='teams')return side===0?'AZUL':'ROSA';
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
  const formats={duel:'DUELO 1 vs 1',duo:'EQUIPOS 2 vs 2',teams:'EQUIPOS 4 vs 4',tournament:'TORNEO',bot:'ENTRENAMIENTO VS BOT'};
  ui.toolbarMode.textContent=({duel:'DUELO',duo:'2 VS 2',teams:'4 VS 4',tournament:'TORNEO',bot:'VS BOT'})[s.settings?.mode]||'DUELO';
  ui.goalLabel.textContent=`A ${s.settings?.maxScore||7} GOLES · DISCO ${s.settings?.puckSize||'M'}`;
  const time=s.remainingMs;
  ui.timer.classList.toggle('overtime',s.phase==='overtime');
  ui.timer.textContent=s.phase==='overtime'?'GOL DE ORO':time==null?'∞':`${String(Math.floor(Math.max(0,time)/60000)).padStart(2,'0')}:${String(Math.floor(Math.max(0,time)%60000/1000)).padStart(2,'0')}`;
  const labels={turbo:'⚡ TURBO',giantPuck:'🔵 DISCO GIGANTE',giantPaddle:'🛡️ PALETA GIGANTE'};
  ui.activePower.classList.toggle('hidden',!s.effect);
  if(s.effect)ui.activePower.textContent=(labels[s.effect.type]||'PODER')+` · ${Math.max(0,Math.ceil((s.effect.until-(s.serverNow+performance.now()-app.lastStateAt))/1000))}s`;
  // Scores follow each team's fixed hue on BOTH phones (pink remains pink).
  ui.game.style.setProperty('--my-team-color',teamColor(view));
  ui.game.style.setProperty('--their-team-color',teamColor(other));
  ui.myScore.textContent=s.scores[view]||0;ui.opScore.textContent=s.scores[other]||0;
  ui.myName.textContent=labelTeam(s,view);ui.opName.textContent=labelTeam(s,other);
  const count=s.players.filter(p=>p?.connected).length;
  const teamCount=s.settings?.mode==='duo'?2:s.settings?.mode==='teams'?4:0;
  if(teamCount){
    const blue=s.players.slice(0,teamCount).map(p=>p?.name||'Disponible').join(' · ');
    const pink=s.players.slice(teamCount).map(p=>p?.name||'Disponible').join(' · ');
    ui.playersStatusText.textContent=`👥 ${count}/${s.players.length} conectados · 🔵 AZUL: ${blue} · 🩷 ROSADO: ${pink}`;
  }else ui.playersStatusText.textContent=`${formats[s.settings?.mode]||'PARTIDA'} · 👥 ${count}/${s.players.length} conectados${mine===-1?' · Esperando tu turno':''}`;
  updateRanking(s);
  ui.hint.textContent=mine===-1?'👀 Estás viendo el partido. ¡Tu turno llegará!':s.settings?.mode==='duo'||s.settings?.mode==='teams'?'Desliza tu paleta dentro de tu carril · ¡A ganar en equipo!':'Desliza tu paleta · ¡Atrapa los poderes!';
  const show=!['playing','overtime'].includes(s.phase)||mine===-1;
  ui.gameOverlay.classList.toggle('hidden',!show);
  ui.gameOverlay.classList.toggle('transparent',['countdown','goal','tournament_wait'].includes(s.phase));
  ui.invite.classList.toggle('hidden',s.settings?.mode==='bot'||!['waiting','paused'].includes(s.phase));
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
    ui.overlayTitle.textContent=s.settings?.mode==='bot'?(s.winner===view?'¡LE GANASTE AL BOT!':'¡EL BOT GANÓ!'):(s.winner===view?'¡GANARON!':'¡BUEN DUELO!');
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
  const oldWs = app.ws;
  app.ws = null; app.room = null; app.token = null; app.state = null; app.desiredJoin = null;
  app.pending = null; app.touchId = null; app.localPaddle=null;app.musicPausedByUser=false;closeControlPanels();stopMusic();stopVoice();
  oldWs?.close();
  const url = new URL(location.href); url.searchParams.delete('sala'); history.replaceState(null,'',url);
  ui.game.classList.add('hidden'); ui.home.classList.remove('hidden');
  ui.error.textContent = ''; connect();
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
if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)ui.install.classList.add('hidden');
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));

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

function ownBounds(){
  const s=app.state,m=s?.settings?.mode;
  if(m!=='duo' && m!=='teams')return {lo:PADDLE_R+5,hi:W-PADDLE_R-5};
  const n=m==='duo'?2:4,part=app.seat%n,side=sideFor();
  const lane=side===1?n-1-part:part,low=lane*W/n,high=(lane+1)*W/n;
  return {lo:low+PADDLE_R+2,hi:high-PADDLE_R-2};
}
function pointerPosition(e){
  const rect=ui.arena.getBoundingClientRect(),b=ownBounds();
  return {
    x:Math.min(b.hi,Math.max(b.lo,(e.clientX-rect.left)/rect.width*W)),
    y:Math.min(H-PADDLE_R-20,Math.max(H/2+PADDLE_R+5,(e.clientY-rect.top)/rect.height*H))
  };
}
function moveInput(e, force=false) {
  if (!app.room || !isPlaying() || !['playing','countdown','overtime'].includes(app.state.phase)) return;
  const p = pointerPosition(e);
  const stamp=performance.now(),delta=Math.max(10,stamp-(app.prevInputAt||stamp-16));
  app.inputV={x:(p.x-app.input.x)*1000/delta,y:(p.y-app.input.y)*1000/delta};
  app.prevInputAt=stamp;app.input=p;app.inputMoved=true;
  const now = performance.now();
  if(force || now-app.sendAt>=22){send({type:'move',x:p.x,y:p.y});app.sendAt=now;}
}
ui.arena.addEventListener('pointerdown', e => {
  if (app.touchId !== null) return;
  app.touchId = e.pointerId;
  ui.arena.setPointerCapture?.(e.pointerId);
  unlockAudio(); moveInput(e,true);
});
ui.arena.addEventListener('pointermove', e => {
  if (app.touchId === e.pointerId) moveInput(e);
});
function releasePointer(e) {
  if (app.touchId !== e.pointerId) return;
  if(e.type==='pointerup')moveInput(e,true);
  app.touchId=null;
  try { if(ui.arena.hasPointerCapture(e.pointerId))ui.arena.releasePointerCapture(e.pointerId); } catch {}
}
ui.arena.addEventListener('pointerup',releasePointer);
ui.arena.addEventListener('pointercancel',releasePointer);
ui.arena.addEventListener('lostpointercapture',e=>{if(app.touchId===e.pointerId)app.touchId=null;});
window.addEventListener('blur',()=>{app.touchId=null;keys.clear();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)app.touchId=null;});
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
const orient = (p,s=app.state) => sideFor(s) === 1 ? {x:W-p.x,y:H-p.y} : {x:p.x,y:p.y};
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
function drawPaddle(p, team, r=PADDLE_R, name=null, labelWidth=125, lane=null) {
  const blue = team === 0;
  const color = teamColor(team);
  ctx.save();ctx.translate(p.x,p.y);
  ctx.shadowColor=color;ctx.shadowBlur=24;
  ctx.fillStyle=blue?'#22acd7':'#b82a76';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;
  ctx.strokeStyle=blue?'#8cf1ff':'#ffaad8';ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,r-4,0,Math.PI*2);ctx.stroke();
  const g=ctx.createRadialGradient(-12,-14,1,0,0,r);
  if(blue){g.addColorStop(0,'#c4ffff');g.addColorStop(.25,'#5cdaf4');g.addColorStop(.65,'#167cae');g.addColorStop(1,'#073152');}
  else{g.addColorStop(0,'#ffd4ed');g.addColorStop(.25,'#ff79b8');g.addColorStop(.65,'#a32873');g.addColorStop(1,'#48143f');}
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r-11,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ffffff3a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(-7,-7,13,Math.PI,Math.PI*1.6);ctx.stroke();
  ctx.restore();
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
function drawPuck(p) {
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
  ctx.save();ctx.translate(p.x,p.y);ctx.shadowColor='#dbf4ff';ctx.shadowBlur=21;
  ctx.fillStyle='#dce9f4';ctx.beginPath();ctx.arc(0,0,R,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#253952';ctx.beginPath();ctx.arc(0,0,R-5,0,Math.PI*2);ctx.fill();
  const g=ctx.createRadialGradient(-5,-6,0,0,0,R-7);g.addColorStop(0,'#ffffff');g.addColorStop(.5,'#bfd8ea');g.addColorStop(1,'#5f88ac');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,R-8,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
const backdrops=[0,1].map(side=>{
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  drawArena(canvas.getContext('2d'),side);return canvas;
});
function drawPower(s,t){
  if(!s.power)return;
  const p=orient(s.power),icons={turbo:'⚡',giantPuck:'●',giantPaddle:'⬡'};
  const glow=.7+Math.sin(t/150)*.18;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.sin(t/450)*.2);
  ctx.shadowColor='#ffd876';ctx.shadowBlur=17*glow;
  ctx.beginPath();ctx.arc(0,0,23+Math.sin(t/190)*2,0,Math.PI*2);
  ctx.fillStyle='rgba(255,202,69,.22)';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#ffd66e';ctx.stroke();
  ctx.shadowBlur=0;ctx.fillStyle='#fff1b4';ctx.font='bold 26px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(icons[s.power.type]||'✦',0,0);
  ctx.restore();
}
/**
 * El servidor es el único que calcula colisiones. Los últimos estados se dibujan
 * con un ligero retardo (45 ms) y extrapolación máxima de 30 ms cuando llegan tarde.
 * Antes, la física "especulativa" del celular chocaba con la del servidor y podía
 * dibujar la bola saliendo hacia atrás al corregir la posición.
 */
function samplePuck(now,phase){
  const frames=app.puckFrames;
  if(!frames.length)return app.puckDraw;
  const newest=frames[frames.length-1], target=now-(app.state?.settings?.mode==='bot'?92:45);
  if(!['playing','overtime'].includes(phase))return {...newest};
  if(target<=frames[0].at)return {...frames[0]};
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i];
    if(target<=b.at){
      const fraction=Math.max(0,Math.min(1,(target-a.at)/Math.max(1,b.at-a.at)));
      return {x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction,
        vx:b.vx,vy:b.vy,r:a.r+(b.r-a.r)*fraction};
    }
  }
  const elapsed=Math.min(30,Math.max(0,target-newest.at))/1000;
  const radius=newest.r;
  let x=newest.x+newest.vx*elapsed,y=newest.y+newest.vy*elapsed;
  x=Math.min(W-radius,Math.max(radius,x));
  // En los bordes verticales dejamos que el servidor decida si es gol o rebote.
  y=Math.min(H+radius,Math.max(-radius,y));
  return {...newest,x,y};
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
  const sampled=sampleRemotePose(app.remotePaddleFrames,index,now,{
    delayMs:isBot?92:108,
    maxExtrapolateMs:55,
    maxSpeed:isBot?1100:3600,
    bounds:{minX:PADDLE_R,maxX:W-PADDLE_R,minY:PADDLE_R,maxY:H-PADDLE_R}
  });
  return sampled||fallback;
}

function draw(t){
  const dt=Math.min(.04,Math.max(.001,(t-app.lastFrame)/1000));app.lastFrame=t;
  if(ui.game.classList.contains('hidden')||document.hidden){
    setTimeout(()=>requestAnimationFrame(draw),160);
    return;
  }
  requestAnimationFrame(draw);
  ctx.setTransform(ui.arena.width/W,0,0,ui.arena.height/H,0,0);
  ctx.drawImage(backdrops[sideFor(app.state)===1?1:0],0,0,W,H);
  const s=app.state;
  if(!s){drawPaddle({x:W/2,y:127},1);drawPuck({x:W/2,y:H/2,r:PUCK_R});drawPaddle({x:W/2,y:H-127},0);return;}
  if(keys.size&&isPlaying(s)){
    const vx=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
    const vy=(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0);
    const b=ownBounds();app.input.x=Math.max(b.lo,Math.min(b.hi,app.input.x+vx*900*dt));
    app.input.y=Math.max(H/2+42,Math.min(H-57,app.input.y+vy*900*dt));
    app.inputV={x:vx*900,y:vy*900};app.inputMoved=true;
    if(t-app.sendAt>22){send({type:'move',...app.input});app.sendAt=t;}
  }
  // El último evento táctil también se envía si Android agrupa eventos.
  // Mantiene la entrada fluida sin saturar el servidor con cada evento táctil.
  if(app.touchId!==null && app.inputMoved && t-app.sendAt>=22 && isPlaying(s)){
    send({type:'move',...app.input});app.sendAt=t;
  }
  app.puckDraw=samplePuck(t,s.phase)||{...orient(s.puck),vx:0,vy:0,r:s.puck.r||PUCK_R};
  app.renderPhase=s.phase;
  drawPower(s,t);
  const localIndex=s.settings?.mode==='tournament'?s.activeSeats.indexOf(app.seat):app.seat;
  const side=sideFor(s);
  const namesOnPaddles=isTeamMatch(s);
  const laneWidth=s.settings?.mode==='teams'?105:170;
  const displayed=s.paddles.map((pad,i)=>({i,p:orient(pad),mine:i===localIndex,
    team:paddleTeam(s,i),name:namesOnPaddles?s.players[i]?.name:null,
    lane:namesOnPaddles?screenLaneFor(i,s):null,
    r:s.effect?.type==='giantPaddle'&&s.effect.owner===i?PADDLE_R*1.42:PADDLE_R}));
  for(const pad of displayed.filter(p=>!p.mine)){
    const smoothed=sampleRemotePaddle(pad.i,t,pad.p);
    drawPaddle(smoothed,pad.team,pad.r,pad.name,laneWidth,pad.lane);
  }
  drawPuck(app.puckDraw);
  drawGoalFx(t);
  if(localIndex>=0){
    const me=displayed.find(p=>p.mine);
    // PREDICCIÓN VISUAL LOCAL: la paleta no puede depender de snapshots
    // del servidor a 20 Hz. Esos datos llegan a saltos por la red y causan
    // sensación de arrastre en Android. Esta predicción NO altera la pelota.
    // El servidor conserva la física autoritativa con colisiones continuas.
    const requested=app.inputMoved?app.input:me.p;
    if(!app.localPaddle)app.localPaddle={...me.p};
    const visual=app.localPaddle;
    const dx=requested.x-visual.x,dy=requested.y-visual.y;
    const distance=Math.hypot(dx,dy);
    // Seguimiento independiente del 20 Hz de red. Máximo 4.200 px/s,
    // ligeramente superior al límite del servidor de 3.600 px/s.
    const maxDelta=4200*dt;
    if(distance>0.001){const scale=Math.min(1,maxDelta/distance);visual.x+=dx*scale;visual.y+=dy*scale;}
    // Sin arrastres ni reposicionamientos bruscos: al soltar el dedo,
    // el dato autoritativo termina de alcanzar el objetivo naturalmente.
    drawPaddle(visual,me.team,me.r,me.name,laneWidth,me.lane);
  }
  drawParticles(dt);
  return;

}
requestAnimationFrame(draw);
connect();
