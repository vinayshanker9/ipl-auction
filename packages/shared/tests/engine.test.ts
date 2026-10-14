import { describe, expect, it } from "vitest";
import { auctionPool, availableAuctionSeasons, canBid, closePlayer, initialAuction, minimumSquadReserve, nextIncrement, orderPlayers, performanceIndex, placeBid, randomizePlayersBySet, startNextPlayer, teamPerformanceStrength } from "../src/index.js";
import players from "../src/players.json";
import auctionShortlists from "../src/auction-shortlists.json";
import careerStats from "../../client/src/data/ipl-career-stats.json";

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
  it("resets the bid clock to every selected timer duration", () => {
    for (const timerMs of [5_000, 10_000, 15_000, 18_000, 20_000, 30_000, 45_000, 60_000]) {
      const state = initialAuction(players, ["mumbai"], timerMs);
      const bidAt = 2_000;
      expect(placeBid(state, "mumbai", "human", bidAt, undefined, timerMs).deadline).toBe(bidAt + timerMs);
    }
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
  it("keeps role, capped status, and renown order while shuffling tied lots", () => {
    const nextOrder = randomizePlayersBySet(players, undefined, () => 0);
    expect(nextOrder.map(player => player.id).sort()).toEqual(players.map(player => player.id).sort());
    const roleOrder = ["Batter", "Wicketkeeper", "All-rounder", "Bowler", "Unknown"];
    expect(nextOrder.map(player => roleOrder.indexOf(player.role))).toEqual([...nextOrder].map(player => roleOrder.indexOf(player.role)).sort((a, b) => a - b));
    const tied = [
      { ...players[0], id: "tie-a", role: "Batter" as const, auctionStatus: "capped" as const, rating: 99, basePrice: 200 },
      { ...players[0], id: "tie-b", role: "Batter" as const, auctionStatus: "capped" as const, rating: 99, basePrice: 200 },
      { ...players[0], id: "lower-ranked", role: "Batter" as const, auctionStatus: "capped" as const, rating: 80, basePrice: 200 },
    ];
    expect(randomizePlayersBySet(tied, "tie-a", () => 0).map(player => player.id)).toEqual(["tie-b", "tie-a", "lower-ranked"]);
    const ordered = orderPlayers([
      { ...players[0], id: "batter-capped-famous", role: "Batter", auctionStatus: "capped", rating: 95, basePrice: 200 },
      { ...players[0], id: "batter-capped-lower", role: "Batter", auctionStatus: "capped", rating: 65, basePrice: 30 },
      { ...players[0], id: "batter-uncapped", role: "Batter", auctionStatus: "uncapped", rating: 100, basePrice: 200 },
      { ...players[0], id: "batter-season-performer", role: "Batter", auctionStatus: "season-performer", rating: 100, basePrice: 200 },
      { ...players[0], id: "bowler-capped", role: "Bowler", auctionStatus: "capped", rating: 100, basePrice: 200 },
    ]);
    expect(ordered.map(player => player.id)).toEqual([
      "batter-capped-famous",
      "batter-capped-lower",
      "batter-uncapped",
      "batter-season-performer",
      "bowler-capped",
    ]);
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
  it("includes every season performer and every shortlisted auction player in seasonal pools", () => {
    const legends = auctionPool("legends", 2026);
    const season = auctionPool("season", 2025);
    const careerNames = new Set(careerStats.players.filter(player => player.matches > 0).map(player => player.name));
    expect(legends).toHaveLength(careerNames.size);
    expect(new Set(legends.map(player => player.name))).toEqual(careerNames);
    expect(legends[0].stats?.scope).toBe("IPL CAREER");
    expect(legends.find(player => player.name === "Arshdeep Singh")?.stats).toMatchObject({ matches: 120, runs: 34, wickets: 139 });
    expect(season.length).toBeGreaterThan(600);
    expect(season[0].stats?.scope).toBe("IPL 2025");
    expect(legends.some(player => player.name === "Virat Kohli")).toBe(true);
    expect(season.some(player => player.name === "Mustafizur Rahman")).toBe(true);
    expect(season.some(player => player.name === "Virat Kohli" && player.stats?.scope === "IPL 2025")).toBe(true);
    expect(season.some(player => player.name === "B Sai Sudharsan" && player.stats?.scope === "IPL 2025")).toBe(true);
    expect(season.some(player => player.name === "Harry Brook" && player.stats === undefined && player.style.includes("Auction shortlist"))).toBe(true);
    for (const entry of auctionShortlists.seasons["2025"].players) {
      expect(season.some(player => player.name === entry.name && player.role === entry.role && player.nationality === entry.nationality)).toBe(true);
    }
    expect(auctionShortlists.seasons["2025"].players).toHaveLength(574);
    expect(auctionShortlists.seasons["2026"].players).toHaveLength(350);
    expect(auctionShortlists.seasons["2025"].players.find(player => player.name === "Anrich Nortje")?.nationality).toBe("South Africa");
    expect(auctionShortlists.seasons["2026"].players.every(player => player.nationality === player.nationality.trim().replace(/\s+/g, " "))).toBe(true);
    expect(auctionPool("season", 2026).length).toBeGreaterThanOrEqual(500);
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
