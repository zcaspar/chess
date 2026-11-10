# Changelog

All notable changes to the Chess App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Engine analysis in the browser: game review, evaluation bar, engine lines** (2026-11-10)
  - **Why**: analysis was one "Analyze Position" button that asked the LC0 server for a single best move — signed-in users only, tens of seconds per position, no evaluation, no verdict on any move. Stockfish now runs in a Web Worker in the player's own browser, so analysis is immediate, works for guests and offline, and never blocks the page.
  - **Game review**: "Analyse game" on the replay screen evaluates every position (depth 16; about 4 seconds for a 33-move game on a desktop) and shows an accuracy figure and inaccuracy / mistake / blunder counts for each side, an evaluation graph of the whole game (click to jump; mistakes and blunders are dotted on it), `?!` / `?` / `??` marks in the move list, and for the move on the board a verdict with the move the engine preferred, drawn as a green arrow.
  - **How moves are judged**: by the winning chances a move gave away, not by raw centipawns — losing a pawn when a queen up is not a blunder. Thresholds are 5 / 10 / 15 points of expected score for inaccuracy / mistake / blunder; accuracy uses the curve Lichess publishes, averaged over a side's moves. The engine's own first choice is never marked down, whatever the next search says.
  - **Evaluation bar and engine lines**: a bar beside the board (it follows the board orientation, and is a labelled `meter` for screen readers), and an "Engine lines" switch that shows Stockfish's top three variations in standard notation for the position on the board, deepening live to depth 20, with a blue arrow for its best move.
  - **Replay keyboard control**: ← and → step through the game, Home and End jump to either end. The last move is highlighted.
  - **Computer opponent when LC0 is unreachable**: the backup used to be a material-counting search on the main thread, which froze the page and played far below every advertised level. It is now Stockfish in the browser at a strength set per level (Skill Level 0–20, with shallow searches at the low end); it answers in well under a second. The LC0 server is still tried first. The old search remains only for a browser that cannot run the engine at all. A blue "Playing on this device" notice replaces the amber weak-engine warning in that case.
  - **Hints are immediate**: a hint used to be a round trip to the LC0 server at its strongest setting, which can take 15–25 seconds on a new position. Hints now come from the local engine in a fraction of a second, with the server as the fallback where no engine can run.
  - **The engine**: Stockfish.js 19, lite single-threaded build (28 KB + 1.8 MB, loaded only when analysis, a hint or the backup opponent is first used), vendored in `public/stockfish/` with its licence and checksums. Single-threaded so that no cross-origin isolation headers are needed. **Stockfish is GPL-3.0** — see `public/stockfish/README.md`.
  - **Removed**: the server-side "Analyze Position" button on the replay screen, and the "Debug PGN (Console)" button.
  - **Files**: `src/engine/` (new: `uci.ts`, `evaluation.ts`, `stockfishEngine.ts`, `gameAnalysis.ts`, `localOpponent.ts`), `src/hooks/useEngineAnalysis.ts` (new), `src/components/Analysis/` (new: `EvalBar`, `EvalGraph`, `AnalysisPanel`), `src/components/GameReplay/GameReplay.tsx`, `src/utils/chessAI.ts`, `src/contexts/GameContext.tsx`, `src/components/GameStatus/GameStatus.tsx`, `public/stockfish/`.
  - **Tests**: frontend 395 (new: `engine.test`, `EngineAnalysisUI`, `LocalEngineOpponent`). Also run in a real headless Chromium against the production build with the real engine: Morphy's Opera Game reviewed in 3.9 s (White 98.5%, Black 88.1%, 9…b5 marked `??`), live lines reaching depth 15+, and the computer replying from the local engine in 130–500 ms with the server unreachable.

