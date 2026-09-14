import { Chess, Move } from 'chess.js';
import { BackendAI, DifficultyLevel } from './backendAI';
import { logger } from './logger';

// Re-export so consumers can import the type alongside ChessAI from this module
export type { DifficultyLevel } from './backendAI';

const backendAI = new BackendAI();

interface AISettings {
  depth: number;
  randomness: number; // 0-100, higher = more random
}

/** Shared, decrementing allowance of positions the search may examine. */
interface SearchBudget {
  nodes: number;
}

/**
 * Search depth per level.
 *
 * Modest on purpose. This is the offline fallback: the real strength comes from
 * LC0 through the backend, and generating legal moves in chess.js costs about a
 * millisecond, so each extra ply multiplies a browser's waiting time by the
 * branching factor. Beginner never reaches the search at all (it plays a random
 * move), and the `randomness` term below separates the levels further.
 */
const DIFFICULTY_SETTINGS: Record<DifficultyLevel, AISettings> = {
  beginner: { depth: 1, randomness: 40 },
  easy: { depth: 1, randomness: 25 },
  medium: { depth: 2, randomness: 15 },
  hard: { depth: 3, randomness: 5 },
  expert: { depth: 4, randomness: 1 }
};

/**
 * Children examined per node once the search is two or more plies from the
 * leaves. Nodes one ply out still consider every reply, because that is where
 * "is this piece actually defended?" is decided — and those nodes cost only a
 * material count per child. Capping them all is what keeps the deeper levels
 * inside a browser-sized time budget.
 */
const MAX_BRANCH = 6;

/**
 * Centipawn piece values, keyed by chess.js's lowercase piece type.
 *
 * Colour is applied separately (see materialBalance) — the previous table had
 * White as UPPERCASE keys and Black as lowercase, but chess.js always reports
 * `piece.type` in lowercase, so the uppercase half was unreachable and every
 * piece on the board scored positive regardless of who owned it.
 */
const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
};

/** Score for a position that is checkmate; far above any material swing. */
const MATE_SCORE = 100000;

/**
 * Ceiling on positions examined per move decision.
 *
 * The fallback runs in the browser, so a deep search has to degrade into a
 * shallower one rather than freeze the tab. Small enough to stay responsive,
 * large enough that the difficulty depths below are not truncated in normal
 * positions.
 */
const NODE_BUDGET = 40000;

/**
 * Simple Chess AI for frontend use
 * For advanced AI features, use the backend API
 */
/** Which engine actually produced the most recent move. */
export type MoveSource = 'lc0' | 'fallback';

export class SimpleChessAI {
  private difficulty: DifficultyLevel;
  private settings: AISettings;
  private lastMoveSource: MoveSource = 'lc0';

  constructor(difficulty: DifficultyLevel = 'medium') {
    this.difficulty = difficulty;
    this.settings = DIFFICULTY_SETTINGS[difficulty];
  }

  /**
   * Engine behind the last move returned by getBestMove().
   *
   * The fallback is far weaker than LC0, so a silent switch reads as "the
   * computer suddenly got bad" rather than "the engine is unreachable". The UI
   * uses this to say so out loud.
   */
  getLastMoveSource(): MoveSource {
    return this.lastMoveSource;
  }

