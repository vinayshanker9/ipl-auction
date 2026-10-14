import records from "./ipl-stats.json" with { type: "json" };
import shortlistData from "./auction-shortlists.json" with { type: "json" };
import templates from "./players.json" with { type: "json" };
import { AUCTION_CONFIG, AVAILABLE_SEASON_YEARS } from "./config.js";
import { findPriceReference, officialReserve } from "./pricing.js";
import type { Player, PlayerSet } from "./types.js";

type Row = { name: string; matches: number; runs: number; inningsBalls?: number; outs?: number; average: number | null; strikeRate: number | null; wickets: number; conceded?: number; overs?: number; economy: number | null; fours?: number; sixes?: number };
type ShortlistEntry = { name: string; nationality: string; age: number | null; role: Player["role"]; basePrice: number; set: PlayerSet; auctionSet: string };
type PoolMode = "legends" | "season";

const auctionSeasons = shortlistData.seasons as Record<string, { players: ShortlistEntry[] }>;

function performanceIndex(row: Row) {
  return Math.round(Math.min(100, 50 + 40 * Math.min(row.runs / 900, 1) + 10 * Math.min(row.wickets / 35, 1)));
}

function mergeCareerRows(rows: Row[]): Row[] {
  const byName = new Map<string, Row>();
  for (const row of rows) {
    const existing = byName.get(row.name);
    if (!existing) {
      byName.set(row.name, { ...row });
      continue;
    }
    const merged = {
      ...existing,
      matches: existing.matches + row.matches,
      runs: existing.runs + row.runs,
      inningsBalls: (existing.inningsBalls ?? 0) + (row.inningsBalls ?? 0),
      outs: (existing.outs ?? 0) + (row.outs ?? 0),
      fours: (existing.fours ?? 0) + (row.fours ?? 0),
      sixes: (existing.sixes ?? 0) + (row.sixes ?? 0),
      wickets: existing.wickets + row.wickets,
      conceded: (existing.conceded ?? 0) + (row.conceded ?? 0),
      overs: (existing.overs ?? 0) + (row.overs ?? 0),
    };
    merged.average = merged.outs ? merged.runs / merged.outs : null;
    merged.strikeRate = merged.inningsBalls ? (merged.runs / merged.inningsBalls) * 100 : null;
    merged.economy = merged.overs ? (merged.conceded ?? 0) / merged.overs : null;
    byName.set(row.name, merged);
  }
  return [...byName.values()];
}

function normalize(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function shortlistedPlayer(row: Row, entries: ShortlistEntry[]) {
  const exact = entries.filter(entry => normalize(entry.name) === normalize(row.name));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;

  const parts = row.name.trim().split(/\s+/);
  const first = parts[0];
  const abbreviated = /^[A-Z]{1,4}$/.test(first);
  if (!abbreviated || parts.length < 2) return undefined;
  const surname = normalize(parts.at(-1)!);
  const possible = entries.filter(entry => {
    const candidateParts = entry.name.trim().split(/\s+/);
    return normalize(candidateParts.at(-1)!) === surname && candidateParts[0][0]?.toLowerCase() === first[0].toLowerCase();
  });
  return possible.length === 1 ? possible[0] : undefined;
}

function seasonPool(year: number): Player[] {
  const season = records.seasons.find(item => item.year === year);
  const shortlist = auctionSeasons[String(year)]?.players;
  if (!season) return [];
  const used = new Set<string>();
  const usedShortlist = new Set<ShortlistEntry>();
  const performers = (season.players as Row[])
    .filter(row => row.matches > 0)
    .flatMap((row, index) => {
      const candidate = shortlist ? shortlistedPlayer(row, shortlist) : undefined;
      if (candidate) usedShortlist.add(candidate);
      const playerName = candidate?.name ?? row.name;
      const key = normalize(playerName);
      if (used.has(key)) return [];
      used.add(key);
      const rating = performanceIndex(row);
      const priceReference = findPriceReference(playerName, year);
      return [{
        id: `ipl-season-${year}-${index}`,
        name: playerName,
        role: candidate?.role ?? "Unknown",
        nationality: candidate?.nationality ?? "Unknown",
        ...(candidate?.age == null ? {} : { age: candidate.age }),
        style: candidate ? "Not listed" : "Season data only",
        basePrice: candidate?.basePrice ?? officialReserve(playerName, year) ?? priceReference?.basePrice ?? AUCTION_CONFIG.basePrice,
        rating,
        set: candidate?.set ?? "Batters",
        auctionStatus: candidate ? (candidate.auctionSet.startsWith("U") ? "uncapped" : "capped") : "season-performer",
        stats: { scope: `IPL ${year}`, matches: row.matches, runs: row.runs, average: row.average, strikeRate: row.strikeRate, wickets: row.wickets, economy: row.economy },
        ...(priceReference ? { priceReference } : {}),
      } satisfies Player];
    });
  const registered = (shortlist ?? []).flatMap((entry, index) => {
    if (usedShortlist.has(entry)) return [];
    const priceReference = findPriceReference(entry.name, year);
    return [{
      id: `ipl-auction-${year}-${index}`,
      name: entry.name,
      role: entry.role,
      nationality: entry.nationality,
      ...(entry.age == null ? {} : { age: entry.age }),
      style: "Auction shortlist · no season appearance",
      basePrice: entry.basePrice,
      rating: 0,
      set: entry.set,
      auctionStatus: entry.auctionSet.startsWith("U") ? "uncapped" : "capped",
      ...(priceReference ? { priceReference } : {}),
    } satisfies Player];
  });
  return [...performers, ...registered];
}

function build(mode: PoolMode, year: number): Player[] {
  if (mode === "season") return seasonPool(year);
  const source = records.players as Row[];
  const roster = templates as Player[];
  const byName = new Map(roster.map(player => [normalize(player.name), player]));
  return mergeCareerRows(source.filter(row => row.matches > 0)).sort((a, b) => performanceIndex(b) - performanceIndex(a) || b.matches - a.matches || a.name.localeCompare(b.name)).map((row, i) => {
    const template = byName.get(normalize(row.name)) ?? roster[i % roster.length];
    const rating = performanceIndex(row);
    const priceReference = findPriceReference(row.name, Number.MAX_SAFE_INTEGER);
    return {
      ...template,
      id: `ipl-legends-career-${i}`,
      name: row.name,
      basePrice: officialReserve(row.name) ?? priceReference?.basePrice ?? AUCTION_CONFIG.basePrice,
      rating,
      set: i < 20 ? "Marquee" : "Batters",
      stats: { scope: "IPL CAREER", matches: row.matches, runs: row.runs, average: row.average, strikeRate: row.strikeRate, wickets: row.wickets, economy: row.economy },
      ...(priceReference ? { priceReference } : {}),
    } satisfies Player;
  });
}

export function auctionPool(mode: PoolMode, year: number): Player[] {
  return build(mode, year);
}

export function availableAuctionSeasons(): number[] {
  return AVAILABLE_SEASON_YEARS.filter(year => records.seasons.some(item => item.year === year));
}
