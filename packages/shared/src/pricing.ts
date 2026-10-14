import auctionPriceData from "./auction-prices.json" with { type: "json" };
import auctionReserveData from "./auction-reserves.json" with { type: "json" };
import { AUCTION_CONFIG } from "./config.js";
import type { Player, PlayerPriceReference } from "./types.js";

type PriceRecord = { player: string; season: number; amountLakh: number; baseAmountLakh?: number; team: string; kind: PlayerPriceReference["kind"]; source: string };
type ReserveRecord = { player: string; season: number; amountLakh: number };

const publishedPrices = auctionPriceData.prices as PriceRecord[];
const officialReserves = auctionReserveData.reserves as ReserveRecord[];

function normalize(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findPriceReference(name: string, throughYear: number): PlayerPriceReference | undefined {
  const available = publishedPrices.filter(record => record.season <= throughYear);
  const normalizedName = normalize(name);
  let matches = available.filter(record => normalize(record.player) === normalizedName);
  if (!matches.length) {
    const parts = name.trim().split(/\s+/);
    if (!/^[A-Z]{1,4}$/.test(parts[0]) || parts.length < 2) return undefined;
    const surname = normalize(parts.at(-1)!);
    matches = available.filter(record => {
      const candidateParts = record.player.trim().split(/\s+/);
      return normalize(candidateParts.at(-1)!) === surname && candidateParts[0][0]?.toLowerCase() === parts[0][0].toLowerCase();
    });
    if (new Set(matches.map(record => normalize(record.player))).size !== 1) return undefined;
  }
  const latestYear = Math.max(...matches.map(record => record.season));
  const latest = matches.filter(record => record.season === latestYear).sort((a, b) => Number(b.kind === "auction-sale") - Number(a.kind === "auction-sale"))[0];
  if (!latest) return undefined;
  const basePrice = latest.kind === "auction-sale" ? latest.baseAmountLakh : undefined;
  return {
    season: latest.season,
    amount: latest.amountLakh,
    ...(basePrice ? { basePrice } : {}),
    team: latest.team,
    kind: latest.kind,
  };
}

export function officialReserve(name: string, throughYear = 2026): number | undefined {
  const available = officialReserves.filter(record => record.season <= throughYear);
  const exact = available.filter(record => normalize(record.player) === normalize(name));
  if (exact.length) return exact.sort((a, b) => b.season - a.season)[0].amountLakh;
  const parts = name.trim().split(/\s+/);
  if (!/^[A-Z]{1,4}$/.test(parts[0]) || parts.length < 2) return undefined;
  const surname = normalize(parts.at(-1)!);
  const matches = available.filter(record => {
    const candidateParts = record.player.trim().split(/\s+/);
    return normalize(candidateParts.at(-1)!) === surname && candidateParts[0][0]?.toLowerCase() === parts[0][0].toLowerCase();
  });
  if (new Set(matches.map(record => normalize(record.player))).size !== 1) return undefined;
  return matches.sort((a, b) => b.season - a.season)[0]?.amountLakh;
}

export function applyPublishedPrice(player: Player, throughYear = 2026): Player {
  const priceReference = findPriceReference(player.name, throughYear);
  return {
    ...player,
    basePrice: officialReserve(player.name, throughYear) ?? priceReference?.basePrice ?? AUCTION_CONFIG.basePrice,
    ...(priceReference ? { priceReference } : {}),
  };
}
