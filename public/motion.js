/** Visual timelines only. Cloudflare remains authoritative for collision physics. */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function serverFrameTime(clock,serverNow,arrival){
  if(!Number.isFinite(serverNow))return {at:arrival,reset:false};
  if(!Number.isFinite(clock.firstServer)){
    clock.firstServer=serverNow;clock.firstArrival=arrival;
    return {at:arrival,reset:false};
  }
  const at=clock.firstArrival+(serverNow-clock.firstServer);
  if(Math.abs(at-arrival)>1800){
    clock.firstServer=serverNow;clock.firstArrival=arrival;
    return {at:arrival,reset:true};
  }
  return {at,reset:false};
}
export function pushSnapshot(frames,snapshot,capacity=20){
  const previous=frames[frames.length-1];
  if(previous&&snapshot.at<=previous.at){
    if(previous.at-snapshot.at<2)frames[frames.length-1]=snapshot;
    return frames;
  }
  frames.push(snapshot);
  if(frames.length>capacity)frames.splice(0,frames.length-capacity);
  return frames;
}
export function sampleRemotePose(frames,index,now,opts={}){
  if(!frames?.length)return null;
  const target=now-clamp(opts.delayMs??112,40,220);
  const pose=f=>f?.poses?.[index],first=frames[0],initial=pose(first);
  if(!initial)return null;
  if(target<=first.at)return {x:initial.x,y:initial.y};
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i];
    if(target<=b.at){
      const pa=pose(a),pb=pose(b);
      if(!pa||!pb)return {x:initial.x,y:initial.y};
      const f=clamp((target-a.at)/Math.max(1,b.at-a.at),0,1);
      return {x:pa.x+(pb.x-pa.x)*f,y:pa.y+(pb.y-pa.y)*f};
    }
  }
  const newest=frames.at(-1),prev=frames.at(-2),p=pose(newest);
  if(!p)return {x:initial.x,y:initial.y};
  const older=pose(prev);
  if(!prev||!older)return {x:p.x,y:p.y};
  const elapsed=clamp((target-newest.at)/1000,0,(opts.maxExtrapolateMs??55)/1000);
  const dt=Math.max(.008,(newest.at-prev.at)/1000);
  const vx=(p.x-older.x)/dt,vy=(p.y-older.y)/dt;
  const factor=Math.min(1,(opts.maxSpeed??1800)/Math.max(.0001,Math.hypot(vx,vy)));
  const b=opts.bounds||{};
  return {x:clamp(p.x+vx*factor*elapsed,b.minX??-Infinity,b.maxX??Infinity),
    y:clamp(p.y+vy*factor*elapsed,b.minY??-Infinity,b.maxY??Infinity)};
}
export function samplePuckPose(frames,now,opts={}){
  if(!frames?.length)return null;
  const target=now-clamp(opts.delayMs??120,45,250);
  if(target<=frames[0].at)return {...frames[0]};
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i];
    if(target<=b.at){
      const f=clamp((target-a.at)/Math.max(1,b.at-a.at),0,1);
      return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,
        vx:a.vx+(b.vx-a.vx)*f,vy:a.vy+(b.vy-a.vy)*f,
        r:a.r+(b.r-a.r)*f};
    }
  }
  const last=frames.at(-1);
  const dt=clamp((target-last.at)/1000,0,(opts.maxExtrapolateMs??45)/1000);
  const r=last.r;
  return {...last,x:clamp(last.x+last.vx*dt,r,500-r),
    y:clamp(last.y+last.vy*dt,-r,900+r)};
}
export function softenPuckPosition(previous,target,dt,maxSpeed=1600){
  if(!previous)return {...target};
  const dx=target.x-previous.x,dy=target.y-previous.y;
  const dist=Math.hypot(dx,dy);
  const allowed=Math.max(2,(maxSpeed*1.18)*clamp(dt,0,0.05)+2);
  const f=dist>allowed?allowed/dist:1;
  return {...target,x:previous.x+dx*f,y:previous.y+dy*f};
}