### Fixed
- **Core play: promotion choice, games that survive a reload, honest clocks** (2026-11-10)
  - **Every promotion became a queen**: the board never asked, the drag-and-drop choice from the library's dialog was thrown away, and click-to-move had no dialog at all — so underpromotion (a knight fork, a rook to avoid stalemate) could not be played. A promotion now opens a picker (`PromotionPicker`: Queen / Rook / Bishop / Knight, keyboard-focusable, Escape or a click outside cancels) for drag, click-to-move and online games alike, and the chosen piece is what is played and sent to the server. The existing `autoPromoteQueen` preference skips the picker. react-chessboard's own dialog is switched off via `onPromotionCheck`.
  - **A reload threw the game away**: nothing about a local or vs-computer game was stored (the docs claimed auto-save). The game in progress — moves, clocks, mode, difficulty, names, hint/variant allowances — is now kept in `localStorage` (`utils/gamePersistence.ts`) and restored on load. The saved moves are replayed rather than trusted, so a corrupt entry is dropped; finished, reset, online and computer-vs-computer games are not kept; a save older than 7 days is ignored. Time is not charged while the page is closed.
  - **A reload also dropped you out of an online game**: the room code is remembered for the life of the tab, so the client rejoins on load and the server hands the seat and position back. If the room has gone, it is forgotten quietly instead of raising an error popup.
  - **Opponent moves were lost when you left the board screen**: the listener that applied server moves lived in a hook mounted only by the board, so opening History, Stats or Puzzles mid-game dropped them and the two clients disagreed from then on. Moves are now applied in `GameContext`, whichever screen is showing, and if the local board is ever out of step with the server (a missed move, two arriving together) it takes the server's game wholesale instead of silently ignoring the move.
  - **Pause handed your thinking time back**: `pauseClock` cleared the clock without deducting the elapsed time, and there was no way to resume on Black's turn because `startClock` always gave the clock to White. Pausing now keeps the time used, a Resume button appears, and the clock restarts for the side to move (it also resumes by itself on the next move). Pause is no longer offered in an online game, where the clock is the server's.
  - **The online clock jumped a second at a time**: it only changed when the server's once-a-second update arrived, so tenths never moved under ten seconds. It now counts down locally between updates, capped at 1.5 s ahead of the last report so it holds rather than running on if updates stop.
  - **Files**: `src/components/ChessBoard/ChessBoard.tsx`, `ChessBoard/PromotionPicker.tsx` (new), `src/utils/gamePersistence.ts` (new), `src/contexts/GameContext.tsx`, `src/contexts/SocketContext.tsx`, `src/components/ChessClock/ChessClock.tsx`, `src/hooks/useOnlineGame.ts`, `src/setupTests.ts`.
  - **Tests**: frontend 346 (new: `ChessBoardPromotion`, `GamePersistenceAndSync`); also checked in a real headless Chromium against the production build — picker on drag and on click, Escape cancels, a knight lands on a8, and the game (underpromotion included) is back after a reload and still playable.

