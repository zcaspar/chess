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
| `LC0_WEIGHTS_URL` | Maia-1900 net | Network downloaded at startup (see strength note) |
| `LC0_NODES_BEGINNER…EXPERT` | `1 / 10 / 50 / 200 / 800` | Search nodes per difficulty |
| `LC0_BACKEND` | auto | Force an lc0 backend (e.g. `blas`); leave unset to auto-detect |
| `LC0_EXTRA_ARGS` | – | Extra lc0 CLI flags (space-separated) |

## ⚠️ Strength note (important)

This runs on **CPU** (Railway has no GPU). LC0's headline ~3400 ELO assumes a GPU
doing thousands of nodes/sec — that is **not** achievable here.

- The **default weights are Maia-1900** (a small, human-like net) purely because
  it has a stable download URL, so the service builds and runs out of the box.
- For stronger play, set `LC0_WEIGHTS_URL` to a standard lc0 T-network `.pb.gz`
  and raise `LC0_NODES_*`. A strong net plays well even at low node counts
  (its policy head alone is strong) while staying fast on CPU.
- Tune the `LC0_NODES_*` values to trade strength for move latency.

## Run locally

```bash
docker build -t lc0-server ./lc0-server
docker run -p 3006:3006 lc0-server
curl localhost:3006/health
```
