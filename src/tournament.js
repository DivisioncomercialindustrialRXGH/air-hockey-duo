// Elimination tournament controller: independent of Cloudflare for reliable tests.
export function shuffle(array, random = Math.random) {
  const copy = [...array];
  for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
  return copy;
}
export function initializeTournament(room, random=Math.random) {
  const seats=room.players.map((p,i)=>p?i:null).filter(i=>i!==null);
  if(room.settings.mode!=='tournament'||room.tournament?.started||seats.length<4) return false;
  room.tournament={ started:true,finished:false,champion:null,round:0,history:[],queue:[],winners:[],entrants:seats,
    stats:Object.fromEntries(seats.map(i=>[i,{wins:0,losses:0,gf:0,ga:0,round:1,eliminated:false}])) };
  nextTournamentRound(room,shuffle(seats,random),random);
  return true;
}
export function nextTournamentRound(room, seats, random=Math.random) {
  const tour=room.tournament;
  if(seats.length===1){tour.finished=true;tour.champion=seats[0];tour.queue=[];room.activeSeats=[];room.phase='champion';return;}
  tour.round++;
  tour.queue=[];tour.winners=[];
  const draw=shuffle(seats,random);
  for(let i=0;i<draw.length;i+=2){
    const a=draw[i],b=draw[i+1]??null;
    const match={id:tour.history.length+1,round:tour.round,a,b,winner:b===null?a:null,score:null,bye:b===null};
    tour.history.push(match);
    if(b===null)tour.winners.push(a);
    else tour.queue.push(match.id);
    tour.stats[a].round=tour.round;
    if(b!==null)tour.stats[b].round=tour.round;
  }
}
export function prepareTournamentMatch(room, random=Math.random) {
  const tour=room.tournament;
  if(!tour?.started||tour.finished)return null;
  if(!tour.queue.length) nextTournamentRound(room,shuffle(tour.winners,random),random);
  if(tour.finished)return null;
  const match=tour.history.find(m=>m.id===tour.queue[0]);
  room.activeSeats=[match.a,match.b];
  room.elapsedMs=0;room.remainingMs=room.settings.timeLimit?room.settings.timeLimit*1000:null;
  room.scores=[0,0];room.winner=null;room.goalBy=null;room.lastTouch=null;
  return match;
}
export function finishTournamentMatch(room, winningSide) {
  const tour=room.tournament;
  if(!tour?.started||!tour.queue.length)return null;
  const matchId=tour.queue.shift();
  const match=tour.history.find(m=>m.id===matchId);
  if(!match || !room.activeSeats.length) return null;
  const winner=winningSide===0?match.a:match.b, loser=winningSide===0?match.b:match.a;
  match.winner=winner;match.score=[...room.scores];
  tour.winners.push(winner);
  tour.stats[winner].wins++;
  tour.stats[loser].losses++;
  tour.stats[loser].eliminated=true;
  tour.stats[match.a].gf+=room.scores[0];tour.stats[match.a].ga+=room.scores[1];
  tour.stats[match.b].gf+=room.scores[1];tour.stats[match.b].ga+=room.scores[0];
  room.activeSeats=[];
  return match;
}
export function leaderboard(room) {
  const tour=room.tournament;
  if(!tour) return [];
  return Object.entries(tour.stats).map(([seat,s])=>({seat:Number(seat),name:room.players[seat]?.name||`Jugador ${Number(seat)+1}`,...s,
    champion:tour.champion===Number(seat)}))
    .sort((a,b)=>Number(b.champion)-Number(a.champion)||b.round-a.round||b.wins-a.wins||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||a.seat-b.seat);
}
