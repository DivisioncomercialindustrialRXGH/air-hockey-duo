/** WebRTC manual offline signaling. No STUN, TURN, signaling server or third-party CDN.
 * Works on a LAN when both browsers expose mutually reachable host ICE candidates.
 * Browsers may restrict mDNS/firewall; never promise universal phone compatibility.
 */
const PREFIX='AH54';
const MAX_SIGNAL=30000;

function bytesToB64(bytes){
  let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64ToBytes(text){
  const raw=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function gzip(bytes){
  if(typeof CompressionStream==='undefined')return bytes;
  const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes){
  if(typeof DecompressionStream==='undefined')throw Error('Este navegador no admite descompresión de invitaciones.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function encodeSignal(description){
  if(!['offer','answer'].includes(description?.type)||typeof description.sdp!=='string')throw Error('Señal WebRTC inválida');
  const data=new TextEncoder().encode(JSON.stringify({v:1,type:description.type,sdp:description.sdp}));
  const compressed=await gzip(data);
  return `${PREFIX}.${compressed===data?'N':'G'}.${bytesToB64(compressed)}`;
}
export async function decodeSignal(signal){
  const value=String(signal||'').trim();
  if(value.length>MAX_SIGNAL)throw Error('El código de conexión es demasiado largo.');
  const m=value.match(/^AH54\.(G|N)\.([\w-]+)$/);
  if(!m)throw Error('Código inválido: se esperaba una invitación AH54.');
  const bytes=b64ToBytes(m[2]);
  const payload=m[1]==='G'?await gunzip(bytes):bytes;
  const parsed=JSON.parse(new TextDecoder().decode(payload));
  if(parsed?.v!==1||!['offer','answer'].includes(parsed.type)||typeof parsed.sdp!=='string'||parsed.sdp.length>15000||!parsed.sdp.includes('v=0'))throw Error('Invitación WebRTC incompatible.');
  return {type:parsed.type,sdp:parsed.sdp};
}
async function iceDone(peer,timeout=12000){
  if(peer.iceGatheringState==='complete')return;
  await new Promise(resolve=>{
    let done=false;let timeoutId;
    const finish=()=>{if(done)return;done=true;peer.removeEventListener('icegatheringstatechange',listener);clearTimeout(timeoutId);resolve();};
    const listener=()=>{if(peer.iceGatheringState==='complete')finish();};
    peer.addEventListener('icegatheringstatechange',listener);
    timeoutId=setTimeout(finish,timeout);
  });
}
export function directPeer({onOpen=()=>{},onMessage=()=>{},onClose=()=>{},onStatus=()=>{},connectionTimeoutMs=25000}={}){
  if(!globalThis.RTCPeerConnection)throw Error('Este navegador no permite WebRTC. Prueba Safari o Chrome actualizado.');
  const peer=new RTCPeerConnection({iceServers:[],iceTransportPolicy:'all'});
  let channel=null,closed=false,completing=null,answerApplied=null,watchTimer=null,signalingRole=null;
  const WIFI_ERROR='No se pudo establecer una ruta Wi-Fi directa entre los teléfonos. Ambos deben estar en la misma red Wi-Fi privada, sin VPN, Private Relay ni aislamiento de clientes. Si la red bloquea WebRTC, usa LAN con computadora.';
  function clearWatch(){if(watchTimer!==null){clearTimeout(watchTimer);watchTimer=null;}}
  function failRoute(){
    if(closed||channel?.readyState==='open')return;
    clearWatch();closed=true;channel?.close();peer.close();
    onStatus('⚠️ '+WIFI_ERROR);
  }
  function watchConnection(){
    if(closed||channel?.readyState==='open'||watchTimer!==null)return;
    // Guest has to transfer the QR manually: allow enough time for that step.
    const maxWait=signalingRole==='guest'?180000:connectionTimeoutMs;
    watchTimer=setTimeout(()=>{watchTimer=null;failRoute();},maxWait);
  }
  function attach(c){
    channel=c;
    c.onopen=()=>{clearWatch();onStatus('Conectado directamente · sin servidor');onOpen();};
    c.onclose=()=>{if(!closed){onStatus('Conexión local cerrada');onClose();}};
    c.onerror=()=>onStatus('Problema en el canal local');
    c.onmessage=ev=>{
      if(typeof ev.data!=='string'||ev.data.length>32000)return;
      try{onMessage(JSON.parse(ev.data));}catch{}
    };
  }
  peer.onconnectionstatechange=()=>{
    const state=peer.connectionState;
    if(state==='failed')failRoute();
    else if(state==='disconnected'&&!closed){onStatus('Enlace Wi-Fi interrumpido. Comprueba la red local.');onClose();}
    // Keep the watchdog active until DataChannel.onopen actually fires.
  };
  peer.oniceconnectionstatechange=()=>{
    if(peer.iceConnectionState==='failed')failRoute();
    else if(peer.iceConnectionState==='checking'){watchConnection();onStatus('Verificando conexión Wi-Fi local entre ambos teléfonos…');}
  };
  peer.ondatachannel=e=>attach(e.channel);
  return {
    get connected(){return channel?.readyState==='open';},
    get bufferedAmount(){return channel?.bufferedAmount??0;},
    send(message){
      if(channel?.readyState!=='open')return false;
      const data=JSON.stringify(message);
      if(data.length>26000||channel.bufferedAmount>45000)return false;
      channel.send(data);return true;
    },
    async offer(){
      signalingRole='host';
      const ch=peer.createDataChannel('hockey',{ordered:true});attach(ch);
      await peer.setLocalDescription(await peer.createOffer());
      await iceDone(peer);
      if(!/a=candidate:/m.test(peer.localDescription?.sdp||''))throw Error('Este dispositivo no encontró una ruta Wi-Fi local. Comprueba permisos de red local, desactiva VPN y vuelve a intentarlo.');
      onStatus('Invitación lista · compártela con el otro celular');
      return encodeSignal(peer.localDescription);
    },
    async answer(offerText){
      signalingRole='guest';
      const offer=await decodeSignal(offerText);
      if(offer.type!=='offer')throw Error('Necesitas la invitación del anfitrión.');
      await peer.setRemoteDescription(offer);
      await peer.setLocalDescription(await peer.createAnswer());
      await iceDone(peer);
      if(!/a=candidate:/m.test(peer.localDescription?.sdp||''))throw Error('El otro teléfono no tiene acceso a la red local. Revisa el Wi-Fi o los permisos y vuelve a intentarlo.');
      onStatus('Respuesta lista · devuélvela al anfitrión');
      return encodeSignal(peer.localDescription);
    },
    async complete(answerText){
      if(closed)throw Error('Este intento de conexión ya terminó. Crea una nueva invitación.');
      const answer=await decodeSignal(answerText);
      if(answer.type!=='answer')throw Error('Necesitas una respuesta, no otra invitación.');
      if(answerApplied){
        if(answerApplied===answer.sdp){onStatus('Respuesta ya recibida; conectando teléfonos…');return;}
        throw Error('Esta invitación ya recibió una respuesta diferente. Crea una nueva partida.');
      }
      // Safari may deliver the same QR response by focus + BroadcastChannel + button.
      // Only one setRemoteDescription(answer) may be in flight.
      if(completing)return completing;
      if(peer.signalingState!=='have-local-offer'){
        throw Error('La invitación ya no está activa. Crea una nueva invitación y prueba otra vez.');
      }
      completing=(async()=>{
        await peer.setRemoteDescription(answer);
        answerApplied=answer.sdp;
        watchConnection();
        onStatus('Conectando directamente los dos teléfonos…');
      })();
      try{await completing;}finally{completing=null;}
    },
    close(){closed=true;clearWatch();channel?.close();peer.close();}
  };
}