### Fixed / Security
- **Online play: the server now owns the game** (2026-11-09)
  - **Deploy order: backend first, then frontend.** The new client no longer saves online games itself and sends a `guestToken` on guest upgrade; the new backend is what records them and what accepts that token.
  - **Resign did nothing online, and resigned the wrong player**: the button called the local `resign(currentPlayer)`, so the opponent was never told and whoever was *to move* was recorded as resigning. It now emits the socket `resign`; the server knows which seat sent it. Accepting a draw likewise goes through the server only.
  - **Undo / Redo / New Game are disabled during a live online game**: they rewound only the local board, leaving the two clients on different positions. Hints are also off against a human opponent.
  - **Anyone in the room could force a draw**: `acceptDraw` never checked that a draw had been offered or that the sender was a player. Only the player the offer was made *to* can accept it, and an offer lapses when a move is played.
  - **A dropped connection gave your seat away**: seats were set to `null` on disconnect, so the next person to open the room link took over the game mid-flight. A seat now belongs to a user id for the life of the game; its owner gets it back on reconnect and everyone else is a spectator. The client re-authenticates with a *fresh* token on every reconnect (it re-sent the sign-in token, which expires after an hour), retries indefinitely instead of five times, and re-joins its room automatically.
  - **Games never actually ended on the server**: `endGame` had no latch, so a timed-out game was re-ended by the 1 s clock tick for the whole five-minute grace period (hundreds of `gameEnded` emits and stats writes), a resigned game was later "ended" again on time with a different result, and moves were still accepted afterwards. A room now ends exactly once.
  - **Profiles were held in process memory**: `models/User.ts` was three Maps marked "development only", so every deploy wiped every profile, preference and statistic, and the socket handler's `UPDATE users` never matched a row. Profiles now live in the Postgres `users` table (created on first use; a legacy `NOT NULL` on `email` is relaxed so guests can exist). The Maps remain only as a non-production fallback when no database is reachable.
  - **Online results could be forged**: the client posted its own result, outcome, PGN and `opponentId`, and that request also wrote the shared head-to-head row for whichever account it named. The server now records an online game itself when it ends — both players' history rows, their statistics (one atomic statement per player) and one head-to-head update — from the moves it validated. Client-posted games can no longer name another account as the opponent or overwrite a server-recorded (`online-…`) game. A game with fewer than two plies is not scored.
  - **Every online game was filed as a draw**: the client looked for the phrase "White wins" in the server's bare `white`/`black`/`draw` result code. The server now sends a readable `resultText` and the client uses it.
  - **`PATCH /api/users/profile` accepted any field**: the body was spread into the stored profile, so a client could set its own `rating`, `email` and so on. Only `username`, `displayName`, `avatarUrl`, `preferences` and non-negative integer stat counters are accepted. (Counters for local and vs-computer games are still self-reported by the client — those games never touch the server.)
  - **Any signed-in user could take over a guest profile** by posting its UID to `/upgrade-guest`. It now requires the guest account's own ID token.
  - **Removed `POST /api/users/analyze-position`** (and `/debug-analysis`): an unauthenticated, unthrottled proxy to the engine that bypassed everything `/api/analysis` enforces.
  - **Email addresses were shown to opponents**: the socket `username` was the account email, broadcast with the socket id to anyone holding the room code. Players are now sent `{ id, username, displayName, connected }` only.
  - **Also**: creating or joining a room requires authentication; time controls are validated (10 s–3 h, increment ≤ 180 s); room codes come from a CSPRNG and never collide with a live room; a move arriving after the flag has fallen loses on time instead of being played; rooms nobody can play any more are dropped (and unfinished rooms idle for 6 h are swept) instead of leaking until restart; live rooms are written out on graceful shutdown. The dead "rehydrate room from the `games` table" path was removed — its query could never match, and it would have recreated a room with both seats empty.
  - **Known gaps, deliberately not in this change**: no forfeit for abandoning an untimed game; the `games`/`moves` tables are still only created by `database/init.sql`; room state is still per-process (no Redis adapter).
  - **Files**: `backend-src/sockets/gameSocket.ts`, `models/User.ts`, `routes/users.ts`, `routes/gameHistory.ts`, `utils/roomPersistence.ts`, `server.ts`, `src/contexts/SocketContext.tsx`, `src/contexts/GameContext.tsx`, `src/contexts/AuthContext.tsx`, `src/components/GameControls/GameControls.tsx`.
  - **Tests**: backend 145 mocked + 13 against a real Postgres (new: `gameSocketIntegrity`, `userRoutes`, `userModel.integration`); frontend 319 (new: `GameControlsOnline`). Also exercised end to end with real socket.io clients against the built server and a throwaway Postgres.

