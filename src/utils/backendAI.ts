import { Move } from 'chess.js';

export type DifficultyLevel = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

interface BackendAIMove {
  from: string;
  to: string;
  promotion?: string;
  san: string;
}

export class BackendAI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3005';
  }

  async getBestMove(fen: string, difficulty: DifficultyLevel = 'medium'): Promise<Move | null> {
    try {
      console.log(`🤖 Requesting AI move from backend (${difficulty})`);
      
      const response = await fetch(`${this.baseUrl}/api/ai/move`, {
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
        throw new Error(`Backend AI request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log(`⚡ Backend AI responded in ${data.responseTime}ms`);
      
      return data.move as Move;
      
    } catch (error) {
      console.error('Backend AI error:', error);
      console.log('🔄 Falling back to frontend AI');
      return null; // Caller should fall back to frontend AI
    }
  }

  async getEngineStatus() {
    try {
      const response = await fetch(`${this.baseUrl}/api/ai/status`);
      if (!response.ok) {
        throw new Error(`Status request failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to get engine status:', error);
      return { engines: { beginner: false, easy: false, medium: false, hard: false, expert: false } };
    }
  }
}