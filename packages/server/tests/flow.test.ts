import { describe,expect,it } from "vitest";
import { auctionPool, FRANCHISES, initialAuction, orderPlayers } from "@crease/shared";
import { createRoom,joinRoom,type Room } from "../src/rooms/store.js";
import { applyHostSettings } from "../src/rooms/settings.js";
import { advancePoolCursor } from "../src/rooms/auction-flow.js";
describe("room seats",()=>{it("creates room codes and reattaches a seat by token",()=>{const {room,member}=createRoom("Host","socket-a"); const joined=joinRoom(room.code,"Host","socket-b",member.token); expect(joined.member.id).toBe(member.id); expect(joined.member.connected).toBe(true); expect(room.options.playerTimerSeconds).toBe(10);});});
describe("multiplayer team setup",()=>{it("leaves unclaimed franchises bot-free",()=>{const state=initialAuction(auctionPool("season",2026),FRANCHISES.map(franchise=>franchise.id));expect(Object.values(state.teams).every(team=>!team.isBot)).toBe(true);});});
describe("live host settings",()=>{
  function liveRoom():Room {
    const options={rtmEnabled:false,playerTimerSeconds:10,showPlayerStats:true,poolMode:"season" as const,seasonYear:2026};
    const pool=orderPlayers(auctionPool("season",2026));
    return {code:"TEST01",hostId:"host",members:[],state:initialAuction(pool,["mumbai"],10_000),createdAt:0,options,poolPlayers:pool,poolCursor:0,acceleratedRound:false,chat:[]};
  }
  it("lets the host adjust the timer during a live lot but locks stats visibility",()=>{
    const room=liveRoom();const now=10_000;
    const result=applyHostSettings(room,{...room.options,playerTimerSeconds:30},now);
    expect(result.clockReset).toBe(true);
    expect(room.state.deadline).toBe(now+30_000);
    expect(room.options.showPlayerStats).toBe(true);
    expect(()=>applyHostSettings(room,{...room.options,showPlayerStats:false},now)).toThrow("only be changed before");
  });
  it("switches the upcoming pool without interrupting or repeating the current lot",()=>{
    const room=liveRoom();
    const current=room.state.currentPlayer!;
    const signed=room.poolPlayers.find(player=>player.name!==current.name)!;
    const unsold=room.poolPlayers.find(player=>player.name!==current.name&&player.name!==signed.name)!;
    room.state={...room.state,teams:{...room.state.teams,mumbai:{...room.state.teams.mumbai,squad:[{player:signed,price:20}]}},unsold:[unsold]};
    const oldDeadline=room.state.deadline;
    applyHostSettings(room,{...room.options,poolMode:"legends"},10_000);
    const nextNames=new Set(room.poolPlayers.map(player=>player.name.toLowerCase()));
    expect(room.state.currentPlayer?.id).toBe(current.id);
    expect(room.state.deadline).toBe(oldDeadline);
    expect(room.poolCursor).toBe(-1);
    expect(nextNames.has(current.name.toLowerCase())).toBe(false);
    expect(nextNames.has(signed.name.toLowerCase())).toBe(false);
    expect(nextNames.has(unsold.name.toLowerCase())).toBe(false);
  });
  it("runs unsold lots once in an accelerated round",()=>{
    const room=liveRoom();
    const unsold=room.poolPlayers.slice(2,4);
    room.poolCursor=room.poolPlayers.length-1;
    room.state={...room.state,unsold};
    expect(advancePoolCursor(room)).toBe(0);
    expect(room.acceleratedRound).toBe(true);
    expect(room.poolPlayers).toEqual(unsold);
    expect(room.state.unsold).toEqual([]);
    room.poolCursor=room.poolPlayers.length-1;
    expect(advancePoolCursor(room)).toBe(unsold.length);
    expect(room.poolPlayers).toEqual(unsold);
  });
});
