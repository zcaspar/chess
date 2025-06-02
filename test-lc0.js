// Simple test script for Lc0 integration
// Run with: node test-lc0.js

const { Chess } = require('chess.js');
const { spawn } = require('child_process');

class SimpleLc0Test {
  constructor() {
    this.process = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      console.log('Starting Lc0 engine...');
      
      this.process = spawn('/home/caspar/Documents/Coding/Chess/lc0/lc0/build/release/lc0', [
        '--weights=/home/caspar/Documents/Coding/Chess/lc0/lc0/build/release/weights.pb',
        '--backend=eigen'
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: '/home/caspar/Documents/Coding/Chess/lc0/lc0'
      });

      let output = '';
      
      this.process.stdout.on('data', (data) => {
        output += data.toString();
        console.log('Lc0 output:', data.toString().trim());
        
        if (output.includes('uciok')) {
          console.log('✓ Lc0 initialized successfully');
          resolve();
        }
      });

      this.process.stderr.on('data', (data) => {
        console.error('Lc0 stderr:', data.toString().trim());
      });

      this.process.on('error', (error) => {
        console.error('Process error:', error);
        reject(error);
      });

      // Send UCI command
      setTimeout(() => {
        console.log('Sending UCI command...');
        this.process.stdin.write('uci\n');
      }, 1000);

      // Timeout after 10 seconds
      setTimeout(() => {
        reject(new Error('Timeout waiting for UCI response'));
      }, 10000);
    });
  }

  async getBestMove(fen) {
    return new Promise((resolve, reject) => {
      console.log(`Getting best move for position: ${fen}`);
      
      let output = '';
      const dataHandler = (data) => {
        output += data.toString();
        console.log('Move search output:', data.toString().trim());
        
        if (output.includes('bestmove')) {
          const match = output.match(/bestmove ([a-h][1-8][a-h][1-8])/);
          const bestmove = match ? match[1] : null;
          console.log(`✓ Best move found: ${bestmove}`);
          this.process.stdout.removeListener('data', dataHandler);
          resolve(bestmove);
        }
      };

      this.process.stdout.on('data', dataHandler);

      // Send position and go command
      this.process.stdin.write(`position fen ${fen}\n`);
      this.process.stdin.write('go movetime 1000\n');

      // Timeout after 15 seconds
      setTimeout(() => {
        this.process.stdout.removeListener('data', dataHandler);
        reject(new Error('Timeout waiting for best move'));
      }, 15000);
    });
  }

  shutdown() {
    if (this.process) {
      console.log('Shutting down Lc0 engine...');
      this.process.stdin.write('quit\n');
      this.process.kill();
    }
  }
}

async function runTest() {
  const lc0 = new SimpleLc0Test();
  
  try {
    console.log('=== Lc0 Integration Test ===');
    
    // Test 1: Initialize engine
    console.log('\n1. Initializing Lc0 engine...');
    await lc0.initialize();
    
    // Test 2: Get move from starting position
    console.log('\n2. Testing move from starting position...');
    const chess = new Chess();
    const startMove = await lc0.getBestMove(chess.fen());
    console.log(`Starting position move: ${startMove}`);
    
    // Test 3: Get move from a middle game position
    console.log('\n3. Testing move from middle game position...');
    chess.load('rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3');
    const middleMove = await lc0.getBestMove(chess.fen());
    console.log(`Middle game move: ${middleMove}`);
    
    console.log('\n✓ All tests passed! Lc0 integration is working.');
    
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
  } finally {
    lc0.shutdown();
    process.exit(0);
  }
}

// Run the test
runTest();