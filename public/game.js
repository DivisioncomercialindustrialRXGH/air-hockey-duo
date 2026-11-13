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
  sound: $('#sound-btn'), fullscreen: $('#fullscreen-btn'), hint: $('#game-hint')
};
const ctx = ui.arena.getContext('2d');
const roomFromUrl = new URLSearchParams(location.search).get('sala')?.toUpperCase();
const app = {
  ws: null, seat: 0, room: null, name: storage.getItem('ah_name') || '', token: null,
  online: false, desiredJoin: roomFromUrl && /^[A-Z0-9]{6}$/.test(roomFromUrl) ? roomFromUrl : null,
  pending: null, state: null, oldPhase: null, lastStateAt: 0, lastGoalBy: null,
  puckDraw: null, trail: [], touchId: null, input: {x: W/2, y: H-127}, inputMoved: false,
  sendAt: 0, audioEnabled: true, audio: null, lastFrame: performance.now()
};
ui.playerName.value = app.name;
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
      send({type:'join', code, token:storage.getItem('ah_token_' + code), name:nameFor('Jugador 2')});
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
  queue({type:'create',name:nameFor('Jugador 1')});
  ui.create.textContent = 'CREANDO SALA...';
  setTimeout(() => { ui.create.innerHTML = '<span class="button-icon">✦</span> CREAR SALA PRIVADA <span class="button-arrow">→</span>'; }, 1600);
}
function joinFromInput() {
  unlockAudio(); ui.error.textContent = '';
  const code = ui.roomCode.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return showError('Escribe el código de seis caracteres.');
  queue({ type:'join', code, token:storage.getItem('ah_token_' + code), name:nameFor('Jugador 2') });
}
ui.create.addEventListener('click', createFromInput);
ui.join.addEventListener('click', joinFromInput);

function handleMessage(msg) {
  if (msg.type === 'error') { showError(msg.message || 'Ha ocurrido un error.'); return; }
  if (msg.type === 'joined') {
    app.room = msg.code; app.seat = msg.seat; app.token = msg.token;
    app.state = null; app.oldPhase = null; app.lastGoalBy = null; app.trail = []; app.puckDraw = null;
    app.input = { x: W/2, y: H - 127 }; app.inputMoved = false;
    storage.setItem('ah_token_' + msg.code, msg.token);
    const url = new URL(location.href); url.searchParams.set('sala', msg.code); history.replaceState(null,'',url);
    ui.home.classList.add('hidden'); ui.game.classList.remove('hidden');
    ui.toolbarCode.textContent = msg.code;
    ui.inviteCode.textContent = msg.code;
    ui.gameOverlay.classList.remove('hidden');
    ui.hint.textContent = 'Desliza el dedo en tu mitad para mover tu paleta.';
    resizeCanvas();
  }
  if (msg.type === 'state' && app.room) {
    const prev = app.state;
    app.state = msg;
    app.lastStateAt = performance.now();
    if (prev && prev.phase !== msg.phase) {
      if (msg.phase === 'goal') {
        if (msg.goalBy === app.seat) sound('goal'); else sound('lost');
        if (navigator.vibrate) navigator.vibrate(msg.goalBy === app.seat ? [55,35,80] : [140]);
      } else if (msg.phase === 'playing') sound('start');
      else if (msg.phase === 'gameover') sound(msg.winner === app.seat ? 'win' : 'lost');
    }
    updateUI();
  }
}
function updateUI() {
  const s = app.state;
  if (!s) return;
  const mine = app.seat, other = 1 - mine;
  ui.myScore.textContent = s.scores[mine]; ui.opScore.textContent = s.scores[other];
  ui.myName.textContent = s.players[mine]?.name || 'TÚ';
  ui.opName.textContent = s.players[other]?.name || 'RIVAL';
  const show = s.phase !== 'playing';
  ui.gameOverlay.classList.toggle('hidden', !show);
  ui.gameOverlay.classList.toggle('transparent', ['countdown','goal'].includes(s.phase));
  ui.invite.classList.toggle('hidden', s.phase !== 'waiting' && s.phase !== 'paused');
  ui.rematch.classList.toggle('hidden', s.phase !== 'gameover');
  const seconds = Math.max(1, Math.ceil((s.phaseEnd - (s.serverNow + (performance.now()-app.lastStateAt))) / 1000));
  if (s.phase === 'waiting') {
    ui.overlayIcon.textContent = '⌁';
    ui.overlayTitle.textContent = 'ESPERANDO RIVAL';
    ui.overlayDesc.textContent = 'Comparte el enlace con tu pareja para comenzar automáticamente.';
  } else if (s.phase === 'paused') {
    ui.overlayIcon.textContent = '◌';
    ui.overlayTitle.textContent = 'PARTIDA EN PAUSA';
    ui.overlayDesc.textContent = (s.pauseMessage || 'Se perdió la conexión') + '. Esperando reconexión...';
  } else if (s.phase === 'countdown') {
    ui.overlayIcon.textContent = '';
    ui.overlayTitle.textContent = String(seconds);
    ui.overlayDesc.textContent = '¡PREPÁRATE!';
  } else if (s.phase === 'goal') {
    ui.overlayIcon.textContent = '';
    ui.overlayTitle.textContent = s.goalBy === app.seat ? '¡GOOOOL!' : '¡GOL RIVAL!';
    ui.overlayTitle.style.color = s.goalBy === app.seat ? '#51e5ff' : '#ff65b9';
    ui.overlayDesc.textContent = '¡La siguiente jugada está por comenzar!';
  } else if (s.phase === 'gameover') {
    ui.overlayIcon.textContent = s.winner === app.seat ? '★' : '⚡';
    ui.overlayTitle.textContent = s.winner === app.seat ? '¡GANASTE!' : '¡BUEN DUELO!';
    ui.overlayTitle.style.color = s.winner === app.seat ? '#51e5ff' : '#ff9cb6';
    ui.overlayDesc.textContent = s.winner === app.seat ? '¡Eres la leyenda del Air Hockey!' : 'Esta vez ganó tu rival. ¿Pides revancha?';
  }
  if (!['goal','gameover'].includes(s.phase)) ui.overlayTitle.style.color = '';
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
  app.pending = null; app.touchId = null;
  oldWs?.close();
  const url = new URL(location.href); url.searchParams.delete('sala'); history.replaceState(null,'',url);
  ui.game.classList.add('hidden'); ui.home.classList.remove('hidden');
  ui.error.textContent = ''; connect();
});
ui.sound.addEventListener('click', () => {
  app.audioEnabled = !app.audioEnabled;
  ui.sound.textContent = app.audioEnabled ? '♫' : '♩';
  ui.sound.style.color = app.audioEnabled ? '#b9cae3' : '#6c788f';
  if (app.audioEnabled) unlockAudio();
});
ui.fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen?.();
  } catch {}
});