### Security
- **Closed the auth bypass and the open debugging surface** (2026-09-13)
  - **Demo auth is now an explicit opt-in**: the "Firebase Admin isn't configured" fallback (HTTP middleware *and* the socket handler) was keyed on `NODE_ENV !== 'production'`, so any deployment that forgot to set `NODE_ENV` minted a valid session for a garbage token. It now requires `ALLOW_DEMO_AUTH=true` **and** a non-production environment. Rules live in `backend-src/utils/demoAuth.ts` so both call sites share one definition (and so suites that mock the auth middleware keep them).
  - **`/debug/*` is development-only**: `/debug/env` reported database host, user, port and whether a password was set, unauthenticated, on a public URL. A guard now 404s the whole `/debug` prefix unless `NODE_ENV === 'development'`; `/health` is untouched.
  - **Admin endpoint fails closed**: `if (ADMIN_UIDS.length > 0 && !ADMIN_UIDS.includes(uid))` meant an unset `ADMIN_UIDS` made every signed-in user an admin. Inverted.
  - **LC0 proxy endpoints require a token**: `/api/analysis/hint` and `/best-move` were unauthenticated, so anyone could spend the engine's capacity through the backend. `/api/analysis/position` already required auth.
  - **Optional shared secret for the LC0 service**: `LC0_SHARED_SECRET`, when set on the engine (`x-lc0-secret` header check on `/move`) and on the backend, closes direct access to it. Unset on both sides preserves current behaviour, so it can be rolled out one service at a time.
  - **CORS wildcard escaping**: `allowed.replace(/\*/g, '.*')` left every `.` in an allow-list entry matching any character, so `https://chess-pu71.vercel.app` also accepted `https://chess-pu71XvercelYapp`. Metacharacters are now escaped.
  - **`.env` untracked**: it was committed before `/.env` was added to `.gitignore`, so the ignore rule never applied. The contents are only the Firebase *web* config, which is public by design and ships inside the JS bundle anyway, so nothing leaked — but the file is now removed from tracking (`git rm --cached .env`) so a real secret cannot land there later. `.env.example` and `.env.production.example` stay tracked as templates; Vercel reads its values from `vercel.json`, so no build depends on the removed file.
  - **Files**: `backend-src/utils/demoAuth.ts` (new), `middleware/auth.ts`, `sockets/gameSocket.ts`, `app.ts`, `routes/analysis.ts`, `routes/gameHistory.ts`, `config/cors.ts`, `lc0-server/server.js`.

