# Stockfish (vendored)

The chess engine the app runs in the browser for game review, live analysis,
hints and the offline computer opponent.

| | |
|---|---|
| Build | Stockfish.js 19, **lite, single-threaded** (`stockfish-19-lite-single`) |
| Source | https://github.com/nmrugg/stockfish.js (tag `v19.0.1`), npm package `stockfish@19.0.1` |
| Upstream engine | https://github.com/official-stockfish/Stockfish |
| Licence | **GPL-3.0** — see `COPYING.txt` in this folder |
| sha256 `.js` | `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a` |
| sha256 `.wasm` | `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de` |

The files are unmodified copies of `bin/stockfish-19-lite-single.js` and
`bin/stockfish-19-lite-single.wasm` from that npm package.

## Why these two files are checked in

The npm package is about 200 MB because it ships five engine flavours; the app
needs one, which is under 2 MB. Vendoring the pair keeps installs small and
means the engine is served from the app's own origin with no build step.

## Why this flavour

- **Single-threaded**: the multi-threaded builds need `SharedArrayBuffer`,
  which only works when the host sends cross-origin isolation headers
  (`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`). Those
  headers also break Firebase's sign-in popup. This build needs neither.
- **Lite**: a 1.8 MB download instead of ~94 MB. It is weaker than the full
  network and still far stronger than any human player.

## How the app uses it

`src/engine/stockfishEngine.ts` starts the `.js` file as a Web Worker and talks
UCI to it over `postMessage`. The `.wasm` file must sit next to the `.js` file
and be served as `application/wasm`.

## Licence note

Stockfish is free software under the GNU General Public License v3. It runs
here as a separate program in its own worker, exchanging text commands with
the app. Anyone distributing this app must keep `COPYING.txt` alongside the
engine and make the engine's source available — the links above are that
source, since the files are unmodified.

## Updating

Install the new `stockfish` release somewhere temporary, copy the two
`lite-single` files and `Copying.txt` here, update `ENGINE_SCRIPT` in
`src/engine/stockfishEngine.ts`, and update the version and checksums above.
