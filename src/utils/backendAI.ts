import { Move } from 'chess.js';

export type DifficultyLevel = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

// Removed unused BackendAIMove interface - moves come as Move objects from chess.js

export class BackendAI {
  private lc0ServerUrl: string;

  constructor() {
    // Call LC0 server directly since main backend doesn't have AI endpoints
    this.lc0ServerUrl = process.env.REACT_APP_LC0_SERVER_URL || 'https://web-production-4cc9.up.railway.app';
  }

  async getBestMove(fen: string, difficulty: DifficultyLevel = 'medium'): Promise<Move | null> {
    try {
      console.log(`🧠 Requesting LC0 move directly from neural network (${difficulty})`);
      
      const response = await fetch(`${this.lc0ServerUrl}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fen,
          difficulty
        }),
      });

      if (!response.ok) {
        throw new Error(`LC0 server request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log(`⚡ LC0 neural network responded in ${data.responseTime}ms with engine: ${data.engine}`);

      // Validate response structure
      if (!data.move || !data.move.from || !data.move.to) {
        console.error('LC0 returned invalid move format:', data);
        return null;
      }

      // Convert LC0 response to chess.js Move format
      const move = {
        from: data.move.from,
        to: data.move.to,
        promotion: data.move.uci && data.move.uci.length > 4 ? data.move.uci[4] : undefined,
        san: data.move.uci // Will be updated when move is validated
      };

      return move as Move;
      
    } catch (error) {
      console.error('LC0 neural network error:', error);
      console.log('🔄 Falling back to frontend AI');
      return null; // Caller should fall back to frontend AI
    }
  }

  async getEngineStatus() {
    try {
      const response = await fetch(`${this.lc0ServerUrl}/health`);
      if (!response.ok) {
        throw new Error(`LC0 status request failed: ${response.status}`);
      }
      const data = await response.json();
      return { 
        engines: { 
          beginner: true, 
          easy: true, 
          medium: true, 
          hard: true, 
          expert: true,
          engine: 'lc0',
          lc0Available: data.status === 'ok'
        } 
      };
    } catch (error) {
      console.error('Failed to get LC0 engine status:', error);
      return { engines: { beginner: false, easy: false, medium: false, hard: false, expert: false } };
    }
  }
}