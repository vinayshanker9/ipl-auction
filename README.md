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

Edit `packages/shared/src/config.ts` for the purse (values are lakh; `12000` is ₹120 Cr). Squad limits, default timer and increment slabs are in that file. Multiplayer hosts can set each lot timer from 5–60 seconds in the lobby and during play; a lot with no bids closes unsold, then unsold lots return once in a five-second accelerated round. Each accepted bid resets the clock to the selected timer duration. `packages/shared/src/pools.ts` builds season lots from every player with recorded Cricsheet appearances in that season, plus every player in the available official auction shortlist, including shortlisted players who did not appear. Seasonal lots are ordered by role, capped before uncapped, then season rating, base price and recorded appearances; ties can be randomized without moving a less-ranked player ahead of a higher-ranked one. The unshortlisted performers are labelled season performers rather than assumed to be retained because historical retention data is incomplete. The season picker includes every archived year from 2008–2026, but complete auction shortlists are currently available only for 2025 and 2026. Those final shortlists contain 574 and 350 players respectively, as confirmed by the official IPL announcements. They are shortlisted auction candidates, not the larger initial sign-up totals (1,574 in 2025 and 1,390 in 2026); the source data available to the project does not contain names for candidates who were not shortlisted. For earlier years, pools use recorded season performers only; complete historical retention rosters and auction registers are not available in the project, so those seasons cannot yet guarantee every retained or registered player. The solo player list in `packages/shared/src/players.json` remains simulator metadata. Keep player IDs unique.

## IPL stats archive

The home page links to **IPL Legends** and **Season Archive**. Its career and season batting/bowling totals are derived from Cricsheet's ball-by-ball IPL JSON archive, through the 2026 season. The archive covers every recorded season from 2008–2026 and loads career or season data on demand. Multiplayer hosts can choose an all-time Legends pool or a verified seasonal pool. The server selects and advances the pool, and the upcoming player queue and remaining count are visible to every auction participant in both solo and multiplayer play. During a room, the host can hide the scorecard fields from clients. Team strength is calculated only from recorded IPL runs and wickets, never bid prices or purse. Auction shortlist counts and sources are included in `packages/shared/src/auction-shortlists.json`; the 2025 list was announced by [IPL](https://www.iplt20.com/news/article/tata-ipl-2025-player-auction-list-announced), and the [2026 auction list](https://documents.iplt20.com/bcci/documents/1765197869375_TATA-IPL-2026-Auction-List-8.12.25.pdf) is linked in that data file. Keep the official source attribution with the list when updating it.

The Legends archive merges duplicate-name source rows into combined career totals and displays all 807 unique players in the current 809-row dataset. It orders the full list by the selected runs or wickets metric, with players who have no appearances placed last when such records exist.

Auction opening prices are not estimated from IPL performance or historical sale prices. `packages/shared/src/auction-reserves.json` contains published 2025/2026 shortlist reserve prices, while `packages/shared/src/auction-prices.json` stores historical auction/retention prices separately as references. Player-level 2025 sale/base figures come from a community-compiled dataset scraped from CricTracker; earlier seasons generally include only each season's reported top sale, and the 2026 Cameron Green price is sourced from KKR. A season shortlist reserve is preferred, followed by a published player-specific auction base where available, then the ₹20 lakh auction floor. The auction card distinguishes the opening base from any reported sale or retention reference. These bundled historical datasets are not a real-time feed of ongoing IPL auctions.

During a multiplayer live auction, team managers can propose one-for-one player swaps with another connected human-managed team. The receiving manager must accept; either manager can decline or the proposer can cancel. Trades do not change team purses, and are not available to spectators or bot-controlled teams.

To regenerate the stats, download the IPL JSON archive from [Cricsheet](https://cricsheet.org/downloads/) to `/tmp/ipl_json.zip`, then run `python3 scripts/build-ipl-stats.py`. Cricsheet publishes the data under the Open Data Commons Attribution License; retain the in-app source credit and license attribution if redistributing the generated data. The season page shows the reported highest auction buy per season for 2008–2025 in `packages/client/src/data/auction-highlights.json`, sourced from [IPL Winners' auction summary](https://www.iplwinners.net/auction/); the 2026 Cameron Green figure is sourced from [KKR's 2026 auction recap](https://www.kkr.in/news/kkr-go-big-at-ipl-2026-auction-blend-global-firepower-with-indian-promise). The historical list shows one top buy per season, not every player sold.

## Bots

Bot valuation is in `packages/shared/src/bots/valuation.ts`. It factors player rating, role gaps, age, purse, personality and a small random range. Bots place bids through the same `placeBid` validator as humans. Solo mode uses bots to fill the other franchises; multiplayer rooms leave unpicked franchises unclaimed and do not auto-fill them with bots.

## Deployment

This monorepo is prepared for a split deploy: Vercel serves the static client, and Render or Railway runs the long lived Socket.IO server. `vercel.json` builds the shared package and client from the repository root; `render.yaml` defines the Render web service and its `/health` check; `railway.json` defines the Railway service.

1. Push the repository to GitHub and import it into Vercel. Keep the Vercel project root at the repository root; `vercel.json` sets the build and output directories.
2. In Render, choose **New → Blueprint**, select this repository and apply `render.yaml`. The free web service is suitable for trying the app, but it spins down after inactivity and its local SQLite database is erased by restarts and deploys. For persistent room data, upgrade to a paid web service and attach a disk mounted at `/var/data`, then set `DATABASE_PATH=/var/data/crease.sqlite`.
3. Generate the Render service's public HTTPS URL and set Vercel's `VITE_SERVER_URL` environment variable to that origin (for example `https://crease-auction-api.onrender.com`). Redeploy the Vercel client after setting it.

Vercel's static hosting does not run this app's persistent WebSocket server. Railway, Render, or Fly.io can host the server as a long lived Node process; use persistent storage for SQLite in a lasting production deployment. Render's free instance spins down after 15 minutes without traffic, and local file changes are lost on restart. `VITE_SERVER_URL` is compiled into the client at build time, so changing it requires a new client deployment.

## Workspace

- `packages/shared`: typed rules, engine, players and bots
- `packages/server`: Fastify, Socket.IO, SQLite room store and load client
- `packages/client`: React / Vite UI, Tailwind tokens and Zustand state
- `scripts`: reserved for additional operator utilities
