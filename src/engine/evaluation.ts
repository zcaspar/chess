import type { EngineScore } from './uci';

/**
 * Turning engine scores into things a player can read: who is better and by
 * how much, how costly a move was, and an accuracy figure for the game.
 */

/** An evaluation from White's point of view, whoever is to move. */
export type Evaluation =
  | { type: 'cp'; cp: number }
  | { type: 'mate'; in: number; winner: 'w' | 'b' };

/** Convert an engine score (side to move's view) to White's view. */
export const toEvaluation = (score: EngineScore, turn: 'w' | 'b'): Evaluation => {
  if (score.type === 'cp') {
    return { type: 'cp', cp: turn === 'w' ? score.value : -score.value };
  }
  // `mate N`: positive means the side to move mates; zero means the side to
  // move has already been mated.
  const moverWins = score.value > 0;
  const winner: 'w' | 'b' = moverWins === (turn === 'w') ? 'w' : 'b';
  return { type: 'mate', in: Math.abs(score.value), winner };
};

/**
 * White's expected score as a percentage (0-100).
 *
 * Centipawns are a poor measure of how much a move matters — losing a pawn
 * when already a queen up changes nothing. This is the logistic curve Lichess
 * fits to real game outcomes, which is what move quality is judged on below.
 */
export const winPercent = (evaluation: Evaluation): number => {
  if (evaluation.type === 'mate') {
    return evaluation.winner === 'w' ? 100 : 0;
  }
  const cp = Math.max(-1000, Math.min(1000, evaluation.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
};

/** Expected score for one side, as a percentage. */
export const winPercentFor = (evaluation: Evaluation, color: 'w' | 'b'): number => {
  const white = winPercent(evaluation);
  return color === 'w' ? white : 100 - white;
};

/** "+1.3", "-0.4", "0.0", "M5" (White mates in 5), "-M3" (Black mates in 3). */
export const formatEvaluation = (evaluation: Evaluation): string => {
  if (evaluation.type === 'mate') {
    const sign = evaluation.winner === 'w' ? '' : '-';
    return evaluation.in === 0 ? `${sign}#` : `${sign}M${evaluation.in}`;
  }
  const pawns = evaluation.cp / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
};

export type MoveQuality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** Expected-score points (out of 100) a move must cost to earn each label. */
export const QUALITY_THRESHOLDS = { inaccuracy: 5, mistake: 10, blunder: 15 } as const;

/**
 * Label a move by how much of the mover's expected score it gave away.
 * `playedBest` is true when the move is the engine's own first choice.
 */
export const classifyMove = (winDrop: number, playedBest: boolean): MoveQuality => {
  if (winDrop >= QUALITY_THRESHOLDS.blunder) return 'blunder';
  if (winDrop >= QUALITY_THRESHOLDS.mistake) return 'mistake';
  if (winDrop >= QUALITY_THRESHOLDS.inaccuracy) return 'inaccuracy';
  return playedBest ? 'best' : 'good';
};

/**
 * Accuracy of a single move (0-100) from the expected score it cost, using
 * the curve Lichess publishes. A move that costs nothing scores 100.
 */
export const moveAccuracy = (winDrop: number): number => {
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, winDrop)) - 3.1669;
  return Math.max(0, Math.min(100, raw));
};

export const QUALITY_LABEL: Record<MoveQuality, string> = {
  best: 'Best move',
  good: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/** Annotation glyphs as used in chess notation; none for ordinary moves. */
export const QUALITY_SYMBOL: Record<MoveQuality, string> = {
  best: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};
