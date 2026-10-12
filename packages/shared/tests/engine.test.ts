import { describe, expect, it } from "vitest";
import { auctionPool, canBid, closePlayer, initialAuction, minimumSquadReserve, nextIncrement, performanceIndex, placeBid, startNextPlayer, teamPerformanceStrength } from "../src/index.js";
import players from "../src/players.json";

describe("shared auction rules", () => {
  it("uses configured increment slabs and computes minimum squad reserve", () => {
    expect([nextIncrement(0), nextIncrement(200), nextIncrement(500), nextIncrement(1000)]).toEqual([5, 10, 20, 25]);
    expect(minimumSquadReserve({ franchiseId: "mumbai", purse: 1200, squad: [], isBot: false })).toBe(360);
  });
  it("accepts the next exact bid and rejects a duplicate amount", () => {
    const state = initialAuction(players, ["mumbai"], 10_000);
    const team = state.teams.mumbai;
    expect(canBid(team, state.currentPlayer!, state.currentPrice + nextIncrement(state.currentPrice), state).ok).toBe(true);
    const next = placeBid(state, "mumbai", "human", 1000);
    expect(next.currentPrice).toBe(state.currentPrice + nextIncrement(state.currentPrice));
    expect(next.deadline).toBe(state.deadline);
    expect(canBid(next.teams.mumbai, next.currentPlayer!, next.currentPrice, next)).toMatchObject({ ok: false });
  });
  it("never bids past the minimum completion reserve", () => {
    const state = initialAuction(players, ["mumbai"]);
    const lowPurse = { ...state.teams.mumbai, purse: 360 };
    expect(canBid(lowPurse, state.currentPlayer!, 5, state).ok).toBe(false);
  });
  it("rejects an overseas signing after the team reaches its limit", () => {
    const state = initialAuction(players, ["mumbai"]);
    const overseas = players.find(p => p.nationality !== "India")!;
    const fullOverseas = { ...state.teams.mumbai, squad: Array.from({ length: 8 }, (_, i) => ({ player: { ...overseas, id: `overseas-${i}` }, price: 20 })) };
    expect(canBid(fullOverseas, overseas, state.currentPrice + nextIncrement(state.currentPrice), state)).toMatchObject({ ok: false, reason: "Overseas limit reached" });
  });
  it("serializes near-simultaneous bids so only the first can take a given price", () => {
    const state = initialAuction(players, ["mumbai", "chennai"]);
    const first = placeBid(state, "mumbai", "human", 1000);
    expect(() => placeBid(first, "chennai", "human", 1000, state.currentPrice + nextIncrement(state.currentPrice))).toThrow("out of date");
    expect(first.highestBidder).toBe("mumbai");
  });
  it("uses a host-selected lot timer and marks a no-bid lot unsold", () => {
    const state = initialAuction(players, ["mumbai"], 7_000);
    expect(state.deadline).toBeGreaterThanOrEqual(Date.now() + 6_990);
    const closed = closePlayer(state, 1000);
    expect(closed.unsold).toContain(state.currentPlayer);
    expect(startNextPlayer(closed, players, 1000, 7_000).deadline).toBe(8_000);
  });
  it("builds career and season pools from recorded IPL performance", () => {
    const legends = auctionPool("legends", 2026);
    const season = auctionPool("season", 2018);
    expect(legends.length).toBeGreaterThan(100);
    expect(legends[0].stats?.scope).toBe("IPL CAREER");
    expect(season[0].stats?.scope).toBe("IPL 2018");
    expect(legends.some(player => player.name === "Virat Kohli")).toBe(true);
  });
  it("calculates squad strength from IPL runs and wickets alone", () => {
    const player = { ...players[0], stats: { scope: "IPL CAREER", matches: 10, runs: 900, average: 45, strikeRate: 130, wickets: 35, economy: 8 } };
    const revisedAuctionPrice = { ...player, basePrice: player.basePrice * 10_000 };
    expect(performanceIndex(player)).toBe(100);
    expect(teamPerformanceStrength([player])).toBe(teamPerformanceStrength([revisedAuctionPrice]));
  });
});
