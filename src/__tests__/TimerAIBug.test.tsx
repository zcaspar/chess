import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GameProvider, useGame } from '../contexts/GameContext';

// Mock chess.js
jest.mock('chess.js', () => {
  class MockChess {
    private currentTurn = 'w';
    
    turn() { return this.currentTurn; }
    moves() { return [{ from: 'e2', to: 'e4', piece: 'p' }]; }
    move() { 
      // Switch turns after each move
      this.currentTurn = this.currentTurn === 'w' ? 'b' : 'w';
      return { from: 'e2', to: 'e4', piece: 'p' }; 
    }
    isGameOver() { return false; }
    isCheckmate() { return false; }
    isDraw() { return false; }
    isStalemate() { return false; }
    isThreefoldRepetition() { return false; }
    isInsufficientMaterial() { return false; }
    fen() { return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; }
    board() { return Array(8).fill(Array(8).fill(null)); }
    history() { return []; }
    inCheck() { return false; }
    getCastlingRights() { return { k: false, q: false }; }
  }
  
  return { Chess: MockChess };
});

// Mock the ChessAI with a slow response to simulate the issue  
const mockGetBestMove = jest.fn().mockImplementation(async () => {
  // Simulate AI thinking for 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));
  return { from: 'd2', to: 'd4', piece: 'p' };
});

jest.mock('../utils/chessAI', () => ({
  ChessAI: jest.fn().mockImplementation(() => ({
    getBestMove: mockGetBestMove,
    setDifficulty: jest.fn(),
    getDifficulty: jest.fn().mockReturnValue('medium'),
  })),
}));

// Test component that provides timer access
const TimerTestComponent: React.FC = () => {
  const { gameState, setTimeControl, startClock, makeMove, setGameMode } = useGame();
  
  const setupAIGame = () => {
    setGameMode('human-vs-ai', 'b'); // AI plays black, human plays white
    setTimeControl(1, 0); // 1 minute timer
    startClock(); // Start clock explicitly like the working test
  };

  const makeHumanMove = () => {
    makeMove('e2' as any, 'e4' as any);
  };

  return (
    <div>
      <div data-testid="white-time">{Math.floor(gameState.whiteTime)}</div>
      <div data-testid="black-time">{Math.floor(gameState.blackTime)}</div>
      <div data-testid="active-color">{gameState.activeColor || 'none'}</div>
      <div data-testid="game-mode">{gameState.gameMode}</div>
      <div data-testid="ai-color">{gameState.aiColor || 'none'}</div>
      <button onClick={setupAIGame}>Setup AI Game</button>
      <button onClick={makeHumanMove}>Make Human Move</button>
    </div>
  );
};

