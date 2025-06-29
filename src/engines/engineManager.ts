import { LC0Client } from './lc0Client';
import { Chess, Move } from 'chess.js';

export class EngineManager {
  private lc0Client: LC0Client;

  constructor() {
    this.lc0Client = new LC0Client();
  }

  async getBestMove(fen: string, difficulty: string = 'medium'): Promise<Move | null> {
    try {
      // Try LC0 first
      const lc0Move = await this.lc0Client.getMove(fen, difficulty);
      
      if (lc0Move) {
        // Convert LC0 move format to chess.js Move format
        const game = new Chess(fen);
        const move = game.move({
          from: lc0Move.from,
          to: lc0Move.to,
          promotion: lc0Move.uci.length > 4 ? lc0Move.uci[4] : undefined
        });
        
        if (move) {
          console.log(`✅ LC0 move applied: ${move.san} (${lc0Move.uci})`);
          return move;
        }
      }
      
      // Fallback to random move if LC0 fails
      console.log('🎲 LC0 unavailable, using random move fallback');
      return this.getRandomMove(fen);
      
    } catch (error) {
      console.error('Engine manager error:', error);
      return this.getRandomMove(fen);
    }
  }

  private getRandomMove(fen: string): Move | null {
    try {
      const game = new Chess(fen);
      const moves = game.moves({ verbose: true });
      
      if (moves.length === 0) return null;
      
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      console.log(`🎲 Random fallback move: ${randomMove.san}`);
      return randomMove;
      
    } catch (error) {
      console.error('Random move fallback error:', error);
      return null;
    }
  }

  async getEngineStatus(): Promise<{ engine: string; lc0Available: boolean; error: string | null }> {
    const lc0Available = await this.lc0Client.healthCheck();
    
    return {
      engine: lc0Available ? 'lc0' : 'random',
      lc0Available,
      error: lc0Available ? null : 'LC0 server unavailable'
    };
  }
}