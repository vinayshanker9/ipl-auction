import type { Room } from "./store.js";

export function advancePoolCursor(room: Room): number {
  room.poolCursor += 1;
  if (room.poolCursor >= room.poolPlayers.length && !room.acceleratedRound && room.state.unsold.length > 0) {
    room.poolPlayers = [...room.state.unsold];
    room.poolCursor = 0;
    room.acceleratedRound = true;
    room.state = { ...room.state, unsold: [] };
  }
  return room.poolCursor;
}
