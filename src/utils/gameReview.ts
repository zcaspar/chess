import { Chess, Square } from 'chess.js';
import type { GameState } from '../contexts/GameContext';
import type { GameHistoryEntry } from '../components/GameReplay/GameReplay';
import { logger } from './logger';

/**
 * Which colour the signed-in player is recorded as having played.
 *
 * An online game knows the colour the server assigned; local games (including
 * human-vs-human on one device) use the convention that the local player is
 * White unless the AI is.
 */
export const getLocalPlayerColor = (
  mode: GameState['gameMode'],
  aiColor: 'w' | 'b' | null,
): 'w' | 'b' => (mode === 'human-vs-ai' && aiColor === 'w' ? 'b' : 'w');

/**
 * Work out who won from the result string.
 *
 * The result is built for humans ("Checkmate! Alice wins!", "Bob wins on
 * time!"), so the only way back to a colour is through the player names. This
 * mirrors the fallback that updateGameStats already uses. Returns undefined for
 * a draw, or when the names are ambiguous.
 */
export const getWinningColor = (
  result: string,
  players: GameState['players'],
  colorAssignment: GameState['colorAssignment'],
): 'w' | 'b' | undefined => {
  const winsAt = result.indexOf(' wins');
  if (winsAt === -1) return undefined;

  const whiteName = players[colorAssignment.white];
  const blackName = players[colorAssignment.black];

  // Identical names (both left as defaults, or deliberately set the same) make
  // the string unreadable; better to report nothing than to guess.
  if (whiteName === blackName) return undefined;

  // Match on the name immediately before "wins" rather than anywhere in the
  // string: the timeout message mentions both players
  // ("Bob wins on time! Alice ran out of time."), so a plain `includes` on each
  // name matches both and resolves nothing.
  const winner = result.slice(0, winsAt);
  const whiteWon = winner.endsWith(whiteName);
  const blackWon = winner.endsWith(blackName);
  if (whiteWon === blackWon) return undefined; // neither, or ambiguous
  return whiteWon ? 'w' : 'b';
};

/** Outcome relative to the colour the local player was playing. */
export const getOutcome = (
  result: string,
  winningColor: 'w' | 'b' | undefined,
  playerColor: 'w' | 'b',
): 'win' | 'loss' | 'draw' => {
  if (result.includes('Draw') || result.includes('draw')) return 'draw';
  if (result.includes('wins') && winningColor) {
    return winningColor === playerColor ? 'win' : 'loss';
  }
  return 'draw';
};

/**
 * Rebuild a PGN from the recorded move list.
 *
 * gameState.game is constructed from a bare FEN on every move, so it carries no
 * history and its own pgn() is empty. The move list is the only complete record.
 * Variant moves (nuke, teleport) are synthetic and not replayable; reconstruction
 * stops at the first one, and the caller falls back to the final position.
 */
export const buildPgnFromHistory = (history: GameState['history']): string => {
  const replay = new Chess();
  let applied = 0;

  for (const move of history) {
    try {
      replay.move({
        from: move.from as Square,
        to: move.to as Square,
        promotion: move.promotion,
      });
      applied += 1;
    } catch {
      logger.debug(`⏭️ Replay stopped at move ${applied + 1} (not a standard move)`);
      break;
    }
  }

  return applied > 0 ? replay.pgn() : '';
};

/**
 * Turn the game that just finished into the shape the replay screen consumes,
 * without a backend round trip.
 *
 * The "Review" button has to work for a guest, for a local human-vs-human game,
 * and immediately — before the asynchronous save to game history has landed —
 * so the entry is built from live state rather than fetched back.
 */
export const buildReviewEntry = (gameState: GameState): GameHistoryEntry => {
  const playerColor =
    gameState.onlineGameRoom?.myColor ??
    getLocalPlayerColor(gameState.gameMode, gameState.aiColor);

  const winningColor = getWinningColor(
    gameState.gameResult,
    gameState.players,
    gameState.colorAssignment,
  );

  const opponentName =
    gameState.gameMode === 'human-vs-ai'
      ? `Computer (${gameState.aiDifficulty})`
      : gameState.onlineGameRoom?.opponentName ??
        gameState.players[
          playerColor === 'w' ? gameState.colorAssignment.black : gameState.colorAssignment.white
        ];

  return {
    // Not a database row; the replay screen only uses id as a React key.
    id: -1,
    gameId: gameState.gameId,
    opponentName,
    playerColor,
    gameResult: gameState.gameResult,
    gameOutcome: getOutcome(gameState.gameResult, winningColor, playerColor),
    finalFen: gameState.game.fen(),
    pgn: buildPgnFromHistory(gameState.history),
    moveCount: gameState.history.length,
    timeControl: gameState.timeControl ?? undefined,
    gameMode: gameState.gameMode === 'human-vs-ai' ? 'human-vs-ai' : 'human-vs-human',
    aiDifficulty:
      gameState.gameMode === 'human-vs-ai' ? gameState.aiDifficulty : undefined,
    createdAt: new Date().toISOString(),
  };
};
