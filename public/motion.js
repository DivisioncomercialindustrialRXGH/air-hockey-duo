/** Visual timelines only. Cloudflare remains authoritative for collision physics. */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

/** Convert server timestamps to a stable local playout clock (5.0.3).
 *
 * sample = arrival - serverNow = one-way latency + clock offset (unknown, but
 * constant). 5.0.2 anchored the whole timeline on the FIRST packet: if that one
 * was slow, the game stayed late forever; if latency later rose (Wi-Fi to 4G),
 * every snapshot arrived after it was needed and the puck was extrapolated and
 * then corrected (visible jumps). Now:
 *   base     = low envelope of sample (fastest recent packets), slewed slowly;
 *   lateness = sample - base  (>= 0, the real jitter, incl. TCP bursts);
 *   delayMs  = p90(lateness over ~3 s) + half a snapshot interval + 3 ms. Rarely
 *              late frames are covered by a short, wall-aware extrapolation.
 * delayMs moves at most +4 / -0.6 ms per snapshot: no visible time warps.
 */
export const PLAYOUT = Object.freeze({minMs:24, maxMs:170, window:90, defaultMs:60, pct:.9, intervalFactor:.5, marginMs:3});
export function serverFrameTime(clock, serverNow, arrival){
  if(!Number.isFinite(serverNow)) return {at:arrival, reset:false};
  const sample=arrival-serverNow;
  if(!Number.isFinite(clock.base) || Math.abs(sample-clock.base)>1800){
    const reset=Number.isFinite(clock.base);
    clock.base=sample;clock.late=[];clock.lastServer=serverNow;clock.interval=33;
    delete clock.cursor;delete clock.cursorAt;
    clock.delayMs=clock.delayMs??PLAYOUT.defaultMs;clock.jitter=0;
    return {at:serverNow+clock.base,reset};
  }
  // Fast packets lower the base immediately but by small steps; drift up slowly
  // (covers clock-rate drift and a permanently slower route).
  if(sample<clock.base)clock.base=Math.max(sample,clock.base-2);
  else clock.base+=Math.min(sample-clock.base,.02);
  const gap=serverNow-(clock.lastServer??serverNow);
  if(gap>5&&gap<200)clock.interval=clock.interval*.9+gap*.1;
  clock.lastServer=Math.max(clock.lastServer??serverNow,serverNow);
  const late=Math.max(0,sample-clock.base);
  clock.late.push(late);
  if(clock.late.length>PLAYOUT.window)clock.late.shift();
  const cfg=clock.cfg?{...PLAYOUT,...clock.cfg}:PLAYOUT;
  const sorted=[...clock.late].sort((a,b)=>a-b);
  const p95=sorted[Math.floor(cfg.pct*(sorted.length-1))];
  clock.jitter=sorted[Math.floor(.5*(sorted.length-1))]; // median lateness, for UI/diagnostics
  // Never below ~one snapshot interval: below that the puck is extrapolated most of the time.
  const target=clamp(p95+clock.interval*cfg.intervalFactor+cfg.marginMs,Math.max(cfg.minMs,clock.interval+4),cfg.maxMs);
  clock.delayMs=clock.delayMs+clamp(target-clock.delayMs,-.6,4);
  return {at:serverNow+clock.base,reset:false};
}
/** Server time (ms) of what is on screen at local time `local` with `delayMs`. */
export function serverTimeAt(clock, local, delayMs=clock.delayMs){
  if(!Number.isFinite(clock?.base))return undefined;
  return local-(delayMs??PLAYOUT.defaultMs)-clock.base;
}

/** One cursor for every remote object. Packet bursts can increase the buffer
 * several times in one render frame; they must never run the game backwards.
 * Clock slewing changes this cursor, never the timestamps of stored frames. */
export function playoutTime(clock,local){
  const wanted=serverTimeAt(clock,local);
  if(!Number.isFinite(wanted))return undefined;
  if(!Number.isFinite(clock.cursor))clock.cursor=wanted;
  else clock.cursor=Math.max(clock.cursor,Math.min(wanted,clock.cursor+Math.max(0,local-clock.cursorAt)*1.1));
  clock.cursorAt=local;
  return clock.cursor;
}

export function localBounds(state,seat,side=0){
  const mode=state?.settings?.mode,n=mode==='duo'?2:mode==='teams'?4:1;
  const index=mode==='tournament'?state.activeSeats.indexOf(seat):seat;
  const fx=state?.effect,owner=fx?.owner;
  const r=state?.paddles?.[index]?.r??(fx?.type==='giantPaddle'&&owner===index?37*1.42:
    fx?.type==='miniRival'&&((index<n)!==(owner<n))?37*.67:37);
  const lane=n>1?(side===1?n-1-seat%n:seat%n):0;
  const effective=Math.min(r,500/n/2-3);
  return {lo:lane*500/n+effective+2,hi:(lane+1)*500/n-effective-2,minY:450+r+5,maxY:900-r-19,r};
}

export function pushSnapshot(frames, snapshot, capacity=30){
  const previous=frames[frames.length-1];
  if(previous && snapshot.at<=previous.at){
    // More than one state/event notification within a millisecond.
    if(previous.at-snapshot.at<2)frames[frames.length-1]=snapshot;
    return frames;
  }
  frames.push(snapshot);
  if(frames.length>capacity)frames.splice(0,frames.length-capacity);
  return frames;
}

/** Sample snapshots with a fixed playout delay, then bounded extrapolation.
 * Unlike raw arrival-times, these timestamps don't wobble with WebSocket jitter.
 */
