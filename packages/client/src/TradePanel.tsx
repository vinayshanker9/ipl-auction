import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { FRANCHISES, type FranchiseId, type TradeOffer } from "@crease/shared";

type TradeSquadEntry = { player: { id: string; name: string } };
type RoomView = {
  members?: Array<{ id: string; name: string; franchiseId: FranchiseId | null; connected: boolean; spectator?: boolean }>;
  state?: { phase: string; teams: Record<string, { squad: TradeSquadEntry[] }> };
  tradeOffers?: TradeOffer[];
};

export default function TradePanel({ room, myTeam, socket }: { room: RoomView; myTeam: string | null; socket: Socket | null }) {
  const [toTeamId, setToTeamId] = useState<FranchiseId | "">("");
  const [offeredPlayerId, setOfferedPlayerId] = useState("");
  const [requestedPlayerId, setRequestedPlayerId] = useState("");
  const managers = (room.members ?? []).filter(member => member.connected && !member.spectator && member.franchiseId && member.franchiseId !== myTeam);
  const teams = [...new Map(managers.map(member => [member.franchiseId!, member])).values()];
  const ownSquad = myTeam ? room.state?.teams[myTeam]?.squad ?? [] : [];
  const targetSquad = toTeamId ? room.state?.teams[toTeamId]?.squad ?? [] : [];
  const offers = [...(room.tradeOffers ?? [])].reverse().slice(0, 8);

  useEffect(() => {
    if (!teams.some(member => member.franchiseId === toTeamId)) setToTeamId(teams[0]?.franchiseId ?? "");
  }, [toTeamId, teams.map(member => member.franchiseId).join(",")]);

  useEffect(() => {
    if (!ownSquad.some(entry => entry.player.id === offeredPlayerId)) setOfferedPlayerId(ownSquad[0]?.player.id ?? "");
  }, [offeredPlayerId, ownSquad.map(entry => entry.player.id).join(",")]);

  useEffect(() => {
    if (!targetSquad.some(entry => entry.player.id === requestedPlayerId)) setRequestedPlayerId(targetSquad[0]?.player.id ?? "");
  }, [requestedPlayerId, targetSquad.map(entry => entry.player.id).join(",")]);

  const teamName = (teamId: string) => FRANCHISES.find(franchise => franchise.id === teamId)?.name ?? teamId;
  const playerName = (_teamId: string, playerId: string) => Object.values(room.state?.teams ?? {}).flatMap(team => team.squad).find(entry => entry.player.id === playerId)?.player.name ?? "player";
  const propose = () => {
    if (toTeamId && offeredPlayerId && requestedPlayerId) socket?.emit("trade:propose", { toTeamId, offeredPlayerId, requestedPlayerId });
  };

  if (!room || room.state?.phase !== "live" || !myTeam) return null;

  return <section className="trade-panel">
    <div className="section-kicker">LIVE TRADING WINDOW <span>PLAYER SWAPS</span></div>
    <p className="trade-note">Swap one signed player for one player. Both team managers must agree; purses do not change.</p>
    {teams.length && ownSquad.length ? <>
      <label>YOUR PLAYER<select value={offeredPlayerId} onChange={event => setOfferedPlayerId(event.target.value)}>{ownSquad.map(entry => <option key={entry.player.id} value={entry.player.id}>{entry.player.name}</option>)}</select></label>
      <label>TRADE WITH<select value={toTeamId} onChange={event => setToTeamId(event.target.value as FranchiseId)}>{teams.map(member => <option key={member.franchiseId} value={member.franchiseId!}>{teamName(member.franchiseId!)}</option>)}</select></label>
      {targetSquad.length ? <label>REQUEST PLAYER<select value={requestedPlayerId} onChange={event => setRequestedPlayerId(event.target.value)}>{targetSquad.map(entry => <option key={entry.player.id} value={entry.player.id}>{entry.player.name}</option>)}</select></label> : <p className="trade-note">That team has no signed players to trade yet.</p>}
      <button className="trade-submit" disabled={!targetSquad.length} onClick={propose}>SEND TRADE OFFER</button>
    </> : <p className="trade-note">A manager from another team and signed squad players are needed before you can trade.</p>}
    <div className="trade-offers">{offers.map(offer => {
      const incoming = offer.toTeamId === myTeam;
      const outgoing = offer.fromTeamId === myTeam;
      return <article className="trade-offer" key={offer.id}>
        <b>{teamName(offer.fromTeamId)} ⇄ {teamName(offer.toTeamId)}</b>
        <span>{playerName(offer.fromTeamId, offer.offeredPlayerId)} for {playerName(offer.toTeamId, offer.requestedPlayerId)}</span>
        <small>{offer.status.toUpperCase()}</small>
        {offer.status === "pending" && incoming && <div className="trade-actions"><button onClick={() => socket?.emit("trade:respond", { offerId: offer.id, accept: true })}>ACCEPT</button><button onClick={() => socket?.emit("trade:respond", { offerId: offer.id, accept: false })}>DECLINE</button></div>}
        {offer.status === "pending" && outgoing && <button className="trade-cancel" onClick={() => socket?.emit("trade:cancel", { offerId: offer.id })}>CANCEL OFFER</button>}
      </article>;
    })}</div>
  </section>;
}
