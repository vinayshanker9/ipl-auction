# Crease Auction

An IPL inspired, private league player auction simulator. Team names, marks and colours are original and unaffiliated with official franchises.

## Local setup

Requires Node.js 20 or newer. From the repository root, run both the client and server together:

```sh
npm install
npm run dev
```

The web client runs on `http://localhost:5175`, and the Fastify / Socket.IO server runs on port `3001`. The client uses a fixed port so Vite cannot silently open another app when the port is occupied. For separate terminals, use `npm run dev:server` and `npm run dev --workspace @crease/client`. `VITE_SERVER_URL` points the client at a different server. The SQLite database path can be set with `DATABASE_PATH`.

Run `npm test` for shared auction rules and server seat tests. Run `npm run build` to compile the workspace packages.

## Auction data and rules

Edit `packages/shared/src/config.ts` for the purse (values are lakh; `12000` is ₹120 Cr). Squad limits, default timer and increment slabs are in that file. Multiplayer hosts can set each lot timer from 5–60 seconds in the lobby and during play; a lot with no bids closes unsold. The multiplayer Legends and season pools are assembled from Cricsheet scorecard records by `packages/shared/src/pools.ts`. The solo player list in `packages/shared/src/players.json` includes real IPL participants and matching Cricsheet scorecard stats. Opening prices are simulator settings. The role, nationality, age and playing-style fields are still simulator metadata, not verified biographical data. Keep player IDs unique.

## IPL stats archive

The home page links to **IPL Legends** and **Season Archive**. Its career and season batting/bowling totals are derived from Cricsheet's ball-by-ball IPL JSON archive, through the 2026 season. `packages/client/src/data/ipl-stats.json` is the generated, compact display dataset; it includes runs, balls faced, average, strike rate, fours, sixes, wickets, runs conceded, overs and economy. Multiplayer hosts choose an all-time Legends pool or a season pool from 2008–2026 before starting. The server selects and advances the pool. During a room, the host can hide the scorecard fields from clients. Team strength is calculated only from recorded IPL runs and wickets, never bid prices or purse. The generated source JSON is stored in both client and shared packages; the generator keeps them synchronized. Simulator role, nationality, age and playing-style fields remain estimates and should not be read as historical IPL data.

To regenerate the stats, download the IPL JSON archive from [Cricsheet](https://cricsheet.org/downloads/) to `/tmp/ipl_json.zip`, then run `python3 scripts/build-ipl-stats.py`. Cricsheet publishes the data under the Open Data Commons Attribution License; retain the in-app source credit and license attribution if redistributing the generated data. The season page shows the reported highest auction buy per season for 2008–2025 in `packages/client/src/data/auction-highlights.json`, sourced from [IPL Winners' auction summary](https://www.iplwinners.net/auction/); the 2026 Cameron Green figure is sourced from [KKR's 2026 auction recap](https://www.kkr.in/news/kkr-go-big-at-ipl-2026-auction-blend-global-firepower-with-indian-promise). The historical list shows one top buy per season, not every player sold.

## Bots

Bot valuation is in `packages/shared/src/bots/valuation.ts`. It factors player rating, role gaps, age, purse, personality and a small random range. Bots place bids through the same `placeBid` validator as humans.

## Deployment

This monorepo is prepared for a split deploy: Vercel serves the static client, and Railway runs the long lived Socket.IO server. `vercel.json` builds the shared package and client from the repository root. `railway.json` builds and starts the server and exposes its `/health` check.

1. Push the repository to GitHub and import it into Vercel. Keep the Vercel project root at the repository root; `vercel.json` sets the build and output directories.
2. Deploy the same GitHub repository as a Railway service. Add a Railway volume mounted at `/data`, then set `DATABASE_PATH=/data/crease.sqlite` so room persistence survives restarts.
3. Generate a public HTTPS domain for the Railway service and set Vercel's `VITE_SERVER_URL` environment variable to that origin (for example `https://crease-api.example.up.railway.app`). Redeploy the Vercel client after setting it.

Vercel's static hosting does not run this app's persistent WebSocket server. Railway, Render, or Fly.io can host the server as a long lived Node process; the server needs a persistent disk for SQLite. `VITE_SERVER_URL` is compiled into the client at build time, so changing it requires a new client deployment.

## Workspace

- `packages/shared`: typed rules, engine, players and bots
- `packages/server`: Fastify, Socket.IO, SQLite room store and load client
- `packages/client`: React / Vite UI, Tailwind tokens and Zustand state
- `scripts`: reserved for additional operator utilities