function unlockAudio() {
  if (!app.audioEnabled) return;
  try { app.audio ??= new (window.AudioContext || window.webkitAudioContext)(); if (app.audio.state === 'suspended') app.audio.resume(); } catch {}
}
function sound(type) {
  if (!app.audioEnabled || !app.audio) return;
  const a = app.audio, now = a.currentTime;
  const notes = type === 'goal' ? [550,790,1040] : type === 'win' ? [520,660,800,1040] : type === 'lost' ? [430,315] : [380,510];
  notes.forEach((f, index) => {
    const start = now + index * .09;
    const oscillator = a.createOscillator(), vol = a.createGain();
    oscillator.type = type === 'lost' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(f, start);
    vol.gain.setValueAtTime(0.0001,start);
    vol.gain.exponentialRampToValueAtTime(.07,start+.012);
    vol.gain.exponentialRampToValueAtTime(.0001,start+.13);
    oscillator.connect(vol); vol.connect(a.destination);
    oscillator.start(start); oscillator.stop(start+.14);
  });
}

function pointerPosition(e) {
  const rect = ui.arena.getBoundingClientRect();
  return {
    x: Math.min(W - PADDLE_R-5, Math.max(PADDLE_R+5,(e.clientX - rect.left)/rect.width*W)),
    y: Math.min(H-PADDLE_R-20, Math.max(H/2+PADDLE_R+5,(e.clientY - rect.top)/rect.height*H))
  };
}
function moveInput(e, force=false) {
  if (!app.room || !app.state || !['playing','countdown'].includes(app.state.phase)) return;
  const p = pointerPosition(e); app.input = p; app.inputMoved = true;
  const now = performance.now();
  if (force || now - app.sendAt >= 24) { send({type:'move',x:p.x,y:p.y}); app.sendAt = now; }
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
  moveInput(e,true); app.touchId = null;
}
ui.arena.addEventListener('pointerup',releasePointer);
ui.arena.addEventListener('pointercancel', releasePointer);
// Control opcional desde un ordenador: WASD o flechas.
const keys = new Set();
window.addEventListener('keydown', e => {
  if (document.activeElement?.tagName === 'INPUT') return;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS','KeyA','KeyD'].includes(e.code)) {keys.add(e.code); e.preventDefault();}
});
window.addEventListener('keyup', e => keys.delete(e.code));