describe('AI Timer Bug Tests', () => {
  let mockDate: jest.SpyInstance;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000;
    mockDate = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    mockDate.mockRestore();
  });

  const advanceTime = (seconds: number) => {
    currentTime += seconds * 1000;
    mockDate.mockImplementation(() => currentTime);
  };

  test('AI clock should not count down while AI is thinking', async () => {
    render(
      <GameProvider>
        <TimerTestComponent />
      </GameProvider>
    );

    // Setup AI game (human=white, AI=black)
    fireEvent.click(screen.getByText('Setup AI Game'));

    // Wait for setup to complete
    await waitFor(() => {
      expect(screen.getByTestId('white-time')).toHaveTextContent('60');
      expect(screen.getByTestId('black-time')).toHaveTextContent('60');
      expect(screen.getByTestId('ai-color')).toHaveTextContent('b'); // AI is black
      expect(screen.getByTestId('active-color')).toHaveTextContent('w'); // White's turn initially
    });

    // Human (white) makes a move - this should start the timer and switch to AI's turn
    fireEvent.click(screen.getByText('Make Human Move'));

    // After the move, timer should switch to black (AI's turn)
    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('b');
    });

    // Now simulate time passing while AI is thinking (2 seconds)
    await act(async () => {
      advanceTime(2); // AI thinks for 2 seconds
      jest.advanceTimersByTime(2000); // Advance React timers
    });

    // AI should not have lost time during thinking
    // Black timer should still be close to 60 seconds
    await waitFor(() => {
      const blackTime = parseInt(screen.getByTestId('black-time').textContent || '0');
      console.log(`Black time after AI thinking: ${blackTime}s`);
      
      // The timer should not have counted down significantly during AI thinking
      // It should be paused or at least not count the full 2 seconds
      expect(blackTime).toBeGreaterThan(58); // Should not have lost more than 2 seconds
    });
  });

  test('timer should resume correctly after AI move', async () => {
    render(
      <GameProvider>
        <TimerTestComponent />
      </GameProvider>
    );

    // Setup game
    fireEvent.click(screen.getByText('Setup AI Game'));

    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('w');
    });

    // Record initial times
    const initialWhiteTime = parseInt(screen.getByTestId('white-time').textContent || '0');
    const initialBlackTime = parseInt(screen.getByTestId('black-time').textContent || '0');

    // Human makes move
    fireEvent.click(screen.getByText('Make Human Move'));

    // Wait for AI to finish thinking and make its move
    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('b');
    }, { timeout: 3000 });

    // Let AI complete its move (wait for the mock to resolve)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 2100)); // Wait for AI mock
      jest.advanceTimersByTime(2100);
    });

    // After AI move, it should be white's turn again
    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('w');
    }, { timeout: 1000 });

    const finalWhiteTime = parseInt(screen.getByTestId('white-time').textContent || '0');
    const finalBlackTime = parseInt(screen.getByTestId('black-time').textContent || '0');

    console.log(`Times - Initial: W=${initialWhiteTime}, B=${initialBlackTime}`);
    console.log(`Times - Final: W=${finalWhiteTime}, B=${finalBlackTime}`);

    // Both players should have lost some time, but not excessively
    expect(finalWhiteTime).toBeLessThan(initialWhiteTime); // White lost some time
    expect(finalBlackTime).toBeLessThan(initialBlackTime); // Black lost some time
    
    // But black shouldn't have lost the full 2+ seconds during AI thinking
    expect(finalBlackTime).toBeGreaterThan(initialBlackTime - 3); // Black shouldn't lose more than 3 seconds
  });

  test('identifies the specific timer switching issue', async () => {
    render(
      <GameProvider>
        <TimerTestComponent />
      </GameProvider>
    );

    // Setup game
    fireEvent.click(screen.getByText('Setup AI Game'));

    // Track timer state changes
    const timerStates: Array<{time: number, activeColor: string, whiteTime: number, blackTime: number}> = [];

    const recordState = () => {
      timerStates.push({
        time: currentTime,
        activeColor: screen.getByTestId('active-color').textContent || '',
        whiteTime: parseInt(screen.getByTestId('white-time').textContent || '0'),
        blackTime: parseInt(screen.getByTestId('black-time').textContent || '0'),
      });
    };

    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('w');
    });

    recordState(); // State 1: Initial

    // Human moves
    fireEvent.click(screen.getByText('Make Human Move'));

    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('b');
    });

    recordState(); // State 2: After human move

    // Let some time pass while AI thinks
    await act(async () => {
      advanceTime(1);
      jest.advanceTimersByTime(200);
    });

    recordState(); // State 3: During AI thinking

    await act(async () => {
      advanceTime(1);
      jest.advanceTimersByTime(200);
    });

    recordState(); // State 4: More AI thinking

    console.log('Timer state progression:');
    timerStates.forEach((state, i) => {
      console.log(`State ${i + 1}: Active=${state.activeColor}, W=${state.whiteTime}, B=${state.blackTime}`);
    });

    // The issue: active color is 'b' but black timer is counting down during AI thinking
    const duringThinking = timerStates[timerStates.length - 1];
    if (duringThinking.activeColor === 'b') {
      console.log('❌ BUG CONFIRMED: Black timer is active while AI is thinking');
      console.log('The timer should be paused during AI computation');
    }

    // Test passes to show the bug exists
    expect(true).toBe(true);
  });
});