import type { FranchiseId } from "./config.js";

export type PlayerRole = "Batter" | "Bowler" | "All-rounder" | "Wicketkeeper" | "Unknown";
export type PlayerSet = "Marquee" | "Batters" | "Bowlers" | "All-rounders" | "Wicketkeepers" | "Uncapped";
export interface PlayerStats { scope: string; matches: number; runs: number; average: number | null; strikeRate: number | null; wickets: number; economy: number | null }
export interface Player { id: string; name: string; role: PlayerRole; nationality: string; age?: number; style: string; basePrice: number; rating: number; set: PlayerSet; stats?: PlayerStats }
export interface SquadPlayer { player: Player; price: number }
export interface TeamState { franchiseId: FranchiseId; purse: number; squad: SquadPlayer[]; isBot: boolean }
export interface BidRecord { teamId: FranchiseId; amount: number; at: number; source: "human" | "bot" }
export interface AuctionState { phase: "lobby" | "live" | "paused" | "complete"; teams: Record<FranchiseId, TeamState>; playerIndex: number; currentPlayer: Player | null; currentPrice: number; highestBidder: FranchiseId | null; history: BidRecord[]; passed: FranchiseId[]; unsold: Player[]; deadline: number | null; message: string }

export type ClientMessage =
 | { type: "room:create"; name: string }
 | { type: "room:join"; code: string; name: string; token?: string }
 | { type: "room:spectate"; code: string }
 | { type: "lobby:select-franchise"; franchiseId: FranchiseId }
 | { type: "lobby:ready"; ready: boolean }
 | { type: "lobby:start" }
 | { type: "auction:bid"; amount: number }
 | { type: "auction:pass" }
 | { type: "host:pause" }
 | { type: "host:resume" }
 | { type: "host:skip-player" }
 | { type: "host:end" }
 | { type: "host:team-to-bot"; franchiseId: FranchiseId }
 | { type: "chat:send"; text: string }
 | { type: "reaction:send"; text: string };

export type ServerMessage =
 | { type: "room:created"; code: string; token: string; state: unknown }
 | { type: "room:joined"; code: string; token: string; state: unknown }
 | { type: "room:state"; state: unknown; serverTime: number }
 | { type: "room:error"; message: string }
 | { type: "lobby:updated"; state: unknown }
 | { type: "lobby:started"; state: unknown }
 | { type: "auction:state"; state: unknown; serverTime: number }
 | { type: "auction:bid-accepted"; state: unknown }
 | { type: "auction:bid-rejected"; message: string }
 | { type: "auction:player-sold"; playerId: string; teamId: FranchiseId; price: number }
 | { type: "auction:player-unsold"; playerId: string }
 | { type: "auction:paused"; state: unknown }
 | { type: "auction:resumed"; state: unknown }
 | { type: "auction:ended"; state: unknown }
 | { type: "presence:updated"; players: unknown[] }
 | { type: "chat:message"; id: string; name: string; text: string; at: number }
 | { type: "reaction:received"; name: string; text: string };
