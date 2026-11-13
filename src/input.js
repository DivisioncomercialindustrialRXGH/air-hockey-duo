// Transport evidence is ephemeral and per socket, never persisted with rooms.
const peers=new WeakMap();
function peer(ws){let p=peers.get(ws);if(!p){p={seq:0,frames:[]};peers.set(ws,p);}return p;}
export function trackSnapshot(ws,seq,serverNow,now){
  const p=peer(ws);p.frames.push({seq,serverNow,sentAt:now});
  if(p.frames.length>32)p.frames.shift();
}
export function acceptMove(ws,msg,now,maxRewindMs=360){
  const p=peer(ws);
  if(msg.seq!==undefined){
    if(!Number.isSafeInteger(msg.seq)||msg.seq<=p.seq)return null;
    p.seq=msg.seq;
  }
  let vt=null;
  const f=p.frames.find(f=>f.seq===msg.ack);
  // An untrusted timestamp is a claim, never a clock measurement. Require an
  // issued frame, increasing command sequence and a bounded plausible view.
  if(Number.isSafeInteger(msg.seq)&&f&&Number.isFinite(msg.vt)&&now-f.sentAt<=500&&
    msg.vt>=f.serverNow-220&&msg.vt<=f.serverNow+50&&
    now-msg.vt>=0&&now-msg.vt<=maxRewindMs&&
    (p.lastVt===undefined||msg.vt>=p.lastVt)){
    vt=msg.vt;p.lastVt=vt;
  }
  return {seq:msg.seq??0,vt};
}
