import records from "./ipl-stats.json" with { type: "json" };
import templates from "./players.json" with { type: "json" };
import type { Player, PlayerRole, PlayerSet } from "./types.js";

type Row = { name: string; matches: number; runs: number; average: number | null; strikeRate: number | null; wickets: number; economy: number | null };
type PoolMode = "legends" | "season";

function index(row: Row) {
  return Math.round(Math.min(100, 50 + 40 * Math.min(row.runs / 900, 1) + 10 * Math.min(row.wickets / 35, 1)));
}

function build(mode: PoolMode, year: number): Player[] {
  const season = records.seasons.find(item => item.year === year);
  const source = (mode === "legends" ? records.players : season?.players ?? []) as Row[];
  const rows = [...source].filter(row => row.matches > 0).sort((a, b) => index(b) - index(a) || b.matches - a.matches).slice(0, 220);
  const byName = new Map((templates as Player[]).map(player => [player.name.toLowerCase(), player]));
  return rows.map((row, i) => {
    const template = byName.get(row.name.toLowerCase()) ?? (templates as Player[])[i % templates.length];
    const rating = index(row);
    const set: PlayerSet = i < 20 ? "Marquee" : template.set;
    return {
      ...template,
      id: `ipl-${mode}-${mode === "season" ? year : "career"}-${i}`,
      name: row.name,
      set,
      rating,
      basePrice: Math.max(20, rating >= 90 ? 200 : rating >= 80 ? 100 : rating >= 70 ? 50 : 20),
      stats: { scope: mode === "legends" ? "IPL CAREER" : `IPL ${year}`, matches: row.matches, runs: row.runs, average: row.average, strikeRate: row.strikeRate, wickets: row.wickets, economy: row.economy },
      role: template.role as PlayerRole,
    };
  });
}

export function auctionPool(mode: PoolMode, year: number): Player[] {
  return build(mode, year);
}
