import { auctionPool, orderPlayers } from "@crease/shared";
import type { Room, RoomOptions } from "./store.js";

export function applyHostSettings(room: Room, next: RoomOptions, now = Date.now()) {
  const poolChanged = next.poolMode !== room.options.poolMode || next.seasonYear !== room.options.seasonYear;
  const timerChanged = next.playerTimerSeconds !== room.options.playerTimerSeconds;
  room.options = { ...room.options, ...next };

  if (poolChanged && room.state.phase !== "lobby" && room.state.phase !== "complete") {
    const alreadyAuctioned = new Set([
      ...Object.values(room.state.teams).flatMap(team => team.squad.map(item => item.player.name.toLowerCase())),
      ...room.state.unsold.map(player => player.name.toLowerCase()),
      ...(room.state.currentPlayer ? [room.state.currentPlayer.name.toLowerCase()] : []),
    ]);
    room.poolPlayers = orderPlayers(auctionPool(room.options.poolMode, room.options.seasonYear)
      .filter(player => !alreadyAuctioned.has(player.name.toLowerCase())));
    room.poolCursor = -1;
    room.state = { ...room.state, message: "Pool updated. This lot will finish normally; new lots use the selected pool." };
  }

  const clockReset = timerChanged && room.state.phase === "live" && room.state.currentPlayer !== null;
  if (clockReset) room.state = { ...room.state, deadline: now + room.options.playerTimerSeconds * 1000 };
  return { poolChanged, timerChanged, clockReset };
}