### Fixed
- **Correctness, data-integrity and CI pass** (2026-09-13)
  - **Board froze after undoing out of a finished game**: `undoMove` cleared `gameResult` but never released `gameEndedRef`, which `makeMove` consults — so the result banner cleared, the Undo button re-enabled, and every subsequent move was silently rejected. `undoMove`/`redoMove` now release the latch, and both stop cleanly at a synthetic variant move instead of throwing.
  - **Black's first turn was untimed**: the local clock only started once `newHistory.length > 1`, so the first move was played with no clock running and no time deducted. Now `>= 1`.
  - **Online games ended silently when the database was unavailable**: `endGame` returned early when `room.gameId` was undefined (a failed `createRoom` insert), so checkmate, resignation, timeout and agreed draws never reached either client. The `gameEnded` emit now happens before any database work, and a failed write costs history rather than the game.
  - **Local human-vs-human games were always saved as a win**: `saveGameToHistory` hard-coded `gameOutcome = 'win'`. Outcome is now relative to the colour the signed-in player is recorded as playing (the server-assigned colour in online games, the non-AI colour in AI games, and White for local hot-seat games), and profile statistics use the same rule so history and stats agree.
  - **Every finished game was posted twice in development**: the history POST, the stats update and the `gameEndedRef` write all ran inside `setGameState` updaters, which React StrictMode invokes twice. All side effects moved out of the updaters in `makeMove`, the clock-expiry path and the socket game-ended handler; the clock interval now reads latest state from a ref.
  - **Duplicate history rows**: `saveGame` had no idempotency key, so a retry — or the two client paths — wrote the game again. `ON CONFLICT (player_id, game_id) DO UPDATE` plus a unique index (`game_history_player_game_unique`) makes it one row; a database predating the index falls back to a plain insert (42P10) rather than losing games.
  - **Online results were counted twice**: the server's `endGame` writes `users.stats` and the client PATCHed the same counters. The client now skips its own stats update for online games.
  - **Nuke and teleport could leave your own king capturable**: both rewrite the position by hand, so nothing validated king safety — you could teleport your king next to a queen or nuke the only blocker between a rook and your own king. Both are now refused if they expose the mover's king, and both are unavailable once the game is over.
  - **The offline AI was close to useless**: `PIECE_VALUES` keyed White as uppercase but chess.js always returns lowercase `piece.type`, so every piece scored positive — the engine *avoided* captures (they lower total material) and *preferred* promotions, with no search at all. Rewritten as a colour-aware material evaluation with negamax + alpha-beta (captures/promotions ordered first), depth 2–4, and a node budget. It now plays mate in one, takes hanging pieces and declines defended ones.
  - **The online board sent unvalidated moves**: the drag-and-drop path emitted any drop — illegal moves, the opponent's pieces — and reported success. Validated locally against the current position first.
  - **`db/*.sql` never reached production**: `tsc` does not copy non-TS files, so `initializeTables` always fell back to the reduced inline schema and the indexes/trigger declared in `db/schema.sql` had never run. `scripts/copy-assets.js` now copies them into `dist/`; the statement splitter is dollar-quote aware (a naive `split(';')` tore the PL/pgSQL function body apart), and every `CREATE TRIGGER` is preceded by a `DROP TRIGGER IF EXISTS` — shipping the schemas exposed two more non-idempotent triggers (`update_h2h_updated_at`, plus four in `analytics-schema.sql`) that would have failed with 42710 on the second boot.
  - **The duplicate-collapse migration is self-healing**: `initializeTables` collapses duplicate `(player_id, game_id)` rows *before* the schema tries to add the unique index, so an existing database that already contains duplicates no longer needs a manual cleanup before the protection can land. It runs only while the index is missing, keeps the oldest row of each pair, and uses a window function rather than a self-join so it stays O(n log n) on a table with no index on those columns.
  - **LC0 search desync on timeout**: an abandoned `go` left the engine searching, and its late `bestmove` would be consumed by the *next* request — answering the wrong position. A timeout now sends `stop` and drains the reply.
  - **`gameDuration` was always ~0**: seconds were divided by 1000.
  - **Premoves disabled**: the flag advertised a feature that could not work — react-chessboard files a drop as a premove only when `onPieceDrop` accepts it or the board is mid-animation, which conflicts with rejecting out-of-turn drops. Flag set to `false` with the reason recorded, and the unused `src/hooks/usePremove.ts` removed.
  - **Misc**: `requestHint` used a backend URL with no localhost fallback; `/api/chess/move` answered `400 Invalid difficulty` when no engine was loaded (now `503`); deprecated `substr` replaced with `slice`.
  - **CI actually checks things**: `npm run lint` and `npm run typecheck` did not exist as scripts, and both steps carried `continue-on-error`/`|| true`, so nothing was enforced. `typecheck` is now blocking, `test:backend`/`build:backend` added, a `backend` job builds and tests `backend-src`, and lint is explicitly documented as non-blocking until the pre-existing test-suite lint errors are cleared.
  - **Files**: `src/contexts/GameContext.tsx`, `src/hooks/useChessVariants.ts`, `src/components/ChessBoard/ChessBoard.tsx`, `src/utils/chessAI.ts`, `src/config/gameFeatures.ts`, `src/contexts/AuthContext.tsx`, `backend-src/sockets/gameSocket.ts`, `models/GameHistory.ts`, `db/schema.sql`, `app.ts`, `middleware/auth.ts`, `routes/analysis.ts`, `lc0-server/server.js`, `package.json`, `.github/workflows/ci.yml`, `scripts/copy-assets.js` (new).
  - **Tests**: frontend 265 passing across 22 suites; backend 93 across 8 suites (new `backend-src/__tests__/` harness: jest + ts-jest + supertest, with `app.ts` split out of `server.ts` so routes can be exercised without opening a port). Five of those run against a real Postgres (`migration.integration.test.ts`, skipped unless `TEST_DATABASE_URL` is set) — mocked tests only prove the code asks for the right thing, and every statement in `db/*.sql` is only proved correct by being executed. The CI `backend` job provisions a `postgres:16-alpine` service so they run on every push.

