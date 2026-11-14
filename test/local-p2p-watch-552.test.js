import test from 'node:test';
import assert from 'node:assert/strict';
import {directPeer,encodeSignal} from '../public/peer-direct.js';
test('ICE-checking timeout reports a blocked local route instead of hanging forever',async()=>{
 const old=globalThis.RTCPeerConnection;
 class MockPeer{
  constructor(){this.signalingState='have-local-offer';this.iceGatheringState='complete';this.iceConnectionState='checking';this.connectionState='connecting';}
  async setRemoteDescription(sdp){this.remoteDescription=sdp;this.signalingState='stable';}
  close(){this.closed=true;}
 }
 globalThis.RTCPeerConnection=MockPeer;
 const statuses=[];
 try{
  const link=directPeer({connectionTimeoutMs:10,onStatus:s=>statuses.push(s)});
  const sdp='v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=candidate:1 1 udp 123 192.168.1.10 3000 typ host\r\n';
  await link.complete(await encodeSignal({type:'answer',sdp}));
  await new Promise(done=>setTimeout(done,32));
  assert.ok(statuses.some(s=>s.includes('No se pudo establecer una ruta Wi-Fi directa')),statuses.join('|'));
  link.close();
 }finally{globalThis.RTCPeerConnection=old;}
});
