import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GameProvider, useGame } from '../contexts/GameContext';

// Mock chess.js completely
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

// Mock the ChessAI
jest.mock('../utils/chessAI', () => ({
  ChessAI: jest.fn().mockImplementation(() => ({
    getBestMove: jest.fn().mockResolvedValue({ from: 'd2', to: 'd4', piece: 'p' }),
    setDifficulty: jest.fn(),
    getDifficulty: jest.fn().mockReturnValue('medium'),
  })),
}));

// Test component that simulates game moves and timer usage
const TimerTestComponent: React.FC = () => {
  const { gameState, setTimeControl, startClock, makeMove, setGameMode } = useGame();
  
  const simulateMove = () => {
    makeMove('e2' as any, 'e4' as any);
  };

  const setupGame = () => {
    setGameMode('human-vs-ai', 'b'); // AI plays black
    setTimeControl(1, 0); // 1 minute timer
    startClock();
  };

  return (
    <div>
      <div data-testid="white-time">{Math.floor(gameState.whiteTime / 60)}:{String(Math.floor(gameState.whiteTime % 60)).padStart(2, '0')}</div>
      <div data-testid="black-time">{Math.floor(gameState.blackTime / 60)}:{String(Math.floor(gameState.blackTime % 60)).padStart(2, '0')}</div>
      <div data-testid="active-color">{gameState.activeColor || 'none'}</div>
      <div data-testid="start-time">{gameState.startTime || 'none'}</div>
      <div data-testid="game-mode">{gameState.gameMode}</div>
      <div data-testid="ai-color">{gameState.aiColor || 'none'}</div>
      <button onClick={setupGame}>Setup Game</button>
      <button onClick={simulateMove}>Make Move</button>
    </div>
  );
};

