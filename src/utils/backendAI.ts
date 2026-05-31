import { Move } from 'chess.js';
import { logger } from './logger';

export type DifficultyLevel = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

// Removed unused BackendAIMove interface - moves come as Move objects from chess.js

export class BackendAI {
  private lc0ServerUrl: string;

  constructor() {
    // Call LC0 server directly since main backend doesn't have AI endpoints
    this.lc0ServerUrl = process.env.REACT_APP_LC0_SERVER_URL || 'https://web-production-4cc9.up.railway.app';
  }

  async getBestMove(fen: string, difficulty: DifficultyLevel = 'medium'): Promise<Move | null> {
    // Abort if the LC0 server takes too long (e.g. a Railway cold start that
    // never recovers) so the UI falls back instead of hanging indefinitely.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      logger.debug(`🧠 Requesting LC0 move directly from neural network (${difficulty})`);

      const response = await fetch(`${this.lc0ServerUrl}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fen,
          difficulty
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LC0 server request failed: ${response.status}`);
      }

      const data = await response.json();
      logger.debug(`⚡ LC0 neural network responded in ${data.responseTime}ms with engine: ${data.engine}`);

      // The LC0 server returns the move primarily as a UCI string (e.g. "e2e4",
      // "e7e8q"); explicit from/to are not guaranteed, so derive them from the
      // UCI string when missing (mirrors the backend hint route).
      const rawMove = data?.move;
      const uci: string | undefined = rawMove?.uci;
      let from: string | undefined = rawMove?.from;
      let to: string | undefined = rawMove?.to;
      let promotion: string | undefined = rawMove?.promotion;

      if ((!from || !to) && typeof uci === 'string' && uci.length >= 4) {
        from = uci.substring(0, 2);
        to = uci.substring(2, 4);
        promotion = uci.length > 4 ? uci.substring(4) : promotion;
      }

      if (!from || !to) {
        logger.error('LC0 returned invalid move format:', data);
        return null;
      }

      // chess.js derives/validates SAN when the move is applied via { from, to }.
      return { from, to, promotion } as Move;

    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        logger.error('LC0 neural network request timed out');
      } else {
        logger.error('LC0 neural network error:', error);
      }
      logger.debug('🔄 Falling back to frontend AI');
      return null; // Caller should fall back to frontend AI
    } finally {
      clearTimeout(timeoutId);
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
      logger.error('Failed to get LC0 engine status:', error);
      return { engines: { beginner: false, easy: false, medium: false, hard: false, expert: false } };
    }
  }
}