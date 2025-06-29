import fetch from 'node-fetch';

interface LC0Move {
  from: string;
  to: string;
  uci: string;
}

interface LC0Response {
  move: LC0Move;
  difficulty: string;
  responseTime: number;
  engine: string;
}

export class LC0Client {
  private serverUrl: string;

  constructor() {
    this.serverUrl = process.env.LC0_SERVER_URL || 'https://web-production-4cc9.up.railway.app';
  }

  async getMove(fen: string, difficulty: string = 'medium'): Promise<LC0Move | null> {
    try {
      console.log(`🧠 Requesting LC0 move (${difficulty}) from ${this.serverUrl}`);
      
      const response = await fetch(`${this.serverUrl}/move`, {
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

      const data = await response.json() as LC0Response;
      console.log(`⚡ LC0 responded in ${data.responseTime}ms with move: ${data.move.uci}`);
      
      return data.move;
      
    } catch (error) {
      console.error('LC0 client error:', error);
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      return response.ok;
    } catch (error) {
      console.error('LC0 health check failed:', error);
      return false;
    }
  }
}