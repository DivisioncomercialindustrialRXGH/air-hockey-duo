import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLocalDuel,tickLocalDuel,setDuelInput,resetLocalDuel,rematchLocalDuel} from '../public/local-duel.js';
import {encodeSignal,decodeSignal} from '../public/peer-direct.js';
import {qrSvg} from '../public/qr-local.js';
import {MAX_PUCK_SPEED,boundsForPaddle} from '../src/physics.js';

test('one-phone duel is created offline with two human paddles and identical physics engine',()=>{
 const s=createLocalDuel({powers:true,timeLimit:120,puckSize:'L'},'Azul','Rosa',1000);
 assert.equal(s.room.players.length,2);assert.equal(s.room.players[0].bot,false);assert.equal(s.room.players[1].bot,false);
 assert.equal(s.room.phase,'countdown');assert.equal(s.room.settings.mode,'duel');
 const p=readFileSync(new URL('../public/engine/physics.js',import.meta.url));
 assert.deepEqual(p,readFileSync(new URL('../src/physics.js',import.meta.url)));
});
test('two simultaneous independent inputs move both paddles without crossing center',()=>{
 const s=createLocalDuel({powers:true,timeLimit:0},'Azul','Rosa',1000);s.room.phase='playing';
 let state;
 for(let i=0;i<300;i++){
   state=tickLocalDuel(s,i*1000/60,[{x:100+Math.sin(i/17)*55,y:620},{x:400-Math.sin(i/17)*55,y:280}]);
   for(let j=0;j<2;j++){
     const pad=s.room.paddles[j],b=boundsForPaddle(s.room,j);
     assert.ok(pad.x>=b.minX-.001&&pad.x<=b.maxX+.001);
     assert.ok(pad.y>=b.minY-.001&&pad.y<=b.maxY+.001);
   }
 }
 assert.ok(s.room.paddles[0].x<220&&s.room.paddles[1].x>280);
 assert.ok(Math.hypot(state.puck.vx,state.puck.vy)<=MAX_PUCK_SPEED+1);
});
test('p2p host accepts authenticated remote movement only into pink side bounds',()=>{
 const s=createLocalDuel({powers:false},'Host','Guest');
 setDuelInput(s,1,{x:250,y:850});
 const b=boundsForPaddle(s.room,1);
 assert.ok(s.room.paddles[1].ty<=b.maxY);
 setDuelInput(s,0,{x:400,y:0});
 assert.ok(s.room.paddles[0].ty>=boundsForPaddle(s.room,0).minY);
});
test('same-screen goal, reset, cooldown and rematch preserve scoreboard and phase',()=>{
 const s=createLocalDuel({powers:true,maxScore:3},'Uno','Dos');
 s.room.phase='playing';s.now+=20000;
 assert.equal(resetLocalDuel(s),null);assert.match(resetLocalDuel(s),/volver a recentrar/);
 s.room.phase='gameover';s.room.scores=[3,2];s.room.winner=0;
 assert.equal(rematchLocalDuel(s),true);assert.deepEqual(s.room.scores,[0,0]);assert.equal(s.room.phase,'countdown');
});
test('offline manual WebRTC signaling roundtrips SDP with compression, size validation',async()=>{
 const sdp='v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=mid:0\r\n';
 for(const type of ['offer','answer']){
   const encoded=await encodeSignal({type,sdp});
   assert.match(encoded,/^AH54\.[GN]\./);assert.deepEqual(await decodeSignal(encoded),{type,sdp});
   await assert.rejects(()=>decodeSignal(encoded.slice(0,-4)+'bad!'),/código|invalid/i);
 }
});
test('bundled QR encoder renders correct self-contained SVG without a CDN',()=>{
 const svg=qrSvg('https://hockey.local/#invite=test');
 assert.match(svg,/^<svg .*<rect/);assert.match(svg,/viewBox="0 0/);
 assert.ok((svg.match(/<rect/g)||[]).length>70);
});
test('UI offers direct, same-screen and online without removing LAN modes',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/game.js',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 for(const x of ['choose-direct','choose-screen','direct-setup','direct-host','direct-guest','direct-remote','direct-complete'])assert.ok(html.includes(`id="${x}"`));
 for(const x of ['startSameScreen','startDirectHost','setDuelInput','moveUpperInput','app.topTouchId','directPeer'])assert.ok(js.includes(x));
 for(const file of ['/local-duel.js?v=5.5.2-local.1','/peer-direct.js?v=5.5.2-local.1','/qr-local.js?v=5.4.0-direct.1'])assert.ok(sw.includes(file));
});

test('WebRTC manual invite-answer exchanges state through a simulated direct DataChannel',async()=>{
  const {directPeer}=await import('../public/peer-direct.js');
  class FakeChannel{
    constructor(){this.readyState='connecting';this.bufferedAmount=0;}
    send(data){this.partner?.onmessage?.({data});}
    close(){this.readyState='closed';this.onclose?.();}
    open(){this.readyState='open';this.onopen?.();}
  }
  const created=[];
  class FakePeerConnection{
    constructor(config){assert.deepEqual(config.iceServers,[]);this.iceGatheringState='complete';this.signalingState='stable';this.connectionState='new';created.push(this);}
    createDataChannel(){const a=new FakeChannel(),b=new FakeChannel();a.partner=b;b.partner=a;this.dataChannel=a;this.otherChannel=b;return a;}
    async createOffer(){return {type:'offer',sdp:'v=0\r\na=candidate:1 1 udp 123 192.168.1.21 5000 typ host\r\n'};}
    async createAnswer(){return {type:'answer',sdp:'v=0\r\na=candidate:1 1 udp 123 192.168.1.22 5001 typ host\r\n'};}
    async setLocalDescription(desc){this.localDescription=desc;this.signalingState=desc.type==='offer'?'have-local-offer':'stable';}
    async setRemoteDescription(desc){
      this.remoteDescription=desc;this.signalingState=desc.type==='answer'?'stable':'have-remote-offer';
      if(desc.type==='offer')this.ondatachannel?.({channel:created[0].otherChannel});
      if(desc.type==='answer')queueMicrotask(()=>{created[0].dataChannel.open();created[0].otherChannel.open();});
    }
    close(){this.connectionState='closed';}
  }
  const original=globalThis.RTCPeerConnection;globalThis.RTCPeerConnection=FakePeerConnection;
  try{
    let opened=0,received;
    const host=directPeer({onOpen:()=>opened++});
    const guest=directPeer({onOpen:()=>opened++,onMessage:msg=>received=msg});
    const offer=await host.offer();const answer=await guest.answer(offer);
    // The same answer can arrive over several Safari signaling routes at once.
    await Promise.all([host.complete(answer),host.complete(answer)]);
    await host.complete(answer);
    assert.equal(created[0].remoteDescription.type,'answer');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(opened,2);assert.equal(host.connected,true);assert.equal(guest.connected,true);
    assert.equal(host.send({type:'state',puck:{x:250,y:450}}),true);
    assert.deepEqual(received,{type:'state',puck:{x:250,y:450}});
    host.close();guest.close();
  }finally{globalThis.RTCPeerConnection=original;}
});
