import Database from "better-sqlite3";
import { randomBytes, randomUUID } from "node:crypto";
import { FRANCHISES, auctionPool, initialAuction, orderPlayers, randomizePlayersBySet, players, type AuctionState, type FranchiseId, type Player, type TradeOffer } from "@crease/shared";

const db = new Database(process.env.DATABASE_PATH ?? "auction.db");
db.exec("CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)");
export interface Member { id: string; name: string; token: string; franchiseId: FranchiseId | null; ready: boolean; connected: boolean; socketId?: string; spectator?: boolean; disconnectedAt?: number }
export interface RoomOptions { rtmEnabled: boolean; playerTimerSeconds: number; showPlayerStats: boolean; poolMode: "legends" | "season"; seasonYear: number }
export interface Room { code: string; hostId: string; members: Member[]; state: AuctionState; createdAt: number; options: RoomOptions; poolPlayers: Player[]; poolCursor: number; acceleratedRound: boolean; tradeOffers: TradeOffer[]; chat: { id: string; name: string; text: string; at: number }[] }
const rooms = new Map<string, Room>();
for (const row of db.prepare("SELECT state FROM rooms").all() as { state: string }[]) {
  try {
    const room = JSON.parse(row.state) as Room;
    room.options = Object.assign({ rtmEnabled: false, playerTimerSeconds: 10, showPlayerStats: true, poolMode: "season", seasonYear: 2026 }, room.options);
    if (room.options.playerTimerSeconds === 18) room.options.playerTimerSeconds = 10;
    room.poolPlayers ??= randomizePlayersBySet(auctionPool(room.options.poolMode, room.options.seasonYear));
    room.poolCursor ??= room.state.phase === "lobby" ? -1 : room.state.playerIndex;
    room.acceleratedRound ??= false;
    room.tradeOffers ??= [];
    rooms.set(room.code, room);
  } catch { /* ignore invalid persisted snapshots */ }
}
function code() { return randomBytes(4).toString("hex").slice(0,6).toUpperCase(); }
function persist(room: Room) { db.prepare("INSERT OR REPLACE INTO rooms(code,state,updated_at) VALUES(?,?,?)").run(room.code, JSON.stringify(room), Date.now()); }
export function createRoom(name: string, socketId: string) {
  let id=code(); while(rooms.has(id)) id=code();
  const member: Member={id:randomUUID(),name:name.slice(0,24),token:randomBytes(24).toString("hex"),franchiseId:null,ready:false,connected:true,socketId};
  const options:RoomOptions={rtmEnabled:false,playerTimerSeconds:10,showPlayerStats:true,poolMode:"season",seasonYear:2026};
  const room: Room={code:id,hostId:member.id,members:[member],state:initialAuction(players as any,[]),createdAt:Date.now(),options,poolPlayers:[],poolCursor:-1,acceleratedRound:false,tradeOffers:[],chat:[]};
  room.state.phase="lobby"; rooms.set(id,room); persist(room); return {room,member};
}
export function joinRoom(id: string, name: string, socketId: string, token?: string, spectator=false) {
  const room=rooms.get(id.toUpperCase()); if(!room) throw new Error("Room not found");
  let member=token ? room.members.find(m=>m.token===token) : undefined;
  if(member) { member.connected=true; member.socketId=socketId; member.disconnectedAt=undefined; }
  else {
    if(!spectator && room.state.phase !== "lobby") throw new Error("Auction already started");
    if(!spectator && room.members.filter(m=>!m.spectator).length>=10) throw new Error("Room is full");
    member={id:randomUUID(),name:name.slice(0,24),token:randomBytes(24).toString("hex"),franchiseId:null,ready:false,connected:true,socketId,spectator};
    room.members.push(member);
  }
  persist(room); return {room,member};
}
export function getRoom(id:string) { return rooms.get(id.toUpperCase()); }
export function allRooms() { return [...rooms.values()]; }
export function save(room:Room) { persist(room); }
export function deleteRoom(code:string) { rooms.delete(code); db.prepare("DELETE FROM rooms WHERE code = ?").run(code); }
export function franchiseName(id: FranchiseId) { return FRANCHISES.find(f=>f.id===id)?.name ?? id; }
