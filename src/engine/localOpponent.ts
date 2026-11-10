import { Chess, Move, Square } from 'chess.js';
import { getEngine } from './stockfishEngine';
import { splitUciMove } from './uci';
import type { DifficultyLevel } from '../utils/backendAI';
import { logger } from '../utils/logger';

/**
 * The in-browser engine as an opponent and as a source of hints.
 *
 * Used when the LC0 server cannot be reached. The previous backup was a
 * material-counting search on the main thread: it froze the page while it
 * thought and played far below any of the advertised levels.
 */

/**
 * Strength per level. "Skill Level" makes Stockfish deliberately pick weaker
 * moves; a shallow search weakens it further at the bottom, and a time budget
 * (not a depth) at the top keeps the wait predictable on slow phones.
 */
const LEVELS: Record<DifficultyLevel, { skillLevel: number; depth?: number; moveTimeMs?: number }> = {
  beginner: { skillLevel: 0, depth: 1 },
  easy: { skillLevel: 3, depth: 3 },
  medium: { skillLevel: 8, depth: 6 },
  hard: { skillLevel: 14, depth: 10 },
  expert: { skillLevel: 20, moveTimeMs: 1000 },
};

const toMove = (fen: string, uci: string | null): Move | null => {
  const parts = uci ? splitUciMove(uci) : null;
  if (!parts) return null;
  try {
    return new Chess(fen).move({
      from: parts.from as Square,
      to: parts.to as Square,
      promotion: parts.promotion,
    });
  } catch {
    return null; // never hand back a move the rules do not allow
  }
};

/** A move from the local engine at the given level, or null if it cannot run. */
export const getLocalEngineMove = async (
  fen: string,
  difficulty: DifficultyLevel,
): Promise<Move | null> => {
  const engine = getEngine();
  if (!engine) return null;
  try {
    return toMove(fen, await engine.play(fen, LEVELS[difficulty]));
  } catch (error) {
    logger.warn('Local engine could not produce a move:', error);
    return null;
  }
};

/** The local engine's best move in a position, for hints. */
export const getLocalEngineHint = async (fen: string): Promise<Move | null> => {
  const engine = getEngine();
  if (!engine) return null;
  try {
    const result = await engine.analyse(fen, { depth: 14 });
    return toMove(fen, result.bestMove);
  } catch (error) {
    logger.warn('Local engine could not produce a hint:', error);
    return null;
  }
};
