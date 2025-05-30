import { Chess, Move } from 'chess.js';

// Simple AI that picks random moves
export class SimpleAI {
  private timeLimit: number;

  constructor(timeLimitMs: number = 1000) {
    this.timeLimit = timeLimitMs;
  }

  async getBestMove(game: Chess): Promise<Move | null> {
    // Add delay to simulate thinking time
    await new Promise(resolve => setTimeout(resolve, Math.random() * this.timeLimit + 200));

    const possibleMoves = game.moves({ verbose: true });
    
    if (possibleMoves.length === 0) {
      return null;
    }

    // For now, just pick a random move
    const randomIndex = Math.floor(Math.random() * possibleMoves.length);
    return possibleMoves[randomIndex];
  }
}

// Future: Stockfish integration will go here
export class StockfishAI {
  private timeLimit: number;
  private depth: number;

  constructor(timeLimitMs: number = 1000, depth: number = 3) {
    this.timeLimit = timeLimitMs;
    this.depth = depth;
  }

  async getBestMove(game: Chess): Promise<Move | null> {
    // Placeholder for Stockfish integration
    // For now, use the simple AI
    const simpleAI = new SimpleAI(this.timeLimit);
    return simpleAI.getBestMove(game);
  }
}

// Main AI interface
export class ChessAI {
  private engine: SimpleAI | StockfishAI;

  constructor(type: 'simple' | 'stockfish' = 'simple', timeLimitMs: number = 1000) {
    if (type === 'stockfish') {
      this.engine = new StockfishAI(timeLimitMs);
    } else {
      this.engine = new SimpleAI(timeLimitMs);
    }
  }

  async getBestMove(game: Chess): Promise<Move | null> {
    return this.engine.getBestMove(game);
  }
}