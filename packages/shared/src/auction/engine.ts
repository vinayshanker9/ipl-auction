import { AUCTION_CONFIG, FRANCHISES, type FranchiseId } from "../config.js";
import type { AuctionState, Player, TeamState } from "../types.js";

export function nextIncrement(price: number): number {
  return AUCTION_CONFIG.bidSlabs.find(slab => price < slab.below)!.increment;
}

export function minimumSquadReserve(team: TeamState): number {
  return Math.max(0, AUCTION_CONFIG.minSquad - team.squad.length) * AUCTION_CONFIG.basePrice;
}

export function canBid(team: TeamState, player: Player, amount: number, state: AuctionState): { ok: boolean; reason?: string } {
  if (team.squad.length >= AUCTION_CONFIG.maxSquad) return { ok: false, reason: "Squad is full" };
  if (team.squad.some(item => item.player.id === player.id)) return { ok: false, reason: "Player already signed" };
  if (player.nationality !== "India" && team.squad.filter(item => item.player.nationality !== "India").length >= AUCTION_CONFIG.maxOverseas) return { ok: false, reason: "Overseas limit reached" };
  if (amount !== state.currentPrice + nextIncrement(state.currentPrice)) return { ok: false, reason: `Next bid is ₹${((state.currentPrice + nextIncrement(state.currentPrice)) / 100).toFixed(2)} Cr` };
  if (amount + minimumSquadReserve(team) > team.purse) return { ok: false, reason: "Keep enough purse to complete your minimum squad" };
  return { ok: true };
}

export function initialAuction(players: Player[], controlled: FranchiseId[] = [], timerMs: number = AUCTION_CONFIG.playerTimerMs): AuctionState {
  const teams = Object.fromEntries(FRANCHISES.map(franchise => [franchise.id, { franchiseId: franchise.id, purse: AUCTION_CONFIG.startingPurse, squad: [], isBot: !controlled.includes(franchise.id) }])) as unknown as Record<FranchiseId, TeamState>;
  const sorted = orderPlayers(players);
  return { phase: "live", teams, playerIndex: 0, currentPlayer: sorted[0] ?? null, currentPrice: sorted[0]?.basePrice ?? 0, highestBidder: null, history: [], passed: [], unsold: [], deadline: Date.now() + timerMs, message: "Bidding open" };
}

const roles = ["Batter", "Wicketkeeper", "All-rounder", "Bowler", "Unknown"];
const auctionStatuses = ["capped", "uncapped", "season-performer"];
function roleOrder(role: Player["role"]) { return roles.indexOf(role); }
function statusOrder(status: Player["auctionStatus"]) { return auctionStatuses.indexOf(status ?? "season-performer"); }

export function placeBid(state: AuctionState, teamId: FranchiseId, source: "human" | "bot", at = Date.now(), requestedAmount?: number, timerMs: number = AUCTION_CONFIG.playerTimerMs): AuctionState {
  const player = state.currentPlayer;
  if (state.phase !== "live" || !player) throw new Error("Auction is not accepting bids");
  if (state.deadline !== null && at >= state.deadline) throw new Error("Bidding time is over");
  if (state.passed.includes(teamId)) throw new Error("You passed on this player");
  const team = state.teams[teamId];
  const amount = state.currentPrice + nextIncrement(state.currentPrice);
  if (requestedAmount !== undefined && requestedAmount !== amount) throw new Error("That bid is out of date. The price has moved; check the latest bid.");
  const check = canBid(team, player, amount, state);
  if (!check.ok) throw new Error(check.reason);
  return { ...state, currentPrice: amount, highestBidder: teamId, history: [...state.history, { teamId, amount, at, source }], deadline: at + timerMs, message: "Bidding open" };
}

export function passPlayer(state: AuctionState, teamId: FranchiseId): AuctionState {
  if (state.phase !== "live" || !state.currentPlayer) throw new Error("Auction is not accepting passes");
  if (state.passed.includes(teamId) || state.highestBidder === teamId) throw new Error("You cannot pass now");
  return { ...state, passed: [...state.passed, teamId] };
}

export function closePlayer(state: AuctionState, now = Date.now()): AuctionState {
  if (!state.currentPlayer) return { ...state, phase: "complete", deadline: null };
  const teams = { ...state.teams };
  const unsold = [...state.unsold];
  const player = state.currentPlayer;
  if (state.highestBidder) {
    const winner = teams[state.highestBidder];
    teams[state.highestBidder] = { ...winner, purse: winner.purse - state.currentPrice, squad: [...winner.squad, { player, price: state.currentPrice }] };
  } else unsold.push(player);
  const allPlayers = [...state.history];
  void allPlayers;
  return { ...state, teams, unsold, currentPlayer: null, message: state.highestBidder ? "Sold" : "Unsold", deadline: now + 2_000 };
}

export function startNextPlayer(state: AuctionState, players: Player[], now = Date.now(), timerMs: number = AUCTION_CONFIG.playerTimerMs): AuctionState {
  return startPlayerAtIndex(state, players, state.playerIndex + 1, now, timerMs);
}

export function orderPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) =>
    roleOrder(a.role) - roleOrder(b.role) ||
    statusOrder(a.auctionStatus) - statusOrder(b.auctionStatus) ||
    b.rating - a.rating ||
    b.basePrice - a.basePrice ||
    (b.stats?.matches ?? 0) - (a.stats?.matches ?? 0)
  );
}

function sameAuctionRank(a: Player, b: Player) {
  return roleOrder(a.role) === roleOrder(b.role) &&
    statusOrder(a.auctionStatus) === statusOrder(b.auctionStatus) &&
    a.rating === b.rating &&
    a.basePrice === b.basePrice &&
    (a.stats?.matches ?? 0) === (b.stats?.matches ?? 0);
}

export function randomizePlayersBySet(players: Player[], previousFirstPlayerId?: string, random: () => number = Math.random): Player[] {
  const ordered = orderPlayers(players);
  const shuffled: Player[] = [];
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && sameAuctionRank(ordered[start], ordered[end])) end += 1;
    const group = ordered.slice(start, end);
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    shuffled.push(...group);
    start = end;
  }
  if (shuffled[0]?.id === previousFirstPlayerId && shuffled.length > 1 && sameAuctionRank(shuffled[0], shuffled[1])) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}

export function startPlayerAtIndex(state: AuctionState, players: Player[], poolIndex: number, now = Date.now(), timerMs: number = AUCTION_CONFIG.playerTimerMs): AuctionState {
  const ordered = orderPlayers(players);
  const next = ordered[poolIndex];
  if (!next) return { ...state, phase: "complete", currentPlayer: null, deadline: null, message: "Auction complete", playerIndex: state.playerIndex + 1 };
  return { ...state, phase: "live", playerIndex: state.playerIndex + 1, currentPlayer: next, currentPrice: next.basePrice, highestBidder: null, history: [], passed: [], deadline: now + timerMs, message: "Bidding open" };
}

export function performanceIndex(player: Player): number {
  const stats = player.stats;
  if (!stats) return 0;
  return Math.round(Math.min(100, 50 + 40 * Math.min(stats.runs / 900, 1) + 10 * Math.min(stats.wickets / 35, 1)));
}

export function teamPerformanceStrength(players: Player[]): number {
  return players.length ? Math.round(players.reduce((sum, player) => sum + performanceIndex(player), 0) / players.length) : 0;
}
