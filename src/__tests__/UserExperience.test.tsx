import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GameProvider } from '../contexts/GameContext';
import App from '../App';

// Mock chess.js
jest.mock('chess.js', () => ({
  Chess: jest.fn().mockImplementation(() => ({
    turn: () => 'w',
    moves: () => [{ from: 'e2', to: 'e4', piece: 'p' }],
    move: () => ({ from: 'e2', to: 'e4', piece: 'p' }),
    isGameOver: () => false,
    isCheckmate: () => false,
    isDraw: () => false,
    isStalemate: () => false,
    isThreefoldRepetition: () => false,
    isInsufficientMaterial: () => false,
    fen: () => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    board: () => Array(8).fill(Array(8).fill(null)),
    history: () => [],
    inCheck: () => false,
    getCastlingRights: () => ({ k: false, q: false }),
  }))
}));

// Mock react-chessboard
jest.mock('react-chessboard', () => ({
  Chessboard: () => <div data-testid="chessboard">Mocked Chessboard</div>
}));

// Mock the ChessAI with realistic response times
jest.mock('../utils/chessAI', () => ({
  ChessAI: jest.fn().mockImplementation(() => ({
    getBestMove: jest.fn().mockImplementation(async () => {
      // Simulate realistic AI thinking time (100-500ms)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 400 + 100));
      return { from: 'd2', to: 'd4', piece: 'p' };
    }),
    setDifficulty: jest.fn(),
    getDifficulty: jest.fn().mockReturnValue('medium'),
  })),
}));

describe('User Experience Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('app loads quickly and displays main interface', async () => {
    const startTime = performance.now();
    
    render(<App />);
    
    const endTime = performance.now();
    const loadTime = endTime - startTime;
    
    // App should load quickly
    expect(loadTime).toBeLessThan(100); // Less than 100ms
    
    // Main components should be visible
    expect(screen.getByText('Chess Game')).toBeInTheDocument();
    expect(screen.getByTestId('chessboard')).toBeInTheDocument();
  });

  test('timer setup is responsive and immediate', async () => {
    render(<App />);
    
    // Timer setup should be visible
    expect(screen.getByText('Time Control')).toBeInTheDocument();
    
    const startTime = performance.now();
    
    // Click 1-minute timer
    fireEvent.click(screen.getByText('1 min'));
    
    // Should respond immediately
    await waitFor(() => {
      expect(screen.getByText('Chess Clock')).toBeInTheDocument();
    });
    
    const responseTime = performance.now() - startTime;
    
    // UI should respond within 50ms
    expect(responseTime).toBeLessThan(50);
    
    // Both timers should show 1:00
    expect(screen.getAllByText('1:00')).toHaveLength(2);
  });

  test('game mode switching is smooth and fast', async () => {
    render(<App />);
    
    // Find game mode selector
    expect(screen.getByText('Game Mode')).toBeInTheDocument();
    
    const startTime = performance.now();
    
    // Switch to AI mode
    fireEvent.click(screen.getByText('Human vs Computer'));
    
    await waitFor(() => {
      expect(screen.getByText('Computer plays:')).toBeInTheDocument();
    });
    
    const switchTime = performance.now() - startTime;
    
    // Mode switching should be instant
    expect(switchTime).toBeLessThan(30);
    
    // Difficulty selector should be visible
    expect(screen.getByText('Difficulty Level:')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  test('difficulty level changes are immediate', async () => {
    render(<App />);
    
    // Switch to AI mode first
    fireEvent.click(screen.getByText('Human vs Computer'));
    
    await waitFor(() => {
      expect(screen.getByText('Difficulty Level:')).toBeInTheDocument();
    });
    
    // Test difficulty changes
    const difficulties = ['Beginner', 'Easy', 'Hard', 'Expert'];
    
    for (const difficulty of difficulties) {
      const startTime = performance.now();
      
      fireEvent.click(screen.getByText(difficulty));
      
      await waitFor(() => {
        // Should update current status
        expect(screen.getByText(new RegExp(difficulty))).toBeInTheDocument();
      });
      
      const changeTime = performance.now() - startTime;
      
      // Each difficulty change should be instant
      expect(changeTime).toBeLessThan(20);
    }
  });

  test('UI remains responsive during rapid interactions', async () => {
    render(<App />);
    
    const interactions = [
      () => fireEvent.click(screen.getByText('1 min')),
      () => fireEvent.click(screen.getByText('Change Time')),
      () => fireEvent.click(screen.getByText('5 min')),
      () => fireEvent.click(screen.getByText('Change Time')),
      () => fireEvent.click(screen.getByText('Human vs Computer')),
      () => fireEvent.click(screen.getByText('Easy')),
      () => fireEvent.click(screen.getByText('Hard')),
    ];
    
    const startTime = performance.now();
    
    // Perform rapid interactions
    for (const interaction of interactions) {
      interaction();
      // Small delay to allow React to update
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
    }
    
    const totalTime = performance.now() - startTime;
    
    // All interactions should complete quickly
    expect(totalTime).toBeLessThan(200);
    
    // UI should still be functional
    expect(screen.getByText('Chess Game')).toBeInTheDocument();
    expect(screen.getByText('Hard')).toBeInTheDocument();
  });

  test('browser performance indicators', () => {
    // Test basic browser performance indicators
    const start = performance.now();
    
    // Simulate DOM operations
    const elements = [];
    for (let i = 0; i < 100; i++) {
      const div = document.createElement('div');
      div.textContent = `Test element ${i}`;
      elements.push(div);
    }
    
    // Clean up
    elements.forEach(el => el.remove());
    
    const domTime = performance.now() - start;
    
    console.log(`DOM operations took: ${domTime.toFixed(2)}ms`);
    
    // Should be very fast
    expect(domTime).toBeLessThan(50);
    
    // Check memory usage if available
    if ((performance as any).memory) {
      const memory = (performance as any).memory;
      console.log(`Memory usage: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory usage should be reasonable (under 100MB)
      expect(memory.usedJSHeapSize).toBeLessThan(100 * 1024 * 1024);
    }
  });

  test('provides performance recommendations', () => {
    const recommendations = [];
    
    // Check user agent
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('firefox')) {
      recommendations.push('✓ Firefox detected - generally good performance');
      
      if (userAgent.includes('mobile')) {
        recommendations.push('⚠️ Mobile Firefox may have slower AI performance');
      }
    }
    
    if (userAgent.includes('chrome')) {
      recommendations.push('✓ Chrome detected - excellent JavaScript performance');
    }
    
    if (userAgent.includes('safari')) {
      recommendations.push('✓ Safari detected - good performance, may have timing differences');
    }
    
    // Check available features
    if (typeof Worker !== 'undefined') {
      recommendations.push('✓ Web Workers available - could improve AI performance');
    }
    
    if (typeof SharedArrayBuffer !== 'undefined') {
      recommendations.push('✓ SharedArrayBuffer available - excellent for performance');
    }
    
    // Check timing precision
    const t1 = performance.now();
    const t2 = performance.now();
    const precision = t2 - t1;
    
    if (precision < 0.1) {
      recommendations.push('✓ High-precision timing available');
    } else {
      recommendations.push('⚠️ Limited timing precision - may affect performance measurements');
    }
    
    console.log('Performance Recommendations:');
    recommendations.forEach(rec => console.log(`  ${rec}`));
    
    // Always pass but provide useful info
    expect(recommendations.length).toBeGreaterThan(0);
  });
});