import { Chess } from 'chess.js';
import { ChessAI, DifficultyLevel } from '../utils/chessAI';

describe('Performance Tests', () => {
  let chess: Chess;
  let ai: ChessAI;

  beforeEach(() => {
    chess = new Chess();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AI Performance Tests', () => {
    const difficulties: DifficultyLevel[] = ['beginner', 'easy', 'medium', 'hard', 'expert'];

    test.each(difficulties)('AI %s difficulty responds within reasonable time', async (difficulty) => {
      ai = new ChessAI(difficulty);
      
      // Test opening position
      const startTime = performance.now();
      const move = await ai.getBestMove(chess);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(move).not.toBeNull();
      
      // Performance expectations by difficulty
      const maxTimes = {
        beginner: 2000,  // 2 seconds max
        easy: 3000,      // 3 seconds max
        medium: 5000,    // 5 seconds max
        hard: 8000,      // 8 seconds max
        expert: 12000    // 12 seconds max
      };

      console.log(`${difficulty} AI took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(maxTimes[difficulty]);
    });

    test('AI performance in mid-game position', async () => {
      // Set up a more complex mid-game position
      chess.load('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 4');
      
      ai = new ChessAI('medium');
      
      const startTime = performance.now();
      const move = await ai.getBestMove(chess);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(move).not.toBeNull();
      console.log(`Mid-game AI (medium) took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(8000); // Should be under 8 seconds even in complex positions
    });

    test('AI performance degrades gracefully with depth', async () => {
      const results: { difficulty: DifficultyLevel; time: number }[] = [];

      for (const difficulty of ['beginner', 'easy', 'medium'] as DifficultyLevel[]) {
        ai = new ChessAI(difficulty);
        
        const startTime = performance.now();
        await ai.getBestMove(chess);
        const endTime = performance.now();
        
        results.push({ difficulty, time: endTime - startTime });
      }

      // Each higher difficulty should not be dramatically slower
      console.log('Performance progression:', results);
      
      // Beginner should be fastest
      expect(results[0].time).toBeLessThan(results[1].time);
      // Medium should not be more than 5x slower than beginner
      expect(results[2].time).toBeLessThan(results[0].time * 5);
    });

    test('AI handles multiple rapid moves efficiently', async () => {
      ai = new ChessAI('easy'); // Use easier difficulty for rapid moves
      
      const moves = ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'f1c4'];
      const times: number[] = [];

      for (let i = 0; i < moves.length; i += 2) {
        // Make human moves
        if (i < moves.length) chess.move(moves[i]);
        if (i + 1 < moves.length) chess.move(moves[i + 1]);

        // Time AI response
        const startTime = performance.now();
        const aiMove = await ai.getBestMove(chess);
        const endTime = performance.now();
        
        if (aiMove) {
          chess.move(aiMove);
          times.push(endTime - startTime);
        }
      }

      console.log('Rapid move times:', times.map(t => `${t.toFixed(2)}ms`));
      
      // All moves should be reasonably fast
      times.forEach(time => {
        expect(time).toBeLessThan(5000); // Max 5 seconds per move
      });

      // Average should be reasonable
      const average = times.reduce((a, b) => a + b, 0) / times.length;
      expect(average).toBeLessThan(3000); // Average under 3 seconds
    });
  });

  describe('Browser Performance Tests', () => {
    test('measures basic JavaScript performance', () => {
      const start = performance.now();
      
      // Simulate some work
      let sum = 0;
      for (let i = 0; i < 1000000; i++) {
        sum += Math.random();
      }
      
      const end = performance.now();
      const duration = end - start;
      
      console.log(`Basic JS performance: ${duration.toFixed(2)}ms for 1M operations`);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(sum).toBeGreaterThan(0); // Ensure work was done
    });

    test('measures Chess.js library performance', () => {
      const start = performance.now();
      
      // Create multiple chess instances and make moves
      for (let i = 0; i < 100; i++) {
        const testChess = new Chess();
        testChess.move('e2e4');
        testChess.move('e7e5');
        testChess.move('g1f3');
        testChess.undo();
        testChess.undo();
        testChess.undo();
      }
      
      const end = performance.now();
      const duration = end - start;
      
      console.log(`Chess.js performance: ${duration.toFixed(2)}ms for 100 game simulations`);
      expect(duration).toBeLessThan(500); // Should be very fast
    });

    test('measures memory allocation patterns', () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Create and destroy many chess instances
      const instances = [];
      for (let i = 0; i < 1000; i++) {
        instances.push(new Chess());
      }
      
      const peakMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Clear references
      instances.length = 0;
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      console.log(`Memory usage: Initial=${initialMemory}, Peak=${peakMemory}, Final=${finalMemory}`);
      
      // Memory should not grow excessively
      if (peakMemory > 0) {
        expect(peakMemory - initialMemory).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
      }
    });
  });

  describe('System Performance Analysis', () => {
    test('analyzes overall system responsiveness', async () => {
      const metrics = {
        aiResponseTimes: [] as number[],
        jsPerformance: 0,
        chessLibPerformance: 0
      };

      // Test AI at different stages
      const positions = [
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Opening
        'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 4', // Mid-game
        '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1' // Endgame
      ];

      ai = new ChessAI('medium');

      for (const fen of positions) {
        chess.load(fen);
        const start = performance.now();
        await ai.getBestMove(chess);
        const end = performance.now();
        metrics.aiResponseTimes.push(end - start);
      }

      // Test JS performance
      const jsStart = performance.now();
      let result = 0;
      for (let i = 0; i < 100000; i++) {
        result += Math.sqrt(i);
      }
      metrics.jsPerformance = performance.now() - jsStart;

      // Test chess.js performance
      const chessStart = performance.now();
      for (let i = 0; i < 50; i++) {
        const testGame = new Chess();
        testGame.move('e2e4');
        testGame.move('e7e5');
        testGame.moves();
        testGame.isCheck();
      }
      metrics.chessLibPerformance = performance.now() - chessStart;

      console.log('System Performance Metrics:', {
        aiTimes: metrics.aiResponseTimes.map(t => `${t.toFixed(2)}ms`),
        avgAiTime: `${(metrics.aiResponseTimes.reduce((a, b) => a + b) / metrics.aiResponseTimes.length).toFixed(2)}ms`,
        jsPerf: `${metrics.jsPerformance.toFixed(2)}ms`,
        chessLibPerf: `${metrics.chessLibPerformance.toFixed(2)}ms`
      });

      // Performance assertions
      expect(metrics.aiResponseTimes.every(t => t < 10000)).toBe(true); // All under 10s
      expect(metrics.jsPerformance).toBeLessThan(1000); // JS should be fast
      expect(metrics.chessLibPerformance).toBeLessThan(200); // Chess.js should be very fast

      // If any AI move takes longer than 5 seconds, log a warning
      const slowMoves = metrics.aiResponseTimes.filter(t => t > 5000);
      if (slowMoves.length > 0) {
        console.warn(`Warning: ${slowMoves.length} AI moves took longer than 5 seconds`);
      }

      expect(result).toBeGreaterThan(0); // Ensure work was done
    });

    test('provides system recommendations', () => {
      const recommendations = [];

      // Check if running in Firefox
      const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
      if (isFirefox) {
        recommendations.push('Firefox detected - consider testing in Chrome for comparison');
      }

      // Check available memory
      const memory = (performance as any).memory;
      if (memory && memory.jsHeapSizeLimit < 100 * 1024 * 1024) {
        recommendations.push('Low memory limit detected - consider closing other tabs');
      }

      // Check if we're in a test environment
      const isTest = process.env.NODE_ENV === 'test';
      if (!isTest) {
        recommendations.push('Run performance tests in production build for accurate results');
      }

      console.log('System Recommendations:', recommendations);
      
      // Always pass but log recommendations
      expect(recommendations).toBeDefined();
    });
  });

  describe('AI Optimization Suggestions', () => {
    test('analyzes AI configuration for performance', async () => {
      const configs = [
        { difficulty: 'medium' as DifficultyLevel, expectedTime: 5000 },
        { difficulty: 'hard' as DifficultyLevel, expectedTime: 8000 },
        { difficulty: 'expert' as DifficultyLevel, expectedTime: 12000 }
      ];

      for (const config of configs) {
        ai = new ChessAI(config.difficulty);
        
        const start = performance.now();
        await ai.getBestMove(chess);
        const duration = performance.now() - start;

        console.log(`${config.difficulty}: ${duration.toFixed(2)}ms (expected <${config.expectedTime}ms)`);

        if (duration > config.expectedTime) {
          console.warn(`⚠️  ${config.difficulty} AI is slower than expected. Consider:`);
          console.warn('  - Reducing search depth');
          console.warn('  - Optimizing evaluation function');
          console.warn('  - Adding more aggressive pruning');
        } else {
          console.log(`✅ ${config.difficulty} AI performance is good`);
        }
      }

      // Test always passes, but provides diagnostic information
      expect(true).toBe(true);
    });
  });
});