import Fastify from "fastify";
import { Server } from "socket.io";
import { z } from "zod";
import { FRANCHISES, auctionPool, initialAuction, orderPlayers, randomizePlayersBySet, players, placeBid, passPlayer, closePlayer, startPlayerAtIndex, valuePlayer, botShouldBid, teamPerformanceStrength, availableAuctionSeasons, type FranchiseId } from "@crease/shared";
import { allRooms, createRoom, deleteRoom, joinRoom, save, type Member } from "./rooms/store.js";
import { applyHostSettings } from "./rooms/settings.js";
import { advancePoolCursor } from "./rooms/auction-flow.js";

const app=Fastify({logger:true});
const io=new Server(app.server,{cors:{origin:true}});
app.get("/health",async()=>({ok:true,rooms:allRooms().length}));
const buckets=new Map<string,{at:number;count:number}>();
function limited(id:string,limit:number) { const now=Date.now(), b=buckets.get(id); if(!b||now-b.at>10_000){buckets.set(id,{at:now,count:1});return false;} b.count++;return b.count>limit; }
function emitState(room:any,event="room:state") { io.to(room.code).emit(event,{state:room,serverTime:Date.now()}); }
function stateFor(room:any) {
  const state=room.state;
  const upcomingPlayers=(room.poolPlayers??[]).slice((room.poolCursor??-1)+1);
  const viewState=room.options.showPlayerStats?state:{
    ...state,
    currentPlayer:state.currentPlayer?{...state.currentPlayer,stats:undefined,rating:0}:null,
    unsold:state.unsold.map((player:any)=>({...player,stats:undefined,rating:0})),
    teams:Object.fromEntries(Object.entries(state.teams).map(([id,team]:any)=>[id,{...team,performanceStrength:teamPerformanceStrength(team.squad.map((entry:any)=>entry.player)),squad:team.squad.map((entry:any)=>({...entry,player:{...entry.player,stats:undefined,rating:0}}))}]))
  };
  const visibleUpcoming=room.options.showPlayerStats?upcomingPlayers:upcomingPlayers.map((player:any)=>({...player,stats:undefined,rating:0}));
  return {code:room.code,hostId:room.hostId,members:room.members.map(({token,socketId,...m}:Member)=>({...m,isHost:m.id===room.hostId})),state:viewState,options:room.options,upcomingPlayers:visibleUpcoming,upcomingPlayerCount:visibleUpcoming.length,acceleratedRound:room.acceleratedRound&&state.history.length===0,chat:room.chat};
}
function sendState(room:any,event="room:state") { io.to(room.code).emit(event,{state:stateFor(room),serverTime:Date.now()}); save(room); }
function roomPlayers(room:any) { return room.poolPlayers ?? orderPlayers(auctionPool(room.options.poolMode,room.options.seasonYear)); }
function roomTimer(room:any) { return Math.min(room.options.playerTimerSeconds,room.acceleratedRound?5:60)*1000; }
const auctionTimers=new Map<string,ReturnType<typeof setTimeout>>();
const botTimers=new Map<string,ReturnType<typeof setTimeout>>();
const previousFirstPlayers=new Map<string,string>();
function scheduleClock(room:any) {
  const old=auctionTimers.get(room.code); if(old) clearTimeout(old);
  if(room.state.phase!=="live"||!room.state.currentPlayer||!room.state.deadline) return;
  const timer=setTimeout(()=>{
    if(room.state.phase!=="live"||!room.state.currentPlayer) return;
    if((room.state.deadline??0)>Date.now()) return scheduleClock(room);
    advance(room);
  },Math.max(50,room.state.deadline-Date.now()));
  auctionTimers.set(room.code,timer);
}
const schemas={
 "room:create":z.object({name:z.string().trim().min(1).max(24)}), "room:join":z.object({code:z.string().length(6),name:z.string().trim().min(1).max(24),token:z.string().optional()}), "room:spectate":z.object({code:z.string().length(6)}),
 "lobby:select-franchise":z.object({franchiseId:z.string()}),"lobby:ready":z.object({ready:z.boolean()}),
 "lobby:start":z.object({}),"lobby:kick":z.object({playerId:z.string().min(1)}),"auction:bid":z.object({amount:z.number().int().positive()}),"auction:pass":z.object({}),"host:settings":z.object({playerTimerSeconds:z.number().int().min(5).max(60),showPlayerStats:z.boolean(),poolMode:z.enum(["legends","season"]),seasonYear:z.number().int().refine(year=>availableAuctionSeasons().includes(year),"No IPL season performance data is available for that year")}),"host:pause":z.object({}),"host:resume":z.object({}),"host:skip-player":z.object({}),"host:end":z.object({}),"host:team-to-bot":z.object({franchiseId:z.string()}),"chat:send":z.object({text:z.string().trim().min(1).max(240)}),"reaction:send":z.object({text:z.string().max(32)})
};
function memberFor(socket:any,room:any) { return room.members.find((m:Member)=>m.socketId===socket.id); }
function reject(socket:any,message:string) { socket.emit("room:error",{message}); }
function advance(room:any) { const timer=auctionTimers.get(room.code);if(timer)clearTimeout(timer);room.state=closePlayer(room.state);setTimeout(()=>{ if(room.state.phase!=="live"||room.state.currentPlayer) return; const cursor=advancePoolCursor(room); room.state=startPlayerAtIndex(room.state,roomPlayers(room),cursor,Date.now(),roomTimer(room)); sendState(room); scheduleClock(room); scheduleBots(room); },1700); sendState(room,"auction:state"); }
function scheduleBots(room:any) {
  if(room.state.phase!=="live"||!room.state.currentPlayer) return;
  const old=botTimers.get(room.code);if(old)clearTimeout(old);
  const bidDeadline=room.state.deadline??Date.now()+12000;
  const candidates=(Object.values(room.state.teams) as any[]).filter(t=>t.isBot&&t.franchiseId!==room.state.highestBidder).filter(t=>botShouldBid(room.state,t.franchiseId,valuePlayer(room.state.currentPlayer,t,["early-spender","patient","star-chaser"][FRANCHISES.findIndex(f=>f.id===t.franchiseId)%3] as any)));
  if(!candidates.length)return;
  const team=candidates[Math.floor(Math.random()*candidates.length)];
  const delay=450+Math.random()*1800;
  const timer=setTimeout(()=>{ if(room.state.phase!=="live"||!room.state.currentPlayer||Date.now()>bidDeadline||room.state.highestBidder===team.franchiseId)return; try { room.state=placeBid(room.state,team.franchiseId,"bot",Date.now(),undefined,room.options.playerTimerSeconds*1000); sendState(room,"auction:bid-accepted");scheduleClock(room);scheduleBots(room); } catch {} },delay);
  botTimers.set(room.code,timer);
}
io.on("connection",socket=>{
    socket.onAny((event:string,payload:unknown)=>{
    try {
      const schema=(schemas as any)[event]; if(!schema) return reject(socket,"Unknown message");
      const data=schema.parse(payload??{}); const connLimit=event.startsWith("auction:")?12:event.startsWith("chat:")||event.startsWith("reaction:")?8:30;
      if(limited(socket.id,connLimit)) return reject(socket,"Slow down and try again");
      if(event==="room:create") { const {room,member}=createRoom(data.name,socket.id); socket.join(room.code); socket.emit("room:created",{code:room.code,token:member.token,memberId:member.id,franchiseId:member.franchiseId,state:stateFor(room)}); return; }
      if(event==="room:join"||event==="room:spectate") { const code=data.code.toUpperCase(); const {room,member}=joinRoom(code,event==="room:join"?data.name:"Watcher",socket.id,event==="room:join"?data.token:undefined,event==="room:spectate"); socket.join(room.code); socket.emit("room:joined",{code:room.code,token:member.token,memberId:member.id,franchiseId:member.franchiseId,state:stateFor(room)}); sendState(room); return; }
      const room=allRooms().find(r=>r.members.some(m=>m.socketId===socket.id)); if(!room) return reject(socket,"Join a room first");
      const member=memberFor(socket,room); if(!member) return;
      if(member.spectator) return reject(socket,"Spectators cannot change the auction");
      if(event==="lobby:select-franchise") { if(room.state.phase!=="lobby") throw Error("Lobby is closed"); if(!FRANCHISES.some(f=>f.id===data.franchiseId)) throw Error("Unknown franchise"); if(room.members.some(m=>m.id!==member.id&&m.franchiseId===data.franchiseId)) throw Error("That franchise is taken"); member.franchiseId=data.franchiseId as FranchiseId; member.ready=false; }
      else if(event==="lobby:ready") member.ready=data.ready;
      else if(event==="lobby:kick") { if(member.id!==room.hostId)throw Error("Only the host can remove players");if(room.state.phase!=="lobby")throw Error("Players can only be removed in the lobby");const target=room.members.find(m=>m.id===data.playerId);if(!target||target.id===room.hostId)throw Error("Player not found");if(target.socketId)io.sockets.sockets.get(target.socketId)?.disconnect(true);room.members=room.members.filter(m=>m.id!==target.id); }
      else if(event==="lobby:start") { if(member.id!==room.hostId) throw Error("Only the host can start"); const humansMembers=room.members.filter(m=>!m.spectator); if(humansMembers.length<2) throw Error("At least two players are needed to start"); if(humansMembers.some(m=>!m.ready||!m.franchiseId)) throw Error("Everyone must choose a team and ready up"); const humanFranchises=FRANCHISES.map(franchise=>franchise.id); const poolKey=`${room.options.poolMode}:${room.options.seasonYear}`; room.poolPlayers=randomizePlayersBySet(auctionPool(room.options.poolMode,room.options.seasonYear),previousFirstPlayers.get(poolKey)); if(room.poolPlayers[0])previousFirstPlayers.set(poolKey,room.poolPlayers[0].id); room.poolCursor=0; room.acceleratedRound=false; room.state=initialAuction(room.poolPlayers,humanFranchises,roomTimer(room)); room.state.phase="live"; sendState(room,"lobby:started"); scheduleClock(room); scheduleBots(room); return; }
      else if(event==="auction:bid") { if(!member.franchiseId) throw Error("Choose a franchise first"); room.state=placeBid(room.state,member.franchiseId,"human",Date.now(),data.amount,room.options.playerTimerSeconds*1000); sendState(room,"auction:bid-accepted"); scheduleClock(room); scheduleBots(room); return; }
      else if(event==="auction:pass") { if(!member.franchiseId) throw Error("Choose a franchise first"); room.state=passPlayer(room.state,member.franchiseId); sendState(room,"auction:state"); return; }
      else if(event.startsWith("host:")) { if(member.id!==room.hostId) throw Error("Only the host can do that");
        if(event==="host:pause") { const timer=auctionTimers.get(room.code);if(timer)clearTimeout(timer);const bot=botTimers.get(room.code);if(bot)clearTimeout(bot);room.state={...room.state,phase:"paused"}; }
        if(event==="host:resume") room.state={...room.state,phase:"live",deadline:Date.now()+roomTimer(room)};
        if(event==="host:settings") {
          const {clockReset}=applyHostSettings(room,data);
          if(clockReset){scheduleClock(room);scheduleBots(room);}
          return sendState(room,room.state.phase==="lobby"?"lobby:updated":"room:state");
        }
        if(event==="host:skip-player") return advance(room);
        if(event==="host:end") { const timer=auctionTimers.get(room.code);if(timer)clearTimeout(timer);const bot=botTimers.get(room.code);if(bot)clearTimeout(bot);room.state={...room.state,phase:"complete",currentPlayer:null,deadline:null}; }
        if(event==="host:team-to-bot") { const t=room.state.teams[data.franchiseId as FranchiseId]; if(t) room.state={...room.state,teams:{...room.state.teams,[data.franchiseId]:{...t,isBot:true}}}; }
        sendState(room,"room:state"); if(event==="host:resume"||event==="host:team-to-bot"){scheduleClock(room);scheduleBots(room);} return;
      }
      else if(event==="chat:send") { const message={id:crypto.randomUUID(),name:member.name,text:data.text,at:Date.now()}; room.chat.push(message); room.chat=room.chat.slice(-50); io.to(room.code).emit("chat:message",message); save(room); return; }
      else if(event==="reaction:send") { io.to(room.code).emit("reaction:received",{name:member.name,text:data.text}); return; }
      sendState(room,"lobby:updated");
    } catch(error) { reject(socket,error instanceof Error?error.message:"Invalid message"); }
  });
  socket.on("disconnect",()=>{ for(const room of allRooms()){ const member=memberFor(socket,room); if(member){member.connected=false;member.disconnectedAt=Date.now(); if(member.id===room.hostId&&room.state.phase==="live") room.state={...room.state,phase:"paused"}; sendState(room); } } });
});
setInterval(()=>{ const now=Date.now(); for(const room of allRooms()){ if(now-room.createdAt>3_600_000&&!room.members.some((m:Member)=>m.connected)){ io.to(room.code).disconnectSockets(true); deleteRoom(room.code); } else room.members=room.members.filter((m:Member)=>m.connected||!m.disconnectedAt||now-m.disconnectedAt<120_000); } },60_000);
const port=Number(process.env.PORT??3001); await app.listen({port,host:"0.0.0.0"});
