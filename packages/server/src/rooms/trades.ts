import { randomUUID } from "node:crypto";
import type { FranchiseId, TradeOffer } from "@crease/shared";
import type { Member, Room } from "./store.js";

function requireActiveManager(room: Room, teamId: FranchiseId) {
  const manager = room.members.find(member => member.franchiseId === teamId && !member.spectator && member.connected);
  if (!manager) throw new Error("Both teams must have a connected manager");
  if (room.state.teams[teamId].isBot) throw new Error("Bot-controlled teams cannot trade");
  return manager;
}

export function proposeTrade(room: Room, member: Member, toTeamId: FranchiseId, offeredPlayerId: string, requestedPlayerId: string, now = Date.now()): TradeOffer {
  if (room.state.phase !== "live") throw new Error("Trades are only available during a live auction");
  const fromTeamId = member.franchiseId;
  if (!fromTeamId || fromTeamId === toTeamId) throw new Error("Choose another managed team");
  if (!member.connected || member.spectator || room.state.teams[fromTeamId].isBot) throw new Error("Only a connected team manager can offer trades");
  requireActiveManager(room, toTeamId);

  const offeredPlayer = room.state.teams[fromTeamId].squad.find(entry => entry.player.id === offeredPlayerId);
  const requestedPlayer = room.state.teams[toTeamId].squad.find(entry => entry.player.id === requestedPlayerId);
  if (!offeredPlayer || !requestedPlayer) throw new Error("Both players must still belong to the selected teams");
  const duplicate = room.tradeOffers.some(offer => offer.status === "pending" &&
    ((offer.fromTeamId === fromTeamId && offer.offeredPlayerId === offeredPlayerId) ||
     (offer.toTeamId === fromTeamId && offer.requestedPlayerId === offeredPlayerId) ||
     (offer.fromTeamId === toTeamId && offer.offeredPlayerId === requestedPlayerId) ||
     (offer.toTeamId === toTeamId && offer.requestedPlayerId === requestedPlayerId)));
  if (duplicate) throw new Error("One of these players is already in a pending trade");

  const offer: TradeOffer = {
    id: randomUUID(),
    fromMemberId: member.id,
    fromTeamId,
    toTeamId,
    offeredPlayerId,
    requestedPlayerId,
    status: "pending",
    createdAt: now,
  };
  room.tradeOffers = [...room.tradeOffers.filter(item => item.status === "pending"), offer].slice(-30);
  return offer;
}

export function respondToTrade(room: Room, member: Member, offerId: string, accept: boolean, now = Date.now()): TradeOffer {
  const offer = room.tradeOffers.find(item => item.id === offerId && item.status === "pending");
  if (!offer) throw new Error("Trade offer is no longer pending");
  if (member.franchiseId !== offer.toTeamId || member.spectator || !member.connected) throw new Error("Only the receiving team manager can respond");
  if (!accept) {
    offer.status = "declined";
    offer.resolvedAt = now;
    return offer;
  }
  if (room.state.phase !== "live") throw new Error("Trades can only be accepted during a live auction");
  requireActiveManager(room, offer.fromTeamId);
  requireActiveManager(room, offer.toTeamId);
  const fromTeam = room.state.teams[offer.fromTeamId];
  const toTeam = room.state.teams[offer.toTeamId];
  const fromIndex = fromTeam.squad.findIndex(entry => entry.player.id === offer.offeredPlayerId);
  const toIndex = toTeam.squad.findIndex(entry => entry.player.id === offer.requestedPlayerId);
  if (fromIndex < 0 || toIndex < 0) throw new Error("Trade players are no longer on their original squads");

  const fromSquad = [...fromTeam.squad];
  const toSquad = [...toTeam.squad];
  [fromSquad[fromIndex], toSquad[toIndex]] = [toSquad[toIndex], fromSquad[fromIndex]];
  room.state = {
    ...room.state,
    teams: {
      ...room.state.teams,
      [offer.fromTeamId]: { ...fromTeam, squad: fromSquad },
      [offer.toTeamId]: { ...toTeam, squad: toSquad },
    },
  };
  offer.status = "accepted";
  offer.resolvedAt = now;
  return offer;
}

export function cancelTrade(room: Room, member: Member, offerId: string, now = Date.now()): TradeOffer {
  const offer = room.tradeOffers.find(item => item.id === offerId && item.status === "pending");
  if (!offer) throw new Error("Trade offer is no longer pending");
  if (member.id !== offer.fromMemberId) throw new Error("Only the proposing manager can cancel this offer");
  offer.status = "cancelled";
  offer.resolvedAt = now;
  return offer;
}