- **Codebase hardening & refactor** - Correctness, type safety, and maintainability pass (2026-05-31)
  - **Restored frontend type safety**: the root `tsconfig.json` was a misplaced backend config that *excluded* all React source (components, contexts, hooks, `App.tsx`) from type-checking, so the app shipped with no real type enforcement. Replaced it with a proper CRA config; re-enabling type-checking surfaced and fixed real latent bugs:
    - Online player names: socket handlers compared non-existent `colorAssignment.player1/.player2` props to `'w'`, so both names resolved to the black player. Now read `colorAssignment.white`.
    - `clearAllGameData` produced an incomplete `GameState` (missing the hint/nuke/teleport fields), crashing downstream reads — completed it.
    - `GameReplay` tested the `void` return of chess.js v1 `loadPgn()` for truthiness — rewritten to use its throw-on-invalid behavior.
    - Removed dead `src/engines/` (imported a non-existent `node-fetch` dependency).
  - **Repaired the test suite**: 14 of 17 suites were failing (99 failing tests). Now **17/17 suites, 207 tests green**. Added a shared typed `GameState`/`GameContext` mock factory (`src/test-utils/mockGameState.ts`), a `scrollIntoView` jsdom polyfill, and a working Jest ESM config (the old `jest.config.js` was dead — CRA reads `package.json`'s `jest` key); fixed provider/mocking gaps and stale assertions across every suite.
  - **Centralized logging**: introduced leveled loggers for backend (`backend-src/utils/logger.ts`) and frontend (`src/utils/logger.ts`), replacing ~590 ad-hoc `console.*` calls; production logs are quiet by default and controllable via `LOG_LEVEL`.
  - **Backend cleanup**: deduplicated the copy-pasted Socket.IO/Express CORS validator into `backend-src/config/cors.ts`; replaced verbose per-route logging with a route table.
  - **Slimmed `GameContext`** (1,746 → 1,553 lines) by extracting nuclear-chess + teleportation into `src/hooks/useChessVariants.ts` (public API unchanged); shared the 64-square `ALL_SQUARES` constant via `src/utils/chessSquares.ts`.
  - **Removed ~2 MB of cruft**: committed `.log` files, `test-results.json`, duplicate `package.*.json`, and the dead `jest.config.js`; added them to `.gitignore`.

### Added
- **Chess Variants System** - Nuclear chess, teleportation, and feature toggle management (2025-08-23)
  - **Feature**: Comprehensive special moves system with easy management via feature toggles
  - **Nuclear Chess**: Integrated from nuclear-chess branch - destroy opponent pieces (excluding King/Queen) once per game
  - **Teleportation**: New variant allowing pieces to randomly relocate to empty squares once per game  
  - **Feature Toggles**: Centralized configuration system for easy feature removal or testing
  - **Justification**: Users requested exciting chess variants while maintaining ability to revert to traditional chess experience
  - **Implementation**:
    - Created `/src/config/gameFeatures.ts` for centralized feature management with boolean flags
    - Enhanced GameContext with nuclear and teleportation state management and validation functions
    - Updated GameControls with color-coded variant UI (orange nuclear, purple teleportation, green hints)
    - Modified ChessBoard to handle special move interactions with visual feedback systems
    - All variants restricted to human-vs-human games, first 10 moves, one use per player
    - Build-time optimization removes disabled features from bundle for performance
  - **Files Added/Modified**:
    - `src/config/gameFeatures.ts` - NEW: Central feature management configuration
    - `src/contexts/GameContext.tsx` - Added nuclear/teleportation state and game logic
    - `src/components/GameControls/GameControls.tsx` - Added variant-specific UI components
    - `src/components/ChessBoard/ChessBoard.tsx` - Enhanced board interactions for special moves
    - `CLAUDE.md` - Updated documentation for Phase 11: Chess Variants & Special Moves
  - **User Experience**: Players can now use exciting chess variants for casual fun, with easy toggle system allowing administrators to disable features for tournaments or traditional play

- **AI vs AI Game Mode** - Watch computer players compete against each other (2025-08-04)
  - **Feature**: Added new game mode where users can watch AI play against itself with different difficulty levels
  - **Justification**: Users wanted to observe high-level chess gameplay and learn from AI strategies without having to play themselves
  - **Implementation**: 
    - Added 'ai-vs-ai' game mode type to GameContext with separate difficulty settings for white and black AI
    - Implemented automatic move scheduling system that alternates between white and black AI moves
    - Added pause/resume functionality to control the AI game flow
    - Enhanced GameModeSelector with separate difficulty controls for each AI player
    - Added dedicated AI vs AI controls in GameControls component with pause/resume buttons
    - AI moves are scheduled with 2-second delays for better viewing experience
    - Supports all 5 difficulty levels (Beginner ~800 to Expert ~3400+ ELO) for each AI
  - **Files Added/Modified**:
    - `src/contexts/GameContext.tsx` - Added AI vs AI game logic, state management, and move scheduling
    - `src/components/GameModeSelector/GameModeSelector.tsx` - Added AI vs AI mode selection with dual difficulty controls
    - `src/components/GameControls/GameControls.tsx` - Added pause/resume controls for AI games
  - **User Experience**: Users can now select different difficulty combinations (e.g., Expert vs Beginner) and watch AI games unfold, learning strategies and opening patterns from high-level play

### Fixed
- **Vercel Preview URL CORS Issues** - Fixed NetworkError when accessing app through Vercel preview URLs (2025-08-04)
  - **Issue**: Users getting "NetworkError when attempting to fetch resource" and CORS errors when trying to sign in with Google from Vercel preview URLs like `chess-pu71-git-master-caspars-projects-ada039ca.vercel.app`
  - **Root Cause**: Railway backend CORS was configured to only accept requests from the main production domain `chess-pu71.vercel.app`, blocking all preview deployment URLs
  - **Solution**: Enhanced backend CORS configuration to support multiple origins with wildcard patterns, allowing both production and preview URLs
  - **Files Changed**: 
    - `backend-src/server.ts` - Modified CORS configuration to accept comma-separated origins with wildcard support
    - `CLAUDE.md` - Added troubleshooting section explaining the issue and recommended URL usage
  - **Justification**: Users often access the app through preview URLs during development/testing, and authentication failures create confusion. This fix ensures the app works from any Vercel deployment URL while maintaining security

- **Game Replay PGN Parsing Errors** - Fixed "Unable to parse PGN" errors preventing game replay viewing (2025-08-04)
  - **Issue**: Users getting "Failed to load game replay: Unable to parse PGN" error when trying to view saved games, with PGN preview showing standard chess headers like `[Event "?"] [Site "?"]`
  - **Root Cause**: The GameReplay component's PGN parsing logic couldn't handle standard chess.js PGN format which includes metadata headers. The parsing would fail when encountering these headers, even though the move data was present
  - **Solution**: Enhanced PGN parsing with multiple fallback approaches and improved PGN generation to create cleaner formats
  - **Technical Details**:
    - Improved header removal regex to properly strip `[Event "?"]` style metadata while preserving moves
    - Enhanced cleaning logic to handle various PGN formats (with/without headers, different whitespace patterns)
    - Modified GameContext PGN generation to create minimal PGNs without unnecessary headers for future games
    - Added comprehensive logging to diagnose parsing failures
    - Added fallback to display final board position even when moves cannot be parsed
  - **Files Changed**: 
    - `src/components/GameReplay/GameReplay.tsx` - Enhanced PGN parsing with better header handling and multiple parsing approaches
    - `src/contexts/GameContext.tsx` - Modified PGN generation to create cleaner format without headers
  - **Justification**: Game replay is a critical feature for learning and analysis. Users were completely unable to review their completed games due to parsing errors, making the feature unusable despite games being properly saved

- **Game Replay Move History** - Fixed issue where saved games were not showing complete move history (2025-01-27)
  - **Issue**: When replaying saved games, only the last few moves or no moves at all were being displayed, despite games having many more moves
  - **Root Cause**: The PGN generation logic in `GameContext.tsx` was using `gameState.game.pgn()` which often didn't contain the complete game history. This happened because the chess.js game object was sometimes recreated from FEN positions during moves, losing the historical move context
  - **Solution**: Modified PGN generation to always reconstruct the complete game from `gameState.history` array which maintains the full move list throughout the game
  - **Files Changed**: 
    - `src/contexts/GameContext.tsx` - Rewrote PGN generation logic to use gameState.history as primary source
    - `src/components/GameReplay/GameReplay.tsx` - Made regex parsing more resilient for older games
  - **Justification**: Users were unable to review their complete games, which is essential for learning and analysis. This fix ensures all moves are properly saved and can be replayed

## [1.0.0] - 2025-01-27

### Added
- **Hero Board Design** - Transformed chess board into prominent hero element
  - **Justification**: Enhanced visual hierarchy and user engagement by making the game board the focal point
  - Increased board size from 500px to 600px
  - Added multi-layered stage effect with elevation
  - Implemented glassmorphism sidebars
  - Added decorative corner pieces

### Enhanced
- **Move History Display** - Expanded capacity and added auto-scrolling
  - **Justification**: Users complained about only seeing 10 moves when games often have 30+ moves
  - Increased display height from ~200px to 600px
  - Added auto-scrolling to keep current move in view
  - Shows move counter when total moves exceed 10

### Added
- **Drag and Drop Movement** - Full drag-and-drop functionality for pieces
  - **Justification**: Modern chess applications support both click and drag movement patterns, improving user experience
  - Implemented alongside existing click-to-move
  - Added visual feedback during drag
  - Turn validation prevents dragging opponent's pieces
  - Enhanced with grab/grabbing cursors

## [0.9.0] - 2025-01-12

### Fixed
- **Game Replay System** - Complete overhaul and bug fixes
  - **Justification**: Critical white screen bug was preventing users from viewing their game history
  - Fixed PGN parsing white screen bug
  - Enhanced with 6-tier parsing fallback system
  - Added comprehensive debug tools
  - Fixed PGN generation to capture complete history

### Added
- **Board Customization** - New visual options
  - **Justification**: Users requested more personalization options to make the game feel more engaging
  - Fixed piece style CSS selectors
  - Added new "Lego" piece style
  - Corrected LC0 ELO rating display

- **Board Orientation** - Flip board functionality
  - **Justification**: Players playing as black wanted to view the board from their perspective
  - Purple flip board button
  - User preference persistence
  - Support for black's perspective

### Removed
- **UI Cleanup** - Removed empty components
  - **Justification**: Streamlined interface by removing non-functional "Players & Statistics" box
  - Cleaner, more focused gameplay experience

## [0.8.1] - 2025-01-09

### Added
- **LC0 Position Analysis** - Expert-level analysis in game replay
  - **Justification**: Players wanted to improve by understanding optimal moves in their completed games
  - LC0-powered move suggestions
  - Visual highlighting of best moves
  - ~3400 ELO strength analysis

## [0.8.0] - 2025-01-09

### Added
- **Statistical Dashboard** - Comprehensive analytics
  - **Justification**: Players wanted to track their improvement and performance over time
  - Win/loss/draw statistics
  - Performance charts
  - Game history analytics

## [0.7.0] - 2025-01-08

### Added
- **Comprehensive Testing Suite** - 104+ tests
  - **Justification**: Ensure stability and catch regressions as the codebase grows
  - Unit tests for components
  - Integration tests
  - Game logic validation

## [0.6.5] - 2025-01-06

### Added
- **Online Multiplayer** - Complete implementation
  - **Justification**: Core feature for playing with friends remotely
  - WebSocket-based real-time gameplay
  - Room system for private games
  - Reconnection support

## [0.6.0] - 2025-01-05

### Fixed
- **Firebase Authentication** - Production fixes
  - **Justification**: Google Sign-In was not working in production deployment
  - Fixed CORS configuration
  - Updated environment variables
  - Resolved Firebase project setup

## [0.5.0] - 2025-01-04

### Added
- **Deployment** - Production infrastructure
  - **Justification**: Make the app publicly accessible
  - Frontend on Vercel
  - Backend on Railway
  - Database on PostgreSQL

## [0.4.0] - 2025-01-03

### Added
- **Online Multiplayer** - Initial implementation
  - **Justification**: Enable remote play between users
  - Database integration
  - Game persistence
  - Basic room system

## [0.3.5] - 2025-01-02

### Added
- **User Authentication** - Firebase/Google integration
  - **Justification**: Required for personalized features and online play
  - Google Sign-In
  - User profiles
  - Authentication flow

## [0.3.0] - 2025-01-01

### Added
- **Computer Opponent** - LC0 integration
  - **Justification**: Allow single-player gameplay against world-class AI
  - ~3400 ELO strength
  - 5 difficulty levels
  - Neural network based

## [0.2.0] - 2024-12-30

### Added
- **Core Chess Functionality** - Complete chess engine
  - **Justification**: Foundation for all gameplay features
  - Move validation
  - Game state management
  - Chess rules implementation

## [0.1.0] - 2024-12-28

### Added
- **Initial MVP** - Basic chess board
  - **Justification**: Starting point for the application
  - React setup
  - Board rendering
  - Basic piece movement