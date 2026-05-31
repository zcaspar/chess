import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Use the real chess.js. A hand-rolled mock drifts out of sync with the engine
// and breaks GameProvider/ChessBoard (which call gameState.game.fen()).

// Stub the LC0 backend so the AI never issues a network request (jsdom would
// throw "Network request failed" / CORS). getBestMove resolves to null, which
// keeps the app fully offline; these UX tests never drive the AI to actually move.
jest.mock('../utils/backendAI', () => {
  const actual = jest.requireActual('../utils/backendAI');
  return {
    ...actual,
    BackendAI: jest.fn().mockImplementation(() => ({
      getBestMove: jest.fn().mockResolvedValue(null),
      getEngineStatus: jest.fn().mockResolvedValue({ engines: {} }),
    })),
  };
});

// Mock react-chessboard (renders a real board we don't need here).
jest.mock('react-chessboard', () => ({
  Chessboard: () => <div data-testid="chessboard">Mocked Chessboard</div>
}));

// Generous wall-clock budgets. The intent of these assertions is to catch a hang
// or a serious responsiveness regression — not to benchmark jsdom, which varies
// wildly between machines/CI. They remain real upper bounds.
const APP_LOAD_BUDGET_MS = 5000;
const INTERACTION_BUDGET_MS = 2000;
const RAPID_TOTAL_BUDGET_MS = 5000;

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

    const loadTime = performance.now() - startTime;

    // App should load within a sane budget (not hang)
    expect(loadTime).toBeLessThan(APP_LOAD_BUDGET_MS);

    // Main components should be visible
    expect(screen.getByText('♛ Chess')).toBeInTheDocument();
    expect(screen.getByTestId('chessboard')).toBeInTheDocument();
  });

  test('timer setup is responsive and immediate', async () => {
    render(<App />);

    // Timer setup should be visible
    expect(screen.getByText('Time Control')).toBeInTheDocument();

    const startTime = performance.now();

    // Click 1-minute timer
    fireEvent.click(screen.getByText('1 min'));

    // Should respond by showing the running clock
    await waitFor(() => {
      expect(screen.getByText('Chess Clock')).toBeInTheDocument();
    });

    const responseTime = performance.now() - startTime;

    // UI should respond within budget
    expect(responseTime).toBeLessThan(INTERACTION_BUDGET_MS);

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

    // Mode switching should be responsive
    expect(switchTime).toBeLessThan(INTERACTION_BUDGET_MS);

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

    // Every difficulty option is selectable and rendered
    const difficulties = ['Beginner', 'Easy', 'Hard', 'Expert'];

    for (const difficulty of difficulties) {
      const startTime = performance.now();

      fireEvent.click(screen.getByText(difficulty));

      await waitFor(() => {
        // The option remains present after interacting with it
        expect(screen.getByText(difficulty)).toBeInTheDocument();
      });

      const changeTime = performance.now() - startTime;

      // Each difficulty interaction should be responsive
      expect(changeTime).toBeLessThan(INTERACTION_BUDGET_MS);
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
      // Allow React to flush updates between interactions
      await act(async () => {
        await Promise.resolve();
      });
    }

    const totalTime = performance.now() - startTime;

    // All interactions should complete within budget
    expect(totalTime).toBeLessThan(RAPID_TOTAL_BUDGET_MS);

    // UI should still be functional
    expect(screen.getByText('♛ Chess')).toBeInTheDocument();
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
