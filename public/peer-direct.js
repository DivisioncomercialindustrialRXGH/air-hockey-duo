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
export function directPeer({onOpen=()=>{},onMessage=()=>{},onClose=()=>{},onStatus=()=>{}}={}){
  if(!globalThis.RTCPeerConnection)throw Error('Este navegador no permite WebRTC. Prueba Safari o Chrome actualizado.');
  const peer=new RTCPeerConnection({iceServers:[],iceTransportPolicy:'all'});
  let channel=null,closed=false;
  function attach(c){
    channel=c;
    c.onopen=()=>{onStatus('Conectado directamente · sin servidor');onOpen();};
    c.onclose=()=>{if(!closed){onStatus('Conexión local cerrada');onClose();}};
    c.onerror=()=>onStatus('Problema en el canal local');
    c.onmessage=ev=>{
      if(typeof ev.data!=='string'||ev.data.length>32000)return;
      try{onMessage(JSON.parse(ev.data));}catch{}
    };
  }
  peer.onconnectionstatechange=()=>{
    const state=peer.connectionState;
    if(state==='failed'||state==='disconnected'){onStatus('No se conectaron. Comprueba el mismo Wi-Fi y reinicia el emparejamiento.');onClose();}
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
      const ch=peer.createDataChannel('hockey',{ordered:true});attach(ch);
      await peer.setLocalDescription(await peer.createOffer());
      await iceDone(peer);
      if(!/a=candidate:/m.test(peer.localDescription?.sdp||''))throw Error('Este dispositivo no encontró una ruta Wi-Fi local. Comprueba permisos de red local, desactiva VPN y vuelve a intentarlo.');
      onStatus('Invitación lista · compártela con el otro celular');
      return encodeSignal(peer.localDescription);
    },
    async answer(offerText){
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
      const answer=await decodeSignal(answerText);
      if(answer.type!=='answer')throw Error('Necesitas una respuesta, no otra invitación.');
      await peer.setRemoteDescription(answer);
      onStatus('Conectando directamente los dos teléfonos…');
    },
    close(){closed=true;channel?.close();peer.close();}
  };
}
