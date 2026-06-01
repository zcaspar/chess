# LC0 Server

HTTP wrapper around the [Leela Chess Zero](https://lczero.org) (`lc0`) neural-net
engine. The chess app's backend calls this service to get AI opponent moves
(`/api/analysis/best-move` → here), and for hints/analysis.

## API

```
GET  /health
  → 200 { status: "ok", engine: "lc0", engineReady: boolean, weights: string }

POST /move
  body: { "fen": "<FEN>", "difficulty": "beginner|easy|medium|hard|expert" }
  → 200 { move: { uci, san, from, to, promotion }, responseTime, engine: "lc0", nodes }
  → 503 if the engine is still initialising / unavailable
```

## Why this exists / how it fits

- The **browser must not call this server directly** — it lives on a different
  origin and that tripped CORS. The app's backend calls it server-to-server, so
  the backend's `LC0_SERVER_URL` must point at this service's public URL.
- CORS is nevertheless enabled here (all origins by default) as a safety net.

## Deploy on Railway

1. In the Railway service for the LC0 server, set **Root Directory** to
   `lc0-server`. The included `railway.toml` forces the **Dockerfile** builder
   (not nixpacks), so Railway builds this folder's `Dockerfile`.
2. Deploy. The image build compiles `lc0` from source (a few minutes); weights
   are downloaded on first **startup** (not at build time), so a bad weights URL
   can never break the build — it surfaces in `/health` instead.
3. Verify:
   ```bash
   curl https://<lc0-service>.up.railway.app/health
   # { "status":"ok", "engine":"lc0", "engineReady":true, ... }

   curl -X POST https://<lc0-service>.up.railway.app/move \
     -H 'Content-Type: application/json' \
     -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","difficulty":"medium"}'
   # { "move": { "uci":"e2e4", "san":"e4", ... }, "engine":"lc0", ... }
   ```
4. On the **main backend** service, ensure `LC0_SERVER_URL` points at this
   service's URL (it defaults to the historical URL if unset).

## Configuration (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `3006` | HTTP port (Railway sets this automatically) |
| `LC0_WEIGHTS_URL` | T1-256x10-distilled net | Primary network, downloaded at startup |
| `LC0_WEIGHTS_FALLBACK_URL` | Maia-1900 net | Used only if the primary download fails |
| `LC0_NODES_<LEVEL>` | `10 / 25 / 80 / 300 / 1000` | Search nodes per difficulty (beginner→expert) |
| `LC0_TEMP_<LEVEL>` | `1.2 / 0.8 / 0.4 / 0.15 / 0` | Move-sampling temperature per difficulty |
| `LC0_BACKEND` | auto | Force an lc0 backend (e.g. `blas`); leave unset to auto-detect |
| `LC0_EXTRA_ARGS` | – | Extra lc0 CLI flags (space-separated) |

`GET /health` reports `weightsSource` (which URL actually loaded, or `preexisting`)
so you can confirm the strong net was fetched rather than the fallback.

### Difficulty model

Each level maps to **nodes** (search strength) **and** a **temperature** (how
randomly lc0 samples among candidate moves). Temperature matters because a neural
net plays strongly even at 1 node, so node count alone does **not** create a real
beginner→expert spread. `0` temperature = always the best move (strongest);
higher = weaker / more varied. `expert` uses temperature `0`.

## ⚠️ Strength note (important)

This runs on **CPU** (Railway has no GPU). LC0's headline ~3400 ELO assumes a GPU
doing thousands of nodes/sec — that is **not** achievable here. The goal is the
strongest play that's *practical* on CPU.

- The **default net is `t1-256x10-distilled-swa-2432500`** (~37 MB) — a distilled
  T1 network that plays far stronger than the old Maia default while remaining
  small and fast on CPU. If its download fails, the service falls back to
  Maia-1900 so it always comes up; check `/health` `weightsSource` to see which loaded.
- **Want it even stronger?** Set `LC0_WEIGHTS_URL` to a larger distilled net such as
  `https://storage.lczero.org/files/networks-contrib/t1-512x15x8h-distilled-swa-3395000.pb.gz`
  (~140 MB — stronger, but more memory and slower per node; make sure the service
  has enough RAM). `expert` already uses temperature `0`; raise `LC0_NODES_EXPERT`
  for more strength at the cost of move latency.
- The default node/temperature values are sensible starting points, not tuned
  against a specific net — adjust `LC0_NODES_*` / `LC0_TEMP_*` to taste (latency
  vs. strength) without rebuilding.

## Run locally

```bash
docker build -t lc0-server ./lc0-server
docker run -p 3006:3006 lc0-server
curl localhost:3006/health
```
