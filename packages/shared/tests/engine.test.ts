import { describe, expect, it } from "vitest";
import { auctionPool, availableAuctionSeasons, canBid, closePlayer, initialAuction, minimumSquadReserve, nextIncrement, performanceIndex, placeBid, randomizePlayersBySet, startNextPlayer, teamPerformanceStrength } from "../src/index.js";
import players from "../src/players.json";

describe("shared auction rules", () => {
  it("uses the auction price slabs and computes minimum squad reserve", () => {
    expect([nextIncrement(20), nextIncrement(95), nextIncrement(100), nextIncrement(195), nextIncrement(200), nextIncrement(480), nextIncrement(500), nextIncrement(1000)]).toEqual([5, 5, 10, 10, 20, 20, 25, 25]);
    expect(minimumSquadReserve({ franchiseId: "mumbai", purse: 1200, squad: [], isBot: false })).toBe(360);
  });
  it("accepts the next exact bid and rejects a duplicate amount", () => {
    const state = initialAuction(players, ["mumbai"], 10_000);
    const team = state.teams.mumbai;
    expect(canBid(team, state.currentPlayer!, state.currentPrice + nextIncrement(state.currentPrice), state).ok).toBe(true);
    const bidAt = state.deadline! - 5_000;
    const next = placeBid(state, "mumbai", "human", bidAt);
    expect(next.currentPrice).toBe(state.currentPrice + nextIncrement(state.currentPrice));
    expect(next.deadline).toBe(bidAt + 10_000);
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
  it("shuffles players within each auction set and avoids repeating the opening player", () => {
    const firstOrder = randomizePlayersBySet(players, undefined, () => 0);
    const nextOrder = randomizePlayersBySet(players, firstOrder[0].id, () => 0);
    expect(nextOrder[0].id).not.toBe(firstOrder[0].id);
    expect(nextOrder.map(player => player.id).sort()).toEqual(players.map(player => player.id).sort());
    expect(nextOrder.findIndex(player => player.set === "Batters")).toBeGreaterThan(nextOrder.findIndex(player => player.set === "Marquee"));
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
  it("builds career and shortlisted-season pools only from recorded IPL performance", () => {
    const legends = auctionPool("legends", 2026);
    const season = auctionPool("season", 2025);
    expect(legends.length).toBeGreaterThan(100);
    expect(legends[0].stats?.scope).toBe("IPL CAREER");
    expect(season.length).toBeGreaterThan(100);
    expect(season[0].stats?.scope).toBe("IPL 2025");
    expect(legends.some(player => player.name === "Virat Kohli")).toBe(true);
    expect(season.some(player => player.name === "Mustafizur Rahman")).toBe(true);
    expect(season.some(player => player.name === "Virat Kohli")).toBe(false);
    expect(auctionPool("season", 2018).length).toBeGreaterThan(100);
    expect(auctionPool("season", 2018).every(player => player.stats?.scope === "IPL 2018")).toBe(true);
    expect(availableAuctionSeasons()).toEqual(Array.from({ length: 19 }, (_, index) => 2008 + index));
  });
  it("opens every recorded season pool at base price and charges the accepted bid", () => {
    for (const year of availableAuctionSeasons()) {
      const pool = auctionPool("season", year);
      expect(pool.length, `IPL ${year} pool`).toBeGreaterThan(0);
      for (const player of pool) {
        const state = initialAuction([player], ["mumbai"]);
        expect(state.currentPrice).toBe(player.basePrice);
        const amount = state.currentPrice + nextIncrement(state.currentPrice);
        const bid = placeBid(state, "mumbai", "human", 0, amount);
        expect(bid.currentPrice).toBe(amount);
        const closed = closePlayer(bid, 1);
        expect(closed.teams.mumbai.purse).toBe(state.teams.mumbai.purse - amount);
        expect(closed.teams.mumbai.squad[0]?.price).toBe(amount);
      }
    }
  });
  it("calculates squad strength from IPL runs and wickets alone", () => {
    const player = { ...players[0], stats: { scope: "IPL CAREER", matches: 10, runs: 900, average: 45, strikeRate: 130, wickets: 35, economy: 8 } };
    const revisedAuctionPrice = { ...player, basePrice: player.basePrice * 10_000 };
    expect(performanceIndex(player)).toBe(100);
    expect(teamPerformanceStrength([player])).toBe(teamPerformanceStrength([revisedAuctionPrice]));
  });
});