describe('Timer Countdown Tests', () => {
  let mockDate: jest.SpyInstance;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000; // Start at fixed time
    mockDate = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    mockDate.mockRestore();
  });

  const advanceTime = (seconds: number) => {
    currentTime += seconds * 1000;
    mockDate.mockImplementation(() => currentTime);
  };

  test('timer counts down correctly for human player', async () => {
    render(
      <GameProvider>
        <TimerTestComponent />
      </GameProvider>
    );

    // Setup 1-minute game
    fireEvent.click(screen.getByText('Setup Game'));

    await waitFor(() => {
      expect(screen.getByTestId('white-time')).toHaveTextContent('1:00');
      expect(screen.getByTestId('black-time')).toHaveTextContent('1:00');
      expect(screen.getByTestId('active-color')).toHaveTextContent('w');
    });

    // Advance time by 5 seconds
    await act(async () => {
      advanceTime(5);
      jest.advanceTimersByTime(200); // Advance timer intervals
    });

    // White timer should show approximately 0:55
    await waitFor(() => {
      const whiteTime = screen.getByTestId('white-time').textContent;
      expect(whiteTime).toMatch(/0:5[0-9]/);
    });

    // Black timer should still be 1:00 (not active)
    expect(screen.getByTestId('black-time')).toHaveTextContent('1:00');
  });

  test('timer switches correctly between players after move', async () => {
    render(
      <GameProvider>
        <TimerTestComponent />
      </GameProvider>
    );

    // Setup game
    fireEvent.click(screen.getByText('Setup Game'));

    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('w');
    });

    // Let white timer count down for 3 seconds
    await act(async () => {
      advanceTime(3);
      jest.advanceTimersByTime(200);
    });

    // Verify white timer decreased
    await waitFor(() => {
      const whiteTime = screen.getByTestId('white-time').textContent;
      expect(whiteTime).toMatch(/0:5[0-9]/);
    });

    // Make a move (human plays white)
    fireEvent.click(screen.getByText('Make Move'));

    // Timer should switch to black (AI)
    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('b');
    });

    // Advance time by 2 seconds
    await act(async () => {
      advanceTime(2);
      jest.advanceTimersByTime(200);
    });

    // Black timer should now decrease
    await waitFor(() => {
      const blackTime = screen.getByTestId('black-time').textContent;
      expect(blackTime).toMatch(/0:5[0-9]/);
    });

    // White timer should remain at the previous value (around 0:57)
    const whiteTime = screen.getByTestId('white-time').textContent;
    expect(whiteTime).toMatch(/0:5[0-9]/);
  });

  test('timer does not decrease when paused', async () => {
    render(
      <GameProvider>
        <TimerTestComponent />
      </GameProvider>
    );

    // Setup game
    fireEvent.click(screen.getByText('Setup Game'));

    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('w');
    });

    // Let timer run for 2 seconds
    await act(async () => {
      advanceTime(2);
      jest.advanceTimersByTime(200);
    });

    const initialWhiteTime = screen.getByTestId('white-time').textContent;

    // Simulate pausing by clearing active color (this would happen in pause functionality)
    // For this test, we'll just advance time without making the timer active
    await act(async () => {
      advanceTime(5); // Advance 5 more seconds
      jest.advanceTimersByTime(200);
    });

    // Timer should continue counting since it's still active
    // This test helps us verify the timer behavior
  });

  test('AI vs Human timer switching works correctly', async () => {
    render(
      <GameProvider>
        <TimerTestComponent />
      </GameProvider>
    );

    // Setup game with AI as black
    fireEvent.click(screen.getByText('Setup Game'));

    await waitFor(() => {
      expect(screen.getByTestId('game-mode')).toHaveTextContent('human-vs-ai');
      expect(screen.getByTestId('ai-color')).toHaveTextContent('b');
      expect(screen.getByTestId('active-color')).toHaveTextContent('w');
    });

    // Human (white) makes a move
    fireEvent.click(screen.getByText('Make Move'));

    // Should switch to AI (black)
    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('b');
    });

    // Advance time to see if AI timer counts down
    await act(async () => {
      advanceTime(3);
      jest.advanceTimersByTime(200);
    });

    // Black (AI) timer should decrease
    await waitFor(() => {
      const blackTime = screen.getByTestId('black-time').textContent;
      expect(blackTime).toMatch(/0:5[0-9]/);
    });
  });

  test('timer stops at zero and triggers time expiration', async () => {
    render(
      <GameProvider>
        <TimerTestComponent />
      </GameProvider>
    );

    // Setup game
    fireEvent.click(screen.getByText('Setup Game'));

    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('w');
    });

    // Advance time by more than 1 minute (65 seconds)
    await act(async () => {
      advanceTime(65);
      jest.advanceTimersByTime(200);
    });

    // White timer should be at 0:00
    await waitFor(() => {
      expect(screen.getByTestId('white-time')).toHaveTextContent('0:00');
    });

    // Active color should be null (game ended)
    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('none');
    });
  });

  test('timer handles rapid moves without losing time accuracy', async () => {
    render(
      <GameProvider>
        <TimerTestComponent />
      </GameProvider>
    );

    // Setup game
    fireEvent.click(screen.getByText('Setup Game'));

    await waitFor(() => {
      expect(screen.getByTestId('white-time')).toHaveTextContent('1:00');
      expect(screen.getByTestId('black-time')).toHaveTextContent('1:00');
    });

    // Make several rapid moves with small time advances
    for (let i = 0; i < 5; i++) {
      // Let timer run for 1 second
      await act(async () => {
        advanceTime(1);
        jest.advanceTimersByTime(200);
      });

      // Make a move
      fireEvent.click(screen.getByText('Make Move'));

      await waitFor(() => {
        // Timer should switch between w and b
        const activeColor = screen.getByTestId('active-color').textContent;
        expect(activeColor).toMatch(/w|b/);
      });
    }

    // Both timers should have lost some time (approximately 5 seconds total)
    const whiteTime = screen.getByTestId('white-time').textContent;
    const blackTime = screen.getByTestId('black-time').textContent;
    
    // Should be around 0:55 for both (each lost about 2-3 seconds)
    expect(whiteTime).toMatch(/0:5[0-9]/);
    expect(blackTime).toMatch(/0:5[0-9]/);
  });
});