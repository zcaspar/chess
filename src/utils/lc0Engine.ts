import { Chess, Move } from 'chess.js';

interface Lc0EngineConfig {
  weightsPath: string;
  backend: 'eigen' | 'cuda-auto' | 'cuda' | 'cuda-fp16';
  nodes?: number;
  movetime?: number;
  depth?: number;
}

// Browser-compatible Lc0Engine simulation
// Note: This is a simulation for browser environment
// For actual Lc0 integration, use a Node.js backend service
export class Lc0Engine {
  private isInitialized: boolean = false;
  private config: Lc0EngineConfig;

  constructor(config: Lc0EngineConfig) {
    this.config = {
      nodes: 1000,
      movetime: 1000,
      ...config,
      backend: 'eigen' // Default to CPU backend
    };
  }

  async initialize(): Promise<void> {
    // Simulate initialization delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.isInitialized = true;
    console.log('Lc0Engine (simulation) initialized with config:', this.config);
  }

  async getBestMove(game: Chess, timeLimit?: number): Promise<Move | null> {
    if (!this.isInitialized) {
      throw new Error('Engine not ready');
    }

    // Simulate thinking time based on difficulty
    const thinkingTime = timeLimit || this.config.movetime || 1000;
    await new Promise(resolve => setTimeout(resolve, Math.min(thinkingTime, 2000)));

    // Get legal moves
    const legalMoves = game.moves({ verbose: true });
    if (legalMoves.length === 0) {
      return null;
    }

    // Simulate Lc0-like move selection (stronger than random)
    const move = this.selectBestMove(game, legalMoves);
    
    console.log(`Lc0Engine (simulation) selected move: ${move?.san} after ${thinkingTime}ms thinking`);
    return move;
  }

  private selectBestMove(game: Chess, moves: Move[]): Move {
    // Simulate neural network evaluation by prioritizing:
    // 1. Captures (especially good trades)
    // 2. Central control
    // 3. Development
    // 4. King safety

    const scoredMoves = moves.map(move => ({
      move,
      score: this.evaluateMove(game, move)
    }));

    // Sort by score and add some randomness for realism
    scoredMoves.sort((a, b) => b.score - a.score);
    
    // Top moves get higher probability
    const topMoves = scoredMoves.slice(0, Math.max(1, Math.floor(moves.length * 0.3)));
    const weights = topMoves.map((_, index) => Math.pow(0.7, index));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    let random = Math.random() * totalWeight;
    for (let i = 0; i < topMoves.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return topMoves[i].move;
      }
    }
    
    return topMoves[0].move;
  }

  private evaluateMove(game: Chess, move: Move): number {
    let score = 0;
    
    // Capture evaluation
    if (move.captured) {
      const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
      const capturedValue = pieceValues[move.captured as keyof typeof pieceValues] || 0;
      const attackerValue = pieceValues[move.piece as keyof typeof pieceValues] || 0;
      score += capturedValue * 10 - attackerValue; // Good trades score higher
    }

    // Promotion bonus
    if (move.promotion) {
      score += 80;
    }

    // Central control bonus
    const centralSquares = ['d4', 'd5', 'e4', 'e5'];
    if (centralSquares.includes(move.to)) {
      score += 5;
    }

    // Development bonus for pieces
    if (['n', 'b'].includes(move.piece) && ['1', '8'].includes(move.from[1])) {
      score += 3;
    }

    // Castling bonus
    if (move.flags.includes('k') || move.flags.includes('q')) {
      score += 8;
    }

    // Check bonus
    const tempGame = new Chess(game.fen());
    tempGame.move(move);
    if (tempGame.inCheck()) {
      score += 4;
    }

    // Avoid moving into attacks (simplified)
    if (this.isSquareAttacked(game, move.to, game.turn() === 'w' ? 'b' : 'w')) {
      score -= 5;
    }

    return score + Math.random() * 2; // Add small random factor
  }

  private isSquareAttacked(game: Chess, square: string, byColor: 'w' | 'b'): boolean {
    // Simple attack detection - check if any enemy piece can capture this square
    const tempGame = new Chess(game.fen());
    const originalTurn = tempGame.turn();
    
    // Switch turns to check if the other color can attack this square
    if (originalTurn !== byColor) {
      // This is a simplified check - in reality we'd need to properly switch turns
      const enemyMoves = tempGame.moves({ verbose: true });
      return enemyMoves.some(move => move.to === square);
    }
    
    return false;
  }

  async setOption(name: string, value: string | number): Promise<void> {
    console.log(`Setting option ${name} = ${value}`);
  }

  async isEngineReady(): Promise<boolean> {
    return this.isInitialized;
  }

  async shutdown(): Promise<void> {
    this.isInitialized = false;
    console.log('Lc0Engine (simulation) shut down');
  }

  // Static factory methods
  static async createBeginner(weightsPath: string): Promise<Lc0Engine> {
    const engine = new Lc0Engine({
      weightsPath,
      backend: 'eigen',
      nodes: 100,
      movetime: 500
    });
    await engine.initialize();
    return engine;
  }

  static async createIntermediate(weightsPath: string): Promise<Lc0Engine> {
    const engine = new Lc0Engine({
      weightsPath,
      backend: 'eigen',
      nodes: 1000,
      movetime: 1000
    });
    await engine.initialize();
    return engine;
  }

  static async createAdvanced(weightsPath: string): Promise<Lc0Engine> {
    const engine = new Lc0Engine({
      weightsPath,
      backend: 'eigen',
      nodes: 5000,
      movetime: 3000
    });
    await engine.initialize();
    return engine;
  }
}