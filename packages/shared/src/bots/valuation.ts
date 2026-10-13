import type { AuctionState, Player, TeamState } from "../types.js";

export type BotPersonality = "early-spender" | "patient" | "star-chaser";

export function valuePlayer(player: Player, team: TeamState, personality: BotPersonality, random = Math.random): number {
  const counts = team.squad.reduce<Record<string, number>>((acc, item) => { acc[item.player.role] = (acc[item.player.role] ?? 0) + 1; return acc; }, {});
  const gap = Math.max(0, 3 - (counts[player.role] ?? 0));
  const ageFactor = player.age === undefined ? 1 : player.age <= 25 ? 1.1 : player.age >= 34 ? 0.82 : 1;
  const purseFactor = team.purse > 700 ? 1.1 : team.purse < 300 ? 0.72 : 1;
  const persona = personality === "star-chaser" && player.rating >= 88 ? 1.35 : personality === "early-spender" ? 1.2 : personality === "patient" ? 0.86 : 1;
  const noise = 0.9 + random() * 0.2;
  return Math.round(player.rating * 12 * (1 + Math.min(gap, 2) * 0.09) * ageFactor * purseFactor * persona * noise / 5) * 5;
}

export function botShouldBid(state: AuctionState, teamId: keyof AuctionState["teams"], value: number): boolean {
  const team = state.teams[teamId];
  if (!state.currentPlayer || team.squad.length >= 25 || state.currentPrice >= value) return false;
  if (state.currentPlayer.nationality !== "India" && team.squad.filter(p => p.player.nationality !== "India").length >= 8) return false;
  return true;
}
