import { Chess, Move } from 'chess.js';

interface BackendResponse {
  move: {
    from: string;
    to: string;
    promotion?: string;
    san: string;
    flags: string;
  } | null;
  thinkingTime: number;
  difficulty: string;
}

interface BackendEngineConfig {
  backendUrl?: string;
  difficulty: 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';
  timeLimit?: number;
}

// Real Lc0Engine that communicates with the Node.js backend
export class Lc0EngineBackend {
  private config: BackendEngineConfig;
  private isInitialized: boolean = false;

  constructor(config: BackendEngineConfig) {
    this.config = {
      backendUrl: 'http://localhost:3005',
      ...config
    };
  }

  async initialize(): Promise<void> {
    try {
      // Check if backend is available
      const response = await fetch(`${this.config.backendUrl}/health`);
      if (!response.ok) {
        throw new Error('Backend server not available');
      }
      
      const healthData = await response.json();
      console.log('Backend health check:', healthData);
      
      this.isInitialized = true;
      console.log(`Lc0EngineBackend initialized with ${this.config.difficulty} difficulty`);
    } catch (error) {
      console.error('Failed to initialize Lc0EngineBackend:', error);
      throw error;
    }
  }

  async getBestMove(game: Chess, timeLimit?: number): Promise<Move | null> {
    if (!this.isInitialized) {
      throw new Error('Engine not ready');
    }

    try {
      const fen = game.fen();
      const requestBody = {
        fen,
        difficulty: this.config.difficulty,
        timeLimit: timeLimit || this.config.timeLimit
      };

      console.log(`Requesting move from backend: ${this.config.difficulty} difficulty`);
      const startTime = Date.now();

      const response = await fetch(`${this.config.backendUrl}/api/chess/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Backend error: ${errorData.error}`);
      }

      const data: BackendResponse = await response.json();
      const totalTime = Date.now() - startTime;

      if (!data.move) {
        console.log('No move available from backend');
        return null;
      }

      console.log(`Backend returned move: ${data.move.san} in ${data.thinkingTime}ms (total: ${totalTime}ms)`);

      // Convert backend response to chess.js Move object
      const legalMoves = game.moves({ verbose: true });
      const move = legalMoves.find(m => 
        m.from === data.move!.from && 
        m.to === data.move!.to && 
        (data.move!.promotion ? m.promotion === data.move!.promotion : !m.promotion)
      );

      return move || null;
    } catch (error) {
      console.error('Error getting move from backend:', error);
      throw error;
    }
  }

  async setOption(name: string, value: string | number): Promise<void> {
    console.log(`Setting option ${name} = ${value} (backend engine)`);
  }

  async isEngineReady(): Promise<boolean> {
    if (!this.isInitialized) return false;

    try {
      const response = await fetch(`${this.config.backendUrl}/api/chess/engines`);
      if (!response.ok) return false;
      
      const data = await response.json();
      return data.engines[this.config.difficulty] === true;
    } catch (error) {
      console.error('Error checking engine status:', error);
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.isInitialized = false;
    console.log('Lc0EngineBackend shut down');
  }

  getDifficulty(): string {
    return this.config.difficulty;
  }

  // Static factory methods
  static async createBeginner(backendUrl?: string): Promise<Lc0EngineBackend> {
    const engine = new Lc0EngineBackend({
      backendUrl: backendUrl || 'http://localhost:3005',
      difficulty: 'beginner',
      timeLimit: 500
    });
    await engine.initialize();
    return engine;
  }

  static async createEasy(backendUrl?: string): Promise<Lc0EngineBackend> {
    const engine = new Lc0EngineBackend({
      backendUrl: backendUrl || 'http://localhost:3005',
      difficulty: 'easy',
      timeLimit: 1000
    });
    await engine.initialize();
    return engine;
  }

  static async createMedium(backendUrl?: string): Promise<Lc0EngineBackend> {
    const engine = new Lc0EngineBackend({
      backendUrl: backendUrl || 'http://localhost:3005',
      difficulty: 'medium',
      timeLimit: 2000
    });
    await engine.initialize();
    return engine;
  }

  static async createHard(backendUrl?: string): Promise<Lc0EngineBackend> {
    const engine = new Lc0EngineBackend({
      backendUrl: backendUrl || 'http://localhost:3005',
      difficulty: 'hard',
      timeLimit: 5000
    });
    await engine.initialize();
    return engine;
  }

  static async createExpert(backendUrl?: string): Promise<Lc0EngineBackend> {
    const engine = new Lc0EngineBackend({
      backendUrl: backendUrl || 'http://localhost:3005',
      difficulty: 'expert',
      timeLimit: 10000
    });
    await engine.initialize();
    return engine;
  }

  // Test connection to backend
  static async testConnection(backendUrl: string = 'http://localhost:3005'): Promise<boolean> {
    try {
      const response = await fetch(`${backendUrl}/api/chess/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) return false;
      
      const data = await response.json();
      console.log('Backend test result:', data);
      return data.success === true;
    } catch (error) {
      console.error('Backend connection test failed:', error);
      return false;
    }
  }
}