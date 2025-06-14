import { spawn, ChildProcess } from 'child_process';
import { Chess, Move, Square } from 'chess.js';

interface Lc0EngineConfig {
  weightsPath: string;
  backend: 'eigen' | 'cuda-auto' | 'cuda' | 'cuda-fp16';
  nodes?: number;
  movetime?: number;
  depth?: number;
}

interface EngineResponse {
  bestmove: string | null;
  ponder?: string;
  evaluation?: number;
  nodes?: number;
  time?: number;
  info?: string;
}

export class Lc0Engine {
  private process: ChildProcess | null = null;
  private config: Lc0EngineConfig;
  private isReady: boolean = false;
  private responseBuffer: string = '';
  private pendingCommands: Map<string, {
    resolve: (response: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(config: Lc0EngineConfig) {
    this.config = {
      nodes: 1000,
      movetime: 1000,
      ...config
    };
    
    // Set default backend if not provided
    if (!this.config.backend) {
      this.config.backend = 'eigen';
    }
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('Initializing Lc0 engine with config:', this.config);
        
        // Spawn Lc0 process with configuration
        this.process = spawn('/home/caspar/Documents/Coding/Chess/lc0/lc0/build/release/lc0', [
          `--weights=${this.config.weightsPath}`,
          `--backend=${this.config.backend}`,
          '--verbose-move-stats'
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: '/home/caspar/Documents/Coding/Chess/lc0/lc0'
        });

        if (!this.process.stdout || !this.process.stdin || !this.process.stderr) {
          throw new Error('Failed to create Lc0 process pipes');
        }

        // Handle stdout data
        this.process.stdout.on('data', (data: Buffer) => {
          this.handleEngineOutput(data.toString());
        });

        // Handle stderr for errors and info
        this.process.stderr.on('data', (data: Buffer) => {
          console.log('Lc0 info:', data.toString().trim());
        });

        // Handle process exit
        this.process.on('exit', (code) => {
          console.log(`Lc0 process exited with code ${code}`);
          this.isReady = false;
          this.process = null;
          // Reject all pending commands
          this.pendingCommands.forEach(({ reject, timeout }) => {
            clearTimeout(timeout);
            reject(new Error('Engine process exited'));
          });
          this.pendingCommands.clear();
        });

        // Handle process errors
        this.process.on('error', (error) => {
          console.error('Lc0 process error:', error);
          reject(error);
        });

        // Wait for UCI handshake
        this.waitForUciOk().then(() => {
          this.isReady = true;
          console.log('Lc0 engine ready!');
          resolve();
        }).catch(reject);

      } catch (error) {
        reject(error);
      }
    });
  }

  private async waitForUciOk(): Promise<void> {
    return new Promise((resolve, reject) => {
      const commandId = 'init-uci';
      this.sendCommand('uci', commandId, (response) => {
        resolve();
      }, reject);
    });
  }

  private handleEngineOutput(data: string): void {
    this.responseBuffer += data;
    const lines = this.responseBuffer.split('\n');
    
    // Keep the last potentially incomplete line in the buffer
    this.responseBuffer = lines.pop() || '';

    for (const line of lines) {
      this.processEngineLine(line.trim());
    }
  }

  private processEngineLine(line: string): void {
    if (!line) return;
    
    console.log('Lc0:', line);

    // Handle UCI responses
    if (line === 'uciok') {
      this.resolvePendingCommand('init-uci', { success: true });
      return;
    }

    // Handle readyok responses
    if (line === 'readyok') {
      this.resolvePendingCommand('isready', { ready: true });
      return;
    }

    // Handle bestmove responses
    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      const bestmove = parts[1] !== 'none' ? parts[1] : null;
      const ponder = parts[3] || undefined;
      
      this.resolvePendingCommand('position-go', {
        bestmove,
        ponder
      });
      return;
    }

    // Handle info lines for additional data
    if (line.startsWith('info') && this.pendingCommands.has('position-go')) {
      // Parse evaluation, nodes, time, etc.
      const infoData = this.parseInfoLine(line);
      // We could store this for later use or send partial updates
    }
  }

  private parseInfoLine(line: string): any {
    const parts = line.split(' ');
    const info: any = {};
    
    for (let i = 1; i < parts.length; i += 2) {
      const key = parts[i];
      const value = parts[i + 1];
      
      switch (key) {
        case 'depth':
        case 'nodes':
        case 'time':
        case 'nps':
          info[key] = parseInt(value);
          break;
        case 'score':
          if (parts[i + 1] === 'cp') {
            info.score = parseInt(parts[i + 2]);
            i++; // Skip the next part since we consumed it
          }
          break;
        case 'pv':
          info.pv = parts.slice(i + 1).join(' ');
          break;
      }
    }
    
    return info;
  }

  private resolvePendingCommand(commandId: string, response: any): void {
    const pending = this.pendingCommands.get(commandId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(response);
      this.pendingCommands.delete(commandId);
    }
  }

  private sendCommand(command: string, commandId: string, resolve: (response: any) => void, reject: (error: Error) => void): void {
    if (!this.process || !this.process.stdin) {
      reject(new Error('Engine not initialized'));
      return;
    }

    // Set timeout for command response
    const timeout = setTimeout(() => {
      this.pendingCommands.delete(commandId);
      reject(new Error(`Command timeout: ${command}`));
    }, 30000); // 30 second timeout

    this.pendingCommands.set(commandId, { resolve, reject, timeout });

    console.log('Sending to Lc0:', command);
    this.process.stdin.write(command + '\n');
  }

  async getBestMove(game: Chess, timeLimit?: number): Promise<Move | null> {
    if (!this.isReady) {
      throw new Error('Engine not ready');
    }

    return new Promise((resolve, reject) => {
      const fen = game.fen();
      const moveTime = timeLimit || this.config.movetime || 1000;

      // Send position command first
      if (!this.process || !this.process.stdin) {
        reject(new Error('Engine not available'));
        return;
      }

      console.log(`Setting position: ${fen}`);
      this.process.stdin.write(`position fen ${fen}\n`);

      // Then send go command and wait for response
      const commandId = 'position-go';
      this.sendCommand(`go movetime ${moveTime}`, commandId, (response: EngineResponse) => {
        if (response.bestmove) {
          // Convert UCI move to chess.js Move object
          const move = this.uciToMove(game, response.bestmove);
          if (move) {
            console.log(`✅ Valid move found: ${move.san} (${move.from}-${move.to})`);
            resolve(move);
          } else {
            console.log(`❌ Invalid UCI move returned by engine: ${response.bestmove}`);
            console.log(`   Position: ${game.fen()}`);
            console.log(`   Legal moves: ${game.moves({ verbose: true }).map(m => `${m.from}-${m.to}`).join(', ')}`);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      }, reject);
    });
  }

  private uciToMove(game: Chess, uciMove: string): Move | null {
    try {
      const from = uciMove.substring(0, 2) as Square;
      const to = uciMove.substring(2, 4) as Square;
      const promotion = uciMove.length > 4 ? uciMove.substring(4, 5) : undefined;

      // Find the matching move in the legal moves
      const legalMoves = game.moves({ verbose: true });
      const move = legalMoves.find(m => 
        m.from === from && 
        m.to === to && 
        (promotion ? m.promotion === promotion : !m.promotion)
      );

      return move || null;
    } catch (error) {
      console.error('Error converting UCI move:', uciMove, error);
      return null;
    }
  }

  async setOption(name: string, value: string | number): Promise<void> {
    return new Promise((resolve, reject) => {
      const commandId = `setoption-${Date.now()}`;
      this.sendCommand(`setoption name ${name} value ${value}`, commandId, () => {
        resolve();
      }, reject);
    });
  }

  async isEngineReady(): Promise<boolean> {
    if (!this.isReady) return false;

    return new Promise((resolve) => {
      const commandId = 'isready';
      this.sendCommand('isready', commandId, (response) => {
        resolve(response.ready === true);
      }, () => {
        resolve(false);
      });
    });
  }

  async shutdown(): Promise<void> {
    if (this.process) {
      this.process.stdin?.write('quit\n');
      
      // Give it a moment to quit gracefully
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (this.process && !this.process.killed) {
        this.process.kill();
      }
      
      this.process = null;
      this.isReady = false;
    }
    
    // Clear all pending commands
    this.pendingCommands.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Engine shut down'));
    });
    this.pendingCommands.clear();
  }

  // Convenience methods for different difficulty levels
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
      movetime: 2000
    });
    await engine.initialize();
    return engine;
  }

  static async createAdvanced(weightsPath: string): Promise<Lc0Engine> {
    const engine = new Lc0Engine({
      weightsPath,
      backend: 'eigen',
      nodes: 5000,
      movetime: 5000
    });
    await engine.initialize();
    return engine;
  }

  static async createExpert(weightsPath: string): Promise<Lc0Engine> {
    const engine = new Lc0Engine({
      weightsPath,
      backend: 'eigen',
      nodes: 10000,
      movetime: 10000
    });
    await engine.initialize();
    return engine;
  }
}