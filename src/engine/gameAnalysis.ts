import { Chess, Square } from 'chess.js';
import {
  Evaluation,
  MoveQuality,
  classifyMove,
  moveAccuracy,
  winPercentFor,
} from './evaluation';
import { splitUciMove } from './uci';
import type { StockfishEngine } from './stockfishEngine';

/**
 * Whole-game review: evaluate every position of a game and say, move by move,
 * what it cost and what the engine would have played instead.
 */

/** The minimum a move needs for review; chess.js `Move` objects satisfy it. */
export interface ReviewMove {
  from: string;
  to: string;
  promotion?: string;
  san: string;
}

export interface PositionVerdict {
  /** From White's point of view. */
  evaluation: Evaluation;
  /** The engine's choice in UCI notation; null when there are no legal moves. */
  bestMove: string | null;
}

export interface PlyReview {
  /** 0-based index into the game's move list. */
  ply: number;
  color: 'w' | 'b';
  san: string;
  evalBefore: Evaluation;
  evalAfter: Evaluation;
  /** What the engine would have played, when it differs from the game move. */
  bestMoveUci: string | null;
  bestMoveSan: string | null;
  playedBest: boolean;
  /** Expected-score points (0-100) the mover gave away. */
  winDrop: number;
  quality: MoveQuality;
  accuracy: number;
}

export interface SideSummary {
  /** Average move accuracy, 0-100; null for a side that never moved. */
  accuracy: number | null;
  moves: number;
  best: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
}

export interface GameReview {
  /** Evaluation of every position: index 0 is the start, i+1 is after ply i. */
  evaluations: Evaluation[];
  plies: PlyReview[];
  white: SideSummary;
  black: SideSummary;
}

export interface ReviewOptions {
  /** Called after each position, with how many of `total` are done. */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Judges one position. The engine in production; a stub in tests. */
export type PositionJudge = (fen: string, signal?: AbortSignal) => Promise<PositionVerdict>;

/** The verdict for a finished position, which needs no engine; else null. */
export const terminalVerdict = (fen: string): PositionVerdict | null => {
  const position = new Chess(fen);
  if (position.isCheckmate()) {
    // The side to move has been mated.
    return {
      evaluation: { type: 'mate', in: 0, winner: position.turn() === 'w' ? 'b' : 'w' },
      bestMove: null,
    };
  }
  if (position.isStalemate() || position.isInsufficientMaterial()) {
    return { evaluation: { type: 'cp', cp: 0 }, bestMove: null };
  }
  return null;
};

/** A judge backed by the engine, searching every position to `depth`. */
export const engineJudge =
  (engine: StockfishEngine, depth: number): PositionJudge =>
  async (fen, signal) => {
    const terminal = terminalVerdict(fen);
    if (terminal) return terminal;
    const result = await engine.analyse(fen, { depth, signal });
    const line = result.lines[0];
    if (!line) throw new Error('The engine returned no evaluation');
    return { evaluation: line.evaluation, bestMove: result.bestMove ?? line.pv[0] ?? null };
  };

const toUci = (move: ReviewMove): string => `${move.from}${move.to}${move.promotion ?? ''}`;

const sanOf = (fen: string, uci: string | null): string | null => {
  const parts = uci ? splitUciMove(uci) : null;
  if (!parts) return null;
  try {
    return new Chess(fen).move({
      from: parts.from as Square,
      to: parts.to as Square,
      promotion: parts.promotion,
    }).san;
  } catch {
    return null;
  }
};

const summarise = (plies: PlyReview[], color: 'w' | 'b'): SideSummary => {
  const own = plies.filter((ply) => ply.color === color);
  const count = (quality: MoveQuality) => own.filter((ply) => ply.quality === quality).length;
  return {
    accuracy: own.length
      ? own.reduce((sum, ply) => sum + ply.accuracy, 0) / own.length
      : null,
    moves: own.length,
    best: count('best'),
    inaccuracies: count('inaccuracy'),
    mistakes: count('mistake'),
    blunders: count('blunder'),
  };
};

/**
 * Review a game played from the standard starting position.
 *
 * Every position is judged once (n moves need n + 1 evaluations); a move's
 * cost is the difference between the positions either side of it, measured in
 * the mover's expected score rather than in centipawns.
 */
export const reviewGame = async (
  moves: ReviewMove[],
  judge: PositionJudge,
  options: ReviewOptions = {},
): Promise<GameReview> => {
  const { onProgress, signal } = options;

  // Replay first, so an unplayable move list fails before any engine time is spent.
  const board = new Chess();
  const fens = [board.fen()];
  moves.forEach((move) => {
    board.move({ from: move.from as Square, to: move.to as Square, promotion: move.promotion });
    fens.push(board.fen());
  });

  const verdicts: PositionVerdict[] = [];
  for (let i = 0; i < fens.length; i += 1) {
    if (signal?.aborted) {
      const error = new Error('Review was cancelled');
      error.name = 'AbortError';
      throw error;
    }
    verdicts.push(await judge(fens[i], signal));
    onProgress?.(i + 1, fens.length);
  }

  const plies: PlyReview[] = moves.map((move, ply) => {
    const color: 'w' | 'b' = ply % 2 === 0 ? 'w' : 'b';
    const before = verdicts[ply];
    const after = verdicts[ply + 1];
    const playedUci = toUci(move);
    const playedBest = before.bestMove === null || before.bestMove === playedUci;
    // The engine's own move cannot be a mistake: any dip after it is search
    // noise between two depths, not something the player gave away.
    const winDrop = playedBest
      ? 0
      : Math.max(0, winPercentFor(before.evaluation, color) - winPercentFor(after.evaluation, color));

    return {
      ply,
      color,
      san: move.san,
      evalBefore: before.evaluation,
      evalAfter: after.evaluation,
      bestMoveUci: playedBest ? null : before.bestMove,
      bestMoveSan: playedBest ? null : sanOf(fens[ply], before.bestMove),
      playedBest,
      winDrop,
      quality: classifyMove(winDrop, playedBest),
      accuracy: moveAccuracy(winDrop),
    };
  });

  return {
    evaluations: verdicts.map((verdict) => verdict.evaluation),
    plies,
    white: summarise(plies, 'w'),
    black: summarise(plies, 'b'),
  };
};

/** A principal variation as SAN, for display. Stops at the first illegal move. */
export const pvToSan = (fen: string, pv: string[], maxMoves = 8): string[] => {
  const board = new Chess(fen);
  const san: string[] = [];
  for (const uci of pv.slice(0, maxMoves)) {
    const parts = splitUciMove(uci);
    if (!parts) break;
    try {
      san.push(
        board.move({ from: parts.from as Square, to: parts.to as Square, promotion: parts.promotion }).san,
      );
    } catch {
      break;
    }
  }
  return san;
};