  async getBestMove(game: Chess): Promise<Move | null> {
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return null;

    // Try backend AI first (for stronger play)
    try {
      const backendMove = await backendAI.getBestMove(game.fen(), this.difficulty);
      if (backendMove) {
        logger.debug(`🎯 Using backend AI for ${this.difficulty} difficulty`);
        this.lastMoveSource = 'lc0';
        return backendMove;
      }
    } catch (error) {
      logger.debug('Backend AI unavailable, using frontend AI');
    }

    // Fallback to frontend AI
    logger.debug(`🎲 Using frontend AI for ${this.difficulty} difficulty`);
    this.lastMoveSource = 'fallback';

    // For beginner level, just pick a random move
    if (this.difficulty === 'beginner') {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    const budget: SearchBudget = { nodes: NODE_BUDGET };
    const depth = this.settings.depth;

    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of this.orderMoves(moves)) {
      game.move({ from: move.from, to: move.to, promotion: move.promotion });
      let score: number;
      try {
        // Full window at the root: the random term below is added after the
        // search, so pruning here would let a jittered score promote a move
        // the search had already proved inferior.
        score = -this.search(game, depth - 1, -Infinity, Infinity, budget);
      } finally {
        game.undo();
      }

      // Randomness weakens the lower levels: a neural net (or a deep search)
      // is strong even at low node counts, so jitter is what separates them.
      score += (Math.random() - 0.5) * this.settings.randomness;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  /**
   * Material balance in centipawns, positive when White is ahead.
   *
   * Unlike its predecessor this is colour-aware, so a capture is always scored
   * as a gain for the side making it.
   */
  private materialBalance(game: Chess): number {
    let score = 0;

    for (const row of game.board()) {
      for (const piece of row) {
        if (!piece) continue;
        const value = PIECE_VALUES[piece.type] ?? 0;
        score += piece.color === 'w' ? value : -value;
      }
    }

    return score;
  }

  /**
   * Material balance from the point of view of the side to move.
   *
   * Deliberately cheap. The obvious version of this called isDraw() (and so
   * isStalemate(), which generates every legal move) at *every* leaf, which
   * dominated the search: the fallback was spending ~20s on the opening move.
   * Terminal positions are detected by the caller instead, which only happens
   * once per node with no legal moves.
   */
  private evaluateForSideToMove(game: Chess): number {
    const balance = this.materialBalance(game);
    return game.turn() === 'w' ? balance : -balance;
  }

  /** Score a position in which the side to move has no legal moves. */
  private evaluateTerminal(game: Chess): number {
    // Checkmate is fatal for the side to move; every other terminal position
    // (stalemate, insufficient material, repetition) is a draw.
    return game.isCheckmate() ? -MATE_SCORE : 0;
  }

  /**
   * Negamax with alpha-beta pruning, scored from the side to move.
   *
   * A single-ply "which capture is biggest" evaluation is not enough on its
   * own — it happily takes a defended pawn with a rook, because it never sees
   * the recapture. One reply ply is what makes a capture look like a mistake.
   */
  private search(
    game: Chess,
    depth: number,
    alpha: number,
    beta: number,
    budget: SearchBudget,
  ): number {
    if (depth <= 0 || budget.nodes <= 0) {
      return this.evaluateForSideToMove(game);
    }
    budget.nodes -= 1;

    const moves = game.moves({ verbose: true });
    if (moves.length === 0) {
      return this.evaluateTerminal(game);
    }

    const ordered = this.orderMoves(moves);
    const width = depth >= 2 ? Math.min(ordered.length, MAX_BRANCH) : ordered.length;

    let best = -Infinity;

    for (let i = 0; i < width; i += 1) {
      const move = ordered[i];
      game.move({ from: move.from, to: move.to, promotion: move.promotion });
      let score: number;
      try {
        score = -this.search(game, depth - 1, -beta, -alpha, budget);
      } finally {
        game.undo();
      }

      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }

    return best;
  }

  /** Captures and promotions first: alpha-beta prunes far more with them. */
  private orderMoves(moves: Move[]): Move[] {
    const weight = (move: Move): number =>
      (move.captured ? PIECE_VALUES[move.captured] ?? 0 : 0) * 10 +
      (move.promotion ? PIECE_VALUES[move.promotion] ?? 0 : 0);

    return [...moves].sort((a, b) => weight(b) - weight(a));
  }

  setDifficulty(difficulty: DifficultyLevel): void {
    this.difficulty = difficulty;
    this.settings = DIFFICULTY_SETTINGS[difficulty];
  }

  getEngineType(): string {
    return 'lc0'; // Indicates we use backend LC0 when available
  }

  async initializeLc0(): Promise<void> {
    // For frontend AI, this is a no-op since we delegate to backend
    logger.debug('Frontend AI initialized (uses backend LC0)');
  }
}

// Legacy export for compatibility — re-export the class (value + type) as ChessAI
export { SimpleChessAI as ChessAI };