export function sampleRemotePose(frames,index,now,opts={}){
  if(!frames?.length)return null;
  const target=now-clamp(opts.delayMs??112,0,220);
  const pose=f=>f?.poses?.[index];
  const first=frames[0],initial=pose(first);
  if(!initial)return null;
  if(target<=first.at)return {...initial};
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i];
    if(target<=b.at){
      const pa=pose(a),pb=pose(b);
      if(!pa||!pb)return {...initial};
      const f=clamp((target-a.at)/Math.max(1,b.at-a.at),0,1);
      return {x:pa.x+(pb.x-pa.x)*f,y:pa.y+(pb.y-pa.y)*f,r:(pa.r??37)+((pb.r??37)-(pa.r??37))*f};
    }
  }
  const newest=frames.at(-1),prev=frames.at(-2),p=pose(newest);
  if(!p)return {...initial};
  const older=pose(prev);
  if(!prev||!older)return {...p};
  const elapsed=clamp((target-newest.at)/1000,0,(opts.maxExtrapolateMs??55)/1000);
  const dt=Math.max(.008,(newest.at-prev.at)/1000);
  const vx=(p.x-older.x)/dt,vy=(p.y-older.y)/dt;
  const factor=Math.min(1,(opts.maxSpeed??1800)/Math.max(.0001,Math.hypot(vx,vy)));
  const b=opts.bounds||{};
  return {r:p.r,x:clamp(p.x+vx*factor*elapsed,b.minX??-Infinity,b.maxX??Infinity),
    y:clamp(p.y+vy*factor*elapsed,b.minY??-Infinity,b.maxY??Infinity)};
}

/** Interpolate the puck, including across *ordinary* hits and wall bounces.
 * Discarding history on each collision caused 100px visual teleportation.
 * Actual score/recenter phases are handled separately in the client.
 */
export function samplePuckPose(frames,now,opts={}){
  if(!frames?.length)return null;
  const target=now-clamp(opts.delayMs??120,0,250);
  if(target<=frames[0].at)return {...frames[0]};
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i];
    if(target<=b.at){
      const elapsed=(target-a.at)/1000, duration=Math.max(.001,(b.at-a.at)/1000);
      const f=clamp(elapsed/duration,0,1);
      // For one high-energy bounce/hit within two authoritative snapshots,
      // the straight chord between endpoints may cut THROUGH the mallet.
      // Infer the contact time from pre/post velocities and the two observed
      // endpoints, but only when the inferred trajectory matches the server.
      const dvx=a.vx-b.vx,dvy=a.vy-b.vy;
      const dv2=dvx*dvx+dvy*dvy;
      if((b.eventKind==='wall'||b.eventKind==='hit') && dv2>90000 && duration<=.12){
        const dx=b.x-a.x-b.vx*duration,dy=b.y-a.y-b.vy*duration;
        const impact=(dx*dvx+dy*dvy)/dv2;
        const contact=clamp(impact,0,duration);
        const endX=a.x+a.vx*contact+b.vx*(duration-contact);
        const endY=a.y+a.vy*contact+b.vy*(duration-contact);
        if(impact>=0 && impact<=duration && Math.hypot(endX-b.x,endY-b.y)<=Math.max(6,duration*90)){
          const before=Math.min(elapsed,contact),after=Math.max(0,elapsed-contact);
          return {at:target,x:a.x+a.vx*before+b.vx*after,
            y:a.y+a.vy*before+b.vy*after,
            vx:elapsed<contact?a.vx:b.vx,vy:elapsed<contact?a.vy:b.vy,
            r:a.r+(b.r-a.r)*f};
        }
      }
      return {at:target,x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,
        vx:a.vx+(b.vx-a.vx)*f,vy:a.vy+(b.vy-a.vy)*f,
        r:a.r+(b.r-a.r)*f};
    }
  }
  const last=frames.at(-1);
  const dt=clamp((target-last.at)/1000,0,(opts.maxExtrapolateMs??105)/1000);
  const r=last.r;
  // Visual prediction may bounce on walls, but NEVER invents paddle hits
  // or a goal. The next authoritative snapshot remains the only truth.
  const bounce=(value,velocity,min,max)=>{
    const span=max-min;
    if(span<=0)return min;
    const raw=((value+velocity*dt-min)%(2*span)+2*span)%(2*span);
    return min+(raw<=span?raw:2*span-raw);
  };
  const x=bounce(last.x,last.vx,r,500-r);
  const estimatedY=last.y+last.vy*dt;
  const goalMouth=last.x>250-94+r+3&&last.x<250+94-r-3;
  const y=goalMouth?clamp(estimatedY,-r*.84,900+r*.84):bounce(last.y,last.vy,r,900-r);
  return {...last,at:last.at+dt*1000,x,y};
}

/** Presentation-only catch-up. Forbids a single-frame visual teleport after
 * network stalls. A real goal/serve is deliberately allowed to snap separately.
 */
export function softenPuckPosition(previous,target,dt,maxSpeed=1600){
  if(!previous)return {...target,exact:true};
  const dx=target.x-previous.x,dy=target.y-previous.y;
  const dist=Math.hypot(dx,dy);
  const allowed=Math.max(2,(maxSpeed*1.18)*clamp(dt,0,0.05)+2);
  const f=dist>allowed?allowed/dist:1;
  return {...target,exact:f===1,x:previous.x+dx*f,y:previous.y+dy*f};
}