function resizeCanvas() {
  const rect = ui.arena.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(devicePixelRatio || 1, 2.5);
  ui.arena.width = Math.max(1,Math.round(rect.width*ratio));
  ui.arena.height = Math.max(1,Math.round(rect.height*ratio));
}
new ResizeObserver(resizeCanvas).observe(ui.arena);
const orient = p => app.seat === 1 ? { x: W-p.x, y: H-p.y } : {x:p.x,y:p.y};
function roundRect(x,y,w,h,r) {
  const rad = Math.min(r,w/2,h/2);
  ctx.beginPath();ctx.moveTo(x+rad,y);ctx.arcTo(x+w,y,x+w,y+h,rad);ctx.arcTo(x+w,y+h,x,y+h,rad);ctx.arcTo(x,y+h,x,y,rad);ctx.arcTo(x,y,x+w,y,rad);ctx.closePath();
}
function drawArena(t) {
  const base = ctx.createLinearGradient(0,0,W,H);base.addColorStop(0,'#102d4b');base.addColorStop(.5,'#0b1b37');base.addColorStop(1,'#071b30');
  ctx.fillStyle=base;ctx.fillRect(0,0,W,H);
  // Pista geométrica y reflejos.
  ctx.strokeStyle='rgba(107,190,231,.075)';ctx.lineWidth=1;
  for(let x=0;x<=W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  const top=ctx.createRadialGradient(W/2,-60,10,W/2,20,440);
  top.addColorStop(0,'rgba(254,83,162,.17)');top.addColorStop(1,'rgba(254,83,162,0)');
  ctx.fillStyle=top;ctx.fillRect(0,0,W,H/2);
  const bottom=ctx.createRadialGradient(W/2,H+60,10,W/2,H-20,440);
  bottom.addColorStop(0,'rgba(48,230,255,.15)');bottom.addColorStop(1,'rgba(48,230,255,0)');
  ctx.fillStyle=bottom;ctx.fillRect(0,H/2,W,H/2);
  ctx.shadowBlur=0;
  // Carriles laterales iluminados.
  ctx.lineWidth=8;ctx.strokeStyle='#395a7a';ctx.strokeRect(4,4,W-8,H-8);
  ctx.strokeStyle='rgba(94,166,212,.35)';ctx.lineWidth=2;ctx.strokeRect(13,13,W-26,H-26);
  ctx.strokeStyle='#81c7ef44';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(13,H/2);ctx.lineTo(W-13,H/2);ctx.stroke();
  ctx.beginPath();ctx.arc(W/2,H/2,93,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.arc(W/2,H/2,21,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#ff65b95a';ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(W/2,0,136,0,Math.PI);ctx.stroke();
  ctx.strokeStyle='#51e5ff65';ctx.beginPath();ctx.arc(W/2,H,136,Math.PI,2*Math.PI);ctx.stroke();
  // Portería superior e inferior.
  ctx.fillStyle='#ff57b125';ctx.fillRect(W/2-96,5,192,23);
  ctx.fillStyle='#51e5ff27';ctx.fillRect(W/2-96,H-28,192,23);
  ctx.shadowBlur=19;ctx.lineWidth=8;
  ctx.strokeStyle='#ff65b9';ctx.shadowColor='#ff65b9';ctx.beginPath();ctx.moveTo(W/2-94,7);ctx.lineTo(W/2+94,7);ctx.stroke();
  ctx.strokeStyle='#51e5ff';ctx.shadowColor='#51e5ff';ctx.beginPath();ctx.moveTo(W/2-94,H-7);ctx.lineTo(W/2+94,H-7);ctx.stroke();
  ctx.shadowBlur=0;
  ctx.font='900 27px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='rgba(255,118,184,.13)';ctx.save();ctx.translate(W/2,95);ctx.rotate(Math.PI);ctx.fillText('RIVAL',0,0);ctx.restore();
  ctx.fillStyle='rgba(86,229,255,.15)';ctx.fillText('TU ZONA',W/2,H-94);
  // Pequeñas flechas hacia la portería contraria.
  ctx.fillStyle='rgba(164,202,238,.14)';ctx.font='40px sans-serif';ctx.fillText('⌃',W/2,350);
  ctx.fillText('⌄',W/2,550);
  const glint = .5 + Math.sin(t/750)*.15;
  ctx.fillStyle=`rgba(92,220,251,${glint*.1})`;roundRect(22,H/2+18,4,110,2);ctx.fill();
}
function drawPaddle(p, ours) {
  const color = ours ? '#51e5ff' : '#ff65b9';
  ctx.save();ctx.translate(p.x,p.y);
  ctx.shadowColor=color;ctx.shadowBlur=24;
  ctx.fillStyle=ours?'#22acd7':'#b82a76';ctx.beginPath();ctx.arc(0,0,PADDLE_R,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;
  ctx.strokeStyle=ours?'#8cf1ff':'#ffaad8';ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,PADDLE_R-4,0,Math.PI*2);ctx.stroke();
  const g=ctx.createRadialGradient(-12,-14,1,0,0,PADDLE_R);
  if(ours){g.addColorStop(0,'#c4ffff');g.addColorStop(.25,'#5cdaf4');g.addColorStop(.65,'#167cae');g.addColorStop(1,'#073152');}
  else{g.addColorStop(0,'#ffd4ed');g.addColorStop(.25,'#ff79b8');g.addColorStop(.65,'#a32873');g.addColorStop(1,'#48143f');}
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,PADDLE_R-11,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ffffff3a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(-7,-7,13,Math.PI,Math.PI*1.6);ctx.stroke();
  ctx.restore();
}
function drawPuck(p) {
  const trail=app.trail;
  if (!trail.length || Math.hypot(trail[trail.length-1].x-p.x,trail[trail.length-1].y-p.y)>400) trail.length=0;
  if (!trail.length || Math.hypot(trail[trail.length-1].x-p.x,trail[trail.length-1].y-p.y)>5) trail.push({...p});
  if (trail.length>13) trail.shift();
  for(let i=0;i<trail.length;i++) {
    const point=trail[i], alpha=(i/trail.length)*.19;
    ctx.fillStyle=`rgba(149,224,252,${alpha})`;
    ctx.beginPath();ctx.arc(point.x,point.y,PUCK_R*(.55+i/trail.length*.3),0,Math.PI*2);ctx.fill();
  }
  ctx.save();ctx.translate(p.x,p.y);ctx.shadowColor='#dbf4ff';ctx.shadowBlur=21;
  ctx.fillStyle='#dce9f4';ctx.beginPath();ctx.arc(0,0,PUCK_R,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#253952';ctx.beginPath();ctx.arc(0,0,PUCK_R-5,0,Math.PI*2);ctx.fill();
  const g=ctx.createRadialGradient(-5,-6,0,0,0,PUCK_R-7);g.addColorStop(0,'#ffffff');g.addColorStop(.5,'#bfd8ea');g.addColorStop(1,'#5f88ac');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,PUCK_R-8,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function draw(t) {
  const dt=Math.min(.05,(t-app.lastFrame)/1000);app.lastFrame=t;
  if (ui.game.classList.contains('hidden')) {requestAnimationFrame(draw);return;}
  ctx.setTransform(ui.arena.width/W,0,0,ui.arena.height/H,0,0);
  ctx.clearRect(0,0,W,H);
  drawArena(t);
  const s=app.state;
  if (s) {
    if (keys.size && ['playing','countdown'].includes(s.phase)) {
      let dx=0,dy=0;
      if(keys.has('ArrowLeft')||keys.has('KeyA'))dx--;
      if(keys.has('ArrowRight')||keys.has('KeyD'))dx++;
      if(keys.has('ArrowUp')||keys.has('KeyW'))dy--;
      if(keys.has('ArrowDown')||keys.has('KeyS'))dy++;
      app.input.x=Math.max(42,Math.min(W-42,app.input.x+dx*900*dt));
      app.input.y=Math.max(H/2+42,Math.min(H-57,app.input.y+dy*900*dt));
      app.inputMoved=true;
      if(t-app.sendAt>24){send({type:'move',...app.input});app.sendAt=t;}
    }
    let puck=orient(s.puck);
    const since = Math.min(performance.now()-app.lastStateAt,55);
    if(s.phase==='playing'){
      const vx=app.seat===1?-s.puck.vx:s.puck.vx;
      const vy=app.seat===1?-s.puck.vy:s.puck.vy;
      puck.x=Math.max(PUCK_R,Math.min(W-PUCK_R,puck.x+vx*since/1000));
      puck.y=Math.max(PUCK_R,Math.min(H-PUCK_R,puck.y+vy*since/1000));
    }
    if(!app.puckDraw || Math.hypot(app.puckDraw.x-puck.x,app.puckDraw.y-puck.y)>220)app.puckDraw={...puck};
    else{const ease=Math.min(1,dt*25);app.puckDraw.x+=(puck.x-app.puckDraw.x)*ease;app.puckDraw.y+=(puck.y-app.puckDraw.y)*ease;}
    const enemy=orient(s.paddles[1-app.seat]);
    const self=app.inputMoved ? app.input : orient(s.paddles[app.seat]);
    drawPaddle(enemy,false);
    drawPuck(app.puckDraw);
    drawPaddle(self,true);
  } else {
    drawPaddle({x:W/2,y:127},false);
    drawPuck({x:W/2,y:H/2});
    drawPaddle({x:W/2,y:H-127},true);
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
connect();
