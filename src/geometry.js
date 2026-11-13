/** Feasible mallet endpoint outside the puck, inside its lane and travel disk.
 * Evaluate analytic boundary candidates; return null if none is feasible. */
export function projectMallet(point,center,r,b,origin,travel,normal){
  const candidates=[],eps=1e-6;
  const add=(x,y)=>{
    if(!Number.isFinite(x+y)||x<b.minX-eps||x>b.maxX+eps||y<b.minY-eps||y>b.maxY+eps)return;
    if(Math.hypot(x-center.x,y-center.y)<r-eps||Math.hypot(x-origin.x,y-origin.y)>travel+eps)return;
    if(normal&&(center.x-x)*normal.x+(center.y-y)*normal.y<-.001)return;
    candidates.push({x,y});
  };
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  add(clamp(point.x,b.minX,b.maxX),clamp(point.y,b.minY,b.maxY));add(origin.x,origin.y);
  const circles=[{...center,r},{...origin,r:travel}];
  for(const c of circles){
    const dx=point.x-c.x,dy=point.y-c.y,len=Math.hypot(dx,dy);
    if(len)add(c.x+dx*c.r/len,c.y+dy*c.r/len);
    for(const x of [b.minX,b.maxX]){const q=c.r**2-(x-c.x)**2;if(q>=0){add(x,c.y+Math.sqrt(q));add(x,c.y-Math.sqrt(q));}}
    for(const y of [b.minY,b.maxY]){const q=c.r**2-(y-c.y)**2;if(q>=0){add(c.x+Math.sqrt(q),y);add(c.x-Math.sqrt(q),y);}}
  }
  if(normal)add(center.x-normal.x*r,center.y-normal.y*r);
  for(const x of [b.minX,b.maxX])for(const y of [b.minY,b.maxY])add(x,y);
  const dx=origin.x-center.x,dy=origin.y-center.y,d=Math.hypot(dx,dy);
  if(d>eps&&d<=r+travel+eps&&d>=Math.abs(r-travel)-eps){
    const a=(r*r-travel*travel+d*d)/(2*d),h=Math.sqrt(Math.max(0,r*r-a*a));
    const x=center.x+dx*a/d,y=center.y+dy*a/d;
    add(x-dy*h/d,y+dx*h/d);add(x+dy*h/d,y-dx*h/d);
  }
  return candidates.sort((a,b)=>(a.x-point.x)**2+(a.y-point.y)**2-(b.x-point.x)**2-(b.y-point.y)**2)[0]??null;
}
