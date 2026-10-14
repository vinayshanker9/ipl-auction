import { describe,expect,it } from "vitest";
import { auctionPool, FRANCHISES, initialAuction, orderPlayers } from "@crease/shared";
import { createRoom,joinRoom,type Room } from "../src/rooms/store.js";
import { applyHostSettings } from "../src/rooms/settings.js";
import { advancePoolCursor } from "../src/rooms/auction-flow.js";
import { cancelTrade, proposeTrade, respondToTrade } from "../src/rooms/trades.js";
describe("room seats",()=>{it("creates room codes and reattaches a seat by token",()=>{const {room,member}=createRoom("Host","socket-a"); const joined=joinRoom(room.code,"Host","socket-b",member.token); expect(joined.member.id).toBe(member.id); expect(joined.member.connected).toBe(true); expect(room.options.playerTimerSeconds).toBe(10);});});
describe("multiplayer team setup",()=>{it("leaves unclaimed franchises bot-free",()=>{const state=initialAuction(auctionPool("season",2026),FRANCHISES.map(franchise=>franchise.id));expect(Object.values(state.teams).every(team=>!team.isBot)).toBe(true);});});
describe("live host settings",()=>{
  function liveRoom():Room {
    const options={rtmEnabled:false,playerTimerSeconds:10,showPlayerStats:true,poolMode:"season" as const,seasonYear:2026};
    const pool=orderPlayers(auctionPool("season",2026));
    return {code:"TEST01",hostId:"host",members:[],state:initialAuction(pool,["mumbai"],10_000),createdAt:0,options,poolPlayers:pool,poolCursor:0,acceleratedRound:false,tradeOffers:[],chat:[]};
  }
  it("lets the host adjust the timer during a live lot but locks stats visibility",()=>{
    const room=liveRoom();const now=10_000;
    const result=applyHostSettings(room,{...room.options,playerTimerSeconds:30},now);
    expect(result.clockReset).toBe(true);
    expect(room.state.deadline).toBe(now+30_000);
    expect(room.options.showPlayerStats).toBe(true);
    expect(()=>applyHostSettings(room,{...room.options,showPlayerStats:false},now)).toThrow("only be changed before");
  });
  describe("live player trades",()=>{
    function tradingRoom():Room {
      const options={rtmEnabled:false,playerTimerSeconds:10,showPlayerStats:true,poolMode:"season" as const,seasonYear:2026};
      const pool=orderPlayers(auctionPool("season",2026));
      const room:Room={code:"TRADE1",hostId:"host",members:[],state:initialAuction(pool,["mumbai","chennai"],10_000),createdAt:0,options,poolPlayers:pool,poolCursor:0,acceleratedRound:false,tradeOffers:[],chat:[]};
      const first=pool[0],second=pool[1];
      room.state={...room.state,teams:{
        ...room.state.teams,
        mumbai:{...room.state.teams.mumbai,isBot:false,squad:[{player:first,price:125}]},
        chennai:{...room.state.teams.chennai,isBot:false,squad:[{player:second,price:80}]},
      }};
      room.members=[
        {id:"manager-a",name:"Manager A",token:"a",franchiseId:"mumbai",ready:true,connected:true},
        {id:"manager-b",name:"Manager B",token:"b",franchiseId:"chennai",ready:true,connected:true},
      ];
      return room;
    }
    it("exchanges exactly the selected players after the receiving manager accepts without changing purses",()=>{
      const room=tradingRoom(),[first,second]=room.poolPlayers;
      const purseBefore=[room.state.teams.mumbai.purse,room.state.teams.chennai.purse];
      const offer=proposeTrade(room,room.members[0],"chennai",first.id,second.id,1);
      respondToTrade(room,room.members[1],offer.id,true,2);
      expect(room.state.teams.mumbai.squad).toEqual([{player:second,price:80}]);
      expect(room.state.teams.chennai.squad).toEqual([{player:first,price:125}]);
      expect([room.state.teams.mumbai.purse,room.state.teams.chennai.purse]).toEqual(purseBefore);
      expect(offer).toMatchObject({status:"accepted",resolvedAt:2});
    });
    it("restricts replies and cancellation to the relevant managers",()=>{
      const room=tradingRoom(),[first,second]=room.poolPlayers;
      const offer=proposeTrade(room,room.members[0],"chennai",first.id,second.id,1);
      expect(()=>respondToTrade(room,room.members[0],offer.id,true,2)).toThrow("receiving team manager");
      expect(()=>cancelTrade(room,room.members[1],offer.id,2)).toThrow("proposing manager");
      cancelTrade(room,room.members[0],offer.id,3);
      expect(offer).toMatchObject({status:"cancelled",resolvedAt:3});
      expect(()=>respondToTrade(room,room.members[1],offer.id,true,4)).toThrow("no longer pending");
    });
    it("rejects trades outside the live auction and invalid team/player selections",()=>{
      const room=tradingRoom(),[first,second]=room.poolPlayers;
      room.state={...room.state,phase:"paused"};
      expect(()=>proposeTrade(room,room.members[0],"chennai",first.id,second.id)).toThrow("live auction");
      room.state={...room.state,phase:"live"};
      expect(()=>proposeTrade(room,room.members[0],"chennai",second.id,first.id)).toThrow("belong to the selected teams");
      expect(()=>proposeTrade(room,room.members[0],"mumbai",first.id,first.id)).toThrow("another managed team");
    });
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
