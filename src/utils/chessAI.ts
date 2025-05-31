import { Chess, Move } from 'chess.js';

type DifficultyLevel = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

interface AISettings {
  depth: number;
  randomness: number; // 0-100, higher = more random
  useOpeningBook: boolean;
  evaluationAccuracy: number; // 0-100, lower = more mistakes
}

const DIFFICULTY_SETTINGS: Record<DifficultyLevel, AISettings> = {
  beginner: { depth: 1, randomness: 40, useOpeningBook: false, evaluationAccuracy: 60 },
  easy: { depth: 2, randomness: 25, useOpeningBook: true, evaluationAccuracy: 75 },
  medium: { depth: 3, randomness: 15, useOpeningBook: true, evaluationAccuracy: 85 },
  hard: { depth: 3, randomness: 8, useOpeningBook: true, evaluationAccuracy: 95 }, // Reduced from 4 to 3
  expert: { depth: 4, randomness: 3, useOpeningBook: true, evaluationAccuracy: 98 } // Reduced from 5 to 4
};

// Piece values for evaluation
const PIECE_VALUES = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
  P: -100, N: -320, B: -330, R: -500, Q: -900, K: -20000
};

// Piece-square tables for positional evaluation
const PIECE_SQUARE_TABLES = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
  ]
};


export class AdvancedChessAI {
  private difficulty: DifficultyLevel;
  private settings: AISettings;
  private transpositionTable: Map<string, { score: number; depth: number; bestMove?: Move }> = new Map();

  constructor(difficulty: DifficultyLevel = 'medium') {
    this.difficulty = difficulty;
    this.settings = DIFFICULTY_SETTINGS[difficulty];
  }

  setDifficulty(difficulty: DifficultyLevel) {
    this.difficulty = difficulty;
    this.settings = DIFFICULTY_SETTINGS[difficulty];
    this.transpositionTable.clear();
  }

  async getBestMove(game: Chess): Promise<Move | null> {
    const possibleMoves = game.moves({ verbose: true });
    
    if (possibleMoves.length === 0) {
      return null;
    }

    // Use opening book for early moves if enabled
    if (this.settings.useOpeningBook && game.history().length < 6) {
      const openingMove = this.getOpeningMove(game);
      if (openingMove) {
        return openingMove;
      }
    }

    // Set time limit for AI thinking (max 3 seconds)
    const timeLimit = 3000;
    const startTime = Date.now();

    let bestMove: Move | null = null;
    let bestScore = -Infinity;

    // Evaluate all possible moves with time limit
    for (const move of possibleMoves) {
      // Check time limit
      if (Date.now() - startTime > timeLimit) {
        console.log('AI time limit reached, returning best move found so far');
        break;
      }

      const gameCopy = new Chess(game.fen());
      gameCopy.move(move);
      
      const score = -this.minimax(gameCopy, this.settings.depth - 1, -Infinity, Infinity, false, startTime, timeLimit);
      
      // Add some randomness based on difficulty
      const randomFactor = (Math.random() - 0.5) * this.settings.randomness * 10;
      const adjustedScore = score + randomFactor;

      // Simulate evaluation mistakes for lower difficulties
      const mistake = Math.random() * (100 - this.settings.evaluationAccuracy);
      const finalScore = adjustedScore - mistake;

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestMove = move;
      }
    }

    // Add final randomness - sometimes pick a different good move (only for lower difficulties)
    if (this.settings.randomness > 10 && Math.random() * 100 < this.settings.randomness && bestMove) {
      // Only do this for beginner/easy modes and only do a quick evaluation
      const quickMoves = possibleMoves.slice(0, Math.min(5, possibleMoves.length));
      const randomMove = quickMoves[Math.floor(Math.random() * quickMoves.length)];
      if (randomMove) {
        bestMove = randomMove;
      }
    }

