/** Smooth presentation of authoritative remote mallets (no collision physics). */
export function sampleRemotePose(frames, index, now, opts={}) {
  if (!frames?.length) return null;
  const delay=Math.max(40,Math.min(180,opts.delayMs??105));
  const time=now-delay;
  const first=frames[0];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const safePose=f=>f?.poses?.[index];
  const oldest=safePose(first);
  if(!oldest)return null;
  if(time<=first.at)return {x:oldest.x,y:oldest.y};
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i];
    if(time<=b.at){
      const pa=safePose(a),pb=safePose(b);
      if(!pa||!pb)return {x:oldest.x,y:oldest.y};
      const fraction=clamp((time-a.at)/Math.max(1,b.at-a.at),0,1);
      // Strict linear interpolation is monotonic and cannot overshoot walls.
      return {x:pa.x+(pb.x-pa.x)*fraction,y:pa.y+(pb.y-pa.y)*fraction};
    }
  }
  const newest=frames[frames.length-1],prev=frames[frames.length-2];
  const p=safePose(newest);
  if(!p)return {x:oldest.x,y:oldest.y};
  const older=safePose(prev);
  if(!prev||!older)return {x:p.x,y:p.y};
  const elapsed=clamp((time-newest.at)/1000,0,(opts.maxExtrapolateMs??45)/1000);
  const dt=Math.max(.008,(newest.at-prev.at)/1000);
  const maxSpeed=opts.maxSpeed??1800;
  const dx=(p.x-older.x)/dt,dy=(p.y-older.y)/dt;
  const speed=Math.hypot(dx,dy),fac=Math.min(1,maxSpeed/Math.max(speed,.001));
  const bounds=opts.bounds||{};
  return {
    x:clamp(p.x+dx*fac*elapsed,bounds.minX??-Infinity,bounds.maxX??Infinity),
    y:clamp(p.y+dy*fac*elapsed,bounds.minY??-Infinity,bounds.maxY??Infinity)
  };
}
