import { io, type Socket } from "socket.io-client";

const url = process.env.SERVER_URL ?? "http://localhost:3001";
const host = io(url);
const clients: Socket[] = [host];
let code = "";
let started = false;
const teams = ["mumbai", "chennai", "bengaluru", "kolkata", "delhi"];

function watchLobby(client: Socket) {
  const readyAndStart = ({ state }: any) => {
    const people = state.members.filter((member: any) => !member.spectator);
    if (people.length !== teams.length || people.some((member: any) => !member.franchiseId)) return;
    client.emit("lobby:ready", { ready: true });
    if (client === host && !started && people.every((member: any) => member.ready)) {
      started = true;
      host.emit("lobby:start", {});
    }
  };
  client.on("room:state", readyAndStart);
  client.on("lobby:updated", readyAndStart);
}

host.on("connect", () => host.emit("room:create", { name: "Load host" }));
host.on("room:created", ({ code: roomCode }: any) => {
  code = roomCode;
  console.log(`Load room ${code} created. Five fake clients; five remaining teams are bots.`);
  watchLobby(host);
  host.emit("lobby:select-franchise", { franchiseId: teams[0] });
  for (let index = 1; index < teams.length; index++) {
    const client = io(url);
    clients.push(client);
    watchLobby(client);
    client.on("connect", () => client.emit("room:join", { code, name: `Guest ${index}` }));
    client.on("room:joined", () => client.emit("lobby:select-franchise", { franchiseId: teams[index] }));
  }
});

host.on("auction:state", ({ state }: any) => {
  if (state.state?.phase !== "complete") return;
  console.log("Load auction complete.");
  clients.forEach(client => client.disconnect());
  process.exit(0);
});
