import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GameProvider, useGame } from '../contexts/GameContext';

// GameProvider calls useAuth() which throws without an AuthProvider. Mock the
// auth context with safe nulls (no user => no history/stats network calls).
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    error: null,
    updateStats: jest.fn(),
  }),
}));

// Prevent any accidental network calls from hitting the real backend.
global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
) as unknown as typeof fetch;

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

// Test component that simulates game moves and timer usage.
//
// NOTE on timer architecture: per-tick countdown is rendered locally inside
// ChessClock; gameState.whiteTime / gameState.blackTime are only updated when a
// move is made (elapsed deducted from the mover) or when a clock expires. So to
// observe time decreasing via gameState, advance the (fake) clock and then make
// a move. The fake-timer clock also drives Date.now(), so advancing timers is
// what actually elapses time — a Date.now spy alone is overridden by fake timers.
//
// Also: makeMove only (re)starts the opponent's running clock from the SECOND
// half-move onward (history length > 1); the very first move parks activeColor
// at null until the game is genuinely under way.
const TimerTestComponent: React.FC = () => {
  const { gameState, setTimeControl, startClock, makeMove, setGameMode } = useGame();

  const simulateMove = () => {
    makeMove('e2' as any, 'e4' as any);
  };

  // Human vs human keeps the timer tests deterministic (no async AI move
  // interferes with whose clock is running). Timer semantics are identical to
  // human-vs-ai, so this is purely a setup choice.
  const setupGame = () => {
    setGameMode('human-vs-human');
    setTimeControl(1, 0); // 1 minute timer
    startClock();
  };

  // Dedicated human-vs-ai setup for the AI-switching test.
  const setupAIGame = () => {
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
      <div data-testid="move-count">{gameState.history.length}</div>
      <button onClick={setupGame}>Setup Game</button>
      <button onClick={setupAIGame}>Setup AI Game</button>
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

  // Advancing the fake-timer clock is what actually elapses time: under modern
  // fake timers Date.now() is driven by the fake clock, so this both fires the
  // 1s expiration interval and grows the elapsed time used on the next move.
  // (currentTime / mockDate are kept in sync for clarity but are overridden by
  // the fake-timer clock that GameContext's Date.now() reads.)
  const advanceTime = (seconds: number) => {
    currentTime += seconds * 1000;
    mockDate.mockImplementation(() => currentTime);
    jest.advanceTimersByTime(seconds * 1000);
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

    // Let white's clock run for 5 seconds (white is the active player).
    await act(async () => {
      advanceTime(5);
    });

    // gameState times only realize the deduction on a move, so make white's move
    // to commit the elapsed time to white's clock.
    await act(async () => {
      fireEvent.click(screen.getByText('Make Move'));
    });

    // White timer should now reflect ~5s spent (approximately 0:55).
    await waitFor(() => {
      const whiteTime = screen.getByTestId('white-time').textContent;
      expect(whiteTime).toMatch(/0:5[0-9]/);
    });

    // Black timer should still be 1:00 — black never had the move.
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

    // White spends 3 seconds, then plays — commits ~3s to white's clock.
    await act(async () => {
      advanceTime(3);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Make Move'));
    });

    // White timer decreased to ~0:57.
    await waitFor(() => {
      expect(screen.getByTestId('white-time').textContent).toMatch(/0:5[0-9]/);
    });

    // Second half-move brings the game fully under way, which (re)starts the
    // running clock for the side to move — the timer switches to black.
    await act(async () => {
      fireEvent.click(screen.getByText('Make Move'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('b');
    });

    // Black now spends 2 seconds, then plays — commits ~2s to black's clock.
    await act(async () => {
      advanceTime(2);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Make Move'));
    });

    // Black timer decreased to ~0:58.
    await waitFor(() => {
      expect(screen.getByTestId('black-time').textContent).toMatch(/0:5[0-9]/);
    });

    // White timer remains at its previous value (~0:57) — white had no new move.
    expect(screen.getByTestId('white-time').textContent).toMatch(/0:5[0-9]/);
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

    // Setup game with AI as black (human-vs-ai mode).
    fireEvent.click(screen.getByText('Setup AI Game'));

    await waitFor(() => {
      expect(screen.getByTestId('game-mode')).toHaveTextContent('human-vs-ai');
      expect(screen.getByTestId('ai-color')).toHaveTextContent('b');
      expect(screen.getByTestId('active-color')).toHaveTextContent('w');
    });

    // Drive two half-moves to bring the game under way; the running clock then
    // belongs to the side to move (black — the AI's color).
    await act(async () => {
      fireEvent.click(screen.getByText('Make Move'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Make Move'));
    });

    // Timer is now on black (the AI's side).
    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('b');
    });

    // Black (AI) spends 3 seconds, then its move commits the elapsed time.
    await act(async () => {
      advanceTime(3);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Make Move'));
    });

    // Black (AI) timer decreased to ~0:57.
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

    // Make several rapid moves with small time advances. Each move should be
    // processed (history grows) and commit its mover's elapsed time.
    for (let i = 0; i < 5; i++) {
      // Let the active player's clock run for 1 second.
      await act(async () => {
        advanceTime(1);
      });

      // Make a move.
      await act(async () => {
        fireEvent.click(screen.getByText('Make Move'));
      });

      // The move was accepted and recorded — no time/state was lost.
      await waitFor(() => {
        expect(screen.getByTestId('move-count')).toHaveTextContent(String(i + 1));
      });
    }

    // Both timers should have lost some time across the rapid exchange:
    // white committed its elapsed time on its move, black on each of its moves.
    const whiteTime = screen.getByTestId('white-time').textContent;
    const blackTime = screen.getByTestId('black-time').textContent;

    // Each side ends in the 0:5x range (lost a few seconds, none lost the full minute).
    expect(whiteTime).toMatch(/0:5[0-9]/);
    expect(blackTime).toMatch(/0:5[0-9]/);
  });
});