/** Rendering only. Interpolate two authoritative 60Hz physics samples.
 * Never predict a new hit, goal, wall bounce, or collision.
 */
export function sampleLocalPuck(session,puck,phase){
  const previous=session?.visualPuckPrevious;
  if(!['playing','overtime'].includes(phase)||!previous||!session.visualPuckSafe)return {...puck};
  const alpha=Math.max(0,Math.min(1,(session.accumulator??0)/(1000/60)));
  return {...puck,
    x:previous.x+(puck.x-previous.x)*alpha,
    y:previous.y+(puck.y-previous.y)*alpha};
}
