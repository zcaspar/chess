import { Chess, Move } from 'chess.js';

type DifficultyLevel = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

interface AISettings {
  depth: number;
  randomness: number; // 0-100, higher = more random
}

const DIFFICULTY_SETTINGS: Record<DifficultyLevel, AISettings> = {
  beginner: { depth: 1, randomness: 40 },
  easy: { depth: 2, randomness: 25 },
  medium: { depth: 3, randomness: 15 },
  hard: { depth: 4, randomness: 5 },
  expert: { depth: 5, randomness: 1 }
};

// Basic piece values
const PIECE_VALUES = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
  P: -100, N: -320, B: -330, R: -500, Q: -900, K: -20000
};

/**
 * Simple Chess AI for frontend use
 * For advanced AI features, use the backend API
 */
export class SimpleChessAI {
  private difficulty: DifficultyLevel;
  private settings: AISettings;

  constructor(difficulty: DifficultyLevel = 'medium') {
    this.difficulty = difficulty;
    this.settings = DIFFICULTY_SETTINGS[difficulty];
  }

  async getBestMove(game: Chess): Promise<Move | null> {
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return null;

    // For beginner level, just pick a random move
    if (this.difficulty === 'beginner') {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // Simple evaluation with minimal depth
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves.slice(0, Math.min(20, moves.length))) {
      const gameCopy = new Chess(game.fen());
      gameCopy.move(move);
      
      const score = this.evaluatePosition(gameCopy);
      
      // Add randomness based on difficulty
      const randomFactor = (Math.random() - 0.5) * this.settings.randomness;
      const adjustedScore = score + randomFactor;
      
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestMove = move;
      }
    }

    return bestMove;
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
    
    // Count material
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece) {
          score += PIECE_VALUES[piece.type as keyof typeof PIECE_VALUES] || 0;
        }
      }
    }

    return score;
  }

  setDifficulty(difficulty: DifficultyLevel): void {
    this.difficulty = difficulty;
    this.settings = DIFFICULTY_SETTINGS[difficulty];
  }
}

// Legacy export for compatibility
export const ChessAI = SimpleChessAI;