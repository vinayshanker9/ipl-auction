import records from "./ipl-stats.json" with { type: "json" };
import shortlistData from "./auction-shortlists.json" with { type: "json" };
import templates from "./players.json" with { type: "json" };
import { AVAILABLE_SEASON_YEARS } from "./config.js";
import type { Player, PlayerSet } from "./types.js";

type Row = { name: string; matches: number; runs: number; average: number | null; strikeRate: number | null; wickets: number; economy: number | null };
type ShortlistEntry = { name: string; nationality: string; age: number | null; role: Player["role"]; basePrice: number; set: PlayerSet; auctionSet: string };
type PoolMode = "legends" | "season";

const auctionSeasons = shortlistData.seasons as Record<string, { players: ShortlistEntry[] }>;

function performanceIndex(row: Row) {
  return Math.round(Math.min(100, 50 + 40 * Math.min(row.runs / 900, 1) + 10 * Math.min(row.wickets / 35, 1)));
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
  return (season.players as Row[])
    .filter(row => row.matches > 0)
    .flatMap((row, index) => {
      const candidate = shortlist ? shortlistedPlayer(row, shortlist) : undefined;
      if (shortlist && !candidate) return [];
      const playerName = candidate?.name ?? row.name;
      const key = normalize(playerName);
      if (used.has(key)) return [];
      used.add(key);
      const rating = performanceIndex(row);
      return [{
        id: `ipl-season-${year}-${index}`,
        name: playerName,
        role: candidate?.role ?? "Unknown",
        nationality: candidate?.nationality ?? "Unknown",
        ...(candidate?.age == null ? {} : { age: candidate.age }),
        style: candidate ? "Not listed" : "Season data only",
        basePrice: candidate?.basePrice ?? 20,
        rating,
        set: candidate?.set ?? "Batters",
        stats: { scope: `IPL ${year}`, matches: row.matches, runs: row.runs, average: row.average, strikeRate: row.strikeRate, wickets: row.wickets, economy: row.economy },
      } satisfies Player];
    });
}

function build(mode: PoolMode, year: number): Player[] {
  if (mode === "season") return seasonPool(year);
  const source = records.players as Row[];
  const roster = templates as Player[];
  const byName = new Map(roster.map(player => [normalize(player.name), player]));
  return [...source].filter(row => row.matches > 0).sort((a, b) => performanceIndex(b) - performanceIndex(a) || b.matches - a.matches).slice(0, 220).map((row, i) => {
    const template = byName.get(normalize(row.name)) ?? roster[i % roster.length];
    const rating = performanceIndex(row);
    return {
      ...template,
      id: `ipl-legends-career-${i}`,
      name: row.name,
      basePrice: Math.max(20, rating >= 90 ? 200 : rating >= 80 ? 100 : rating >= 70 ? 50 : 20),
      rating,
      set: i < 20 ? "Marquee" : "Batters",
      stats: { scope: "IPL CAREER", matches: row.matches, runs: row.runs, average: row.average, strikeRate: row.strikeRate, wickets: row.wickets, economy: row.economy },
    } satisfies Player;
  });
}

export function auctionPool(mode: PoolMode, year: number): Player[] {
  return build(mode, year);
}

export function availableAuctionSeasons(): number[] {
  return AVAILABLE_SEASON_YEARS.filter(year => records.seasons.some(item => item.year === year));
}