    return bestMove;
  }

  private minimax(game: Chess, depth: number, alpha: number, beta: number, isMaximizing: boolean, startTime?: number, timeLimit?: number): number {
    // Check time limit if provided
    if (startTime && timeLimit && Date.now() - startTime > timeLimit) {
      return this.evaluatePosition(game); // Return current position evaluation if time is up
    }

    const fen = game.fen();
    const cached = this.transpositionTable.get(fen);
    
    if (cached && cached.depth >= depth) {
      return cached.score;
    }

    if (depth === 0 || game.isGameOver()) {
      const score = this.evaluatePosition(game);
      this.transpositionTable.set(fen, { score, depth });
      return score;
    }

    const moves = game.moves({ verbose: true });
    let bestScore = isMaximizing ? -Infinity : Infinity;
    let bestMove: Move | undefined;

    // Move ordering - prioritize captures and checks
    moves.sort((a, b) => this.getMoveOrderScore(b) - this.getMoveOrderScore(a));

    for (const move of moves) {
      // Check time limit before each move evaluation
      if (startTime && timeLimit && Date.now() - startTime > timeLimit) {
        break;
      }

      const gameCopy = new Chess(game.fen());
      gameCopy.move(move);
      
      const score = this.minimax(gameCopy, depth - 1, alpha, beta, !isMaximizing, startTime, timeLimit);
      
      if (isMaximizing) {
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
        alpha = Math.max(alpha, score);
      } else {
        if (score < bestScore) {
          bestScore = score;
          bestMove = move;
        }
        beta = Math.min(beta, score);
      }
      
      if (beta <= alpha) {
        break; // Alpha-beta pruning
      }
    }

    this.transpositionTable.set(fen, { score: bestScore, depth, bestMove });
    return bestScore;
  }

  private evaluatePosition(game: Chess): number {
    if (game.isCheckmate()) {
      return game.turn() === 'w' ? -20000 : 20000;
    }
    
    if (game.isDraw()) {
      return 0;
    }

    let score = 0;
    const board = game.board();

    // Evaluate material and position
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece) {
          const pieceValue = PIECE_VALUES[piece.type as keyof typeof PIECE_VALUES];
          const isWhite = piece.color === 'w';
          
          // Get position value from piece-square table
          const tableIndex = isWhite ? rank * 8 + file : (7 - rank) * 8 + file;
          const pieceType = piece.type.toLowerCase() as keyof typeof PIECE_SQUARE_TABLES;
          const positionValue = PIECE_SQUARE_TABLES[pieceType]?.[tableIndex] || 0;
          
          score += pieceValue + (isWhite ? positionValue : -positionValue);
        }
      }
    }

    // Add bonus for castling rights
    if (game.getCastlingRights('w').k) score += 30;
    if (game.getCastlingRights('w').q) score += 20;
    if (game.getCastlingRights('b').k) score -= 30;
    if (game.getCastlingRights('b').q) score -= 20;

    // Penalize being in check
    if (game.inCheck()) {
      score += game.turn() === 'w' ? -50 : 50;
    }

    // Mobility bonus
    const moves = game.moves().length;
    score += game.turn() === 'w' ? moves * 2 : -moves * 2;

    return game.turn() === 'w' ? score : -score;
  }

  private getMoveOrderScore(move: Move): number {
    let score = 0;
    
    // Prioritize captures
    if (move.captured) {
      const capturedValue = PIECE_VALUES[move.captured as keyof typeof PIECE_VALUES] || 0;
      const capturedBy = PIECE_VALUES[move.piece as keyof typeof PIECE_VALUES] || 0;
      score += Math.abs(capturedValue) - Math.abs(capturedBy) / 10;
    }
    
    // Prioritize promotions
    if (move.promotion) {
      score += 800;
    }
    
    // Prioritize checks (would need additional logic to detect)
    // For now, we'll use a simple heuristic
    
    return score;
  }

  private getOpeningMove(game: Chess): Move | null {
    const history = game.history();
    const possibleMoves = game.moves({ verbose: true });
    
    // First move preferences
    if (history.length === 0) {
      const preferredMoves = ['e2e4', 'd2d4', 'g1f3'];
      for (const moveStr of preferredMoves) {
        const move = possibleMoves.find(m => `${m.from}${m.to}` === moveStr);
        if (move) return move;
      }
    }
    
    // Second move - respond to common openings
    if (history.length === 1) {
      const lastMove = history[0];
      if (lastMove === 'e4') {
        const responses = ['e7e5', 'c7c5', 'e7e6'];
        for (const moveStr of responses) {
          const move = possibleMoves.find(m => `${m.from}${m.to}` === moveStr);
          if (move) return move;
        }
      }
      if (lastMove === 'd4') {
        const responses = ['d7d5', 'g8f6', 'f7f5'];
        for (const moveStr of responses) {
          const move = possibleMoves.find(m => `${m.from}${m.to}` === moveStr);
          if (move) return move;
        }
      }
    }
    
    return null;
  }
}

// Keep simple AI for backwards compatibility
export class SimpleAI {
  private timeLimit: number;

  constructor(timeLimitMs: number = 1000) {
    this.timeLimit = timeLimitMs;
  }

  async getBestMove(game: Chess): Promise<Move | null> {
    await new Promise(resolve => setTimeout(resolve, Math.random() * this.timeLimit + 200));

    const possibleMoves = game.moves({ verbose: true });
    
    if (possibleMoves.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * possibleMoves.length);
    return possibleMoves[randomIndex];
  }
}

// Main AI interface with difficulty levels
export class ChessAI {
  private engine: AdvancedChessAI | SimpleAI;
  private difficulty: DifficultyLevel;

  constructor(difficulty: DifficultyLevel = 'medium', timeLimitMs: number = 1000) {
    this.difficulty = difficulty;
    if (difficulty === 'beginner' && Math.random() < 0.3) {
      // Sometimes use simple random AI for absolute beginners
      this.engine = new SimpleAI(timeLimitMs);
    } else {
      this.engine = new AdvancedChessAI(difficulty);
    }
  }

  setDifficulty(difficulty: DifficultyLevel) {
    this.difficulty = difficulty;
    if (this.engine instanceof AdvancedChessAI) {
      this.engine.setDifficulty(difficulty);
    } else {
      this.engine = new AdvancedChessAI(difficulty);
    }
  }

  getDifficulty(): DifficultyLevel {
    return this.difficulty;
  }

  async getBestMove(game: Chess): Promise<Move | null> {
    return this.engine.getBestMove(game);
  }
}

export type { DifficultyLevel };