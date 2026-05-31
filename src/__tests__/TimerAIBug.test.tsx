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
    getEngineType: jest.fn().mockReturnValue('lc0'),
    initializeLc0: jest.fn().mockResolvedValue(undefined),
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

  // Advancing the fake-timer clock both elapses Date.now() (read by GameContext)
  // and fires the 1s clock-expiration interval. Crucially, that interval only
  // writes time to gameState on expiration — between moves a player's
  // gameState time is NOT decremented, which is the property these tests probe.
  const advanceTime = (seconds: number) => {
    currentTime += seconds * 1000;
    mockDate.mockImplementation(() => currentTime);
    jest.advanceTimersByTime(seconds * 1000);
  };

  // Bring the game under way so the running clock belongs to black (the AI's
  // side). The first half-move parks activeColor at null; the second half-move
  // starts the running clock for the side to move (black). White's elapsed time
  // is committed on its move; black's clock is left untouched at this point.
  const advanceToBlacksRunningClock = async () => {
    fireEvent.click(screen.getByText('Setup AI Game'));
    await waitFor(() => {
      expect(screen.getByTestId('ai-color')).toHaveTextContent('b');
      expect(screen.getByTestId('active-color')).toHaveTextContent('w');
    });

    // White spends 2 seconds then plays its move (commits ~2s to white).
    await act(async () => {
      advanceTime(2);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Make Human Move'));
    });
    // Second half-move switches the running clock to black.
    await act(async () => {
      fireEvent.click(screen.getByText('Make Human Move'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('b');
    });
  };

  test('AI clock should not count down while AI is thinking', async () => {
    render(
      <GameProvider>
        <TimerTestComponent />
      </GameProvider>
    );

    // Get to the point where it is black's (the AI's) turn with the clock running.
    await advanceToBlacksRunningClock();

    const blackBeforeThinking = parseInt(screen.getByTestId('black-time').textContent || '0');

    // Now simulate time passing while the AI "thinks" (2 seconds) WITHOUT the AI
    // committing a move. The clock interval runs during this window.
    await act(async () => {
      advanceTime(2); // AI thinks for 2 seconds
    });

    // AI should not have lost time during thinking: gameState.blackTime is only
    // updated when black actually moves, so it must be unchanged here.
    await waitFor(() => {
      const blackTime = parseInt(screen.getByTestId('black-time').textContent || '0');
      console.log(`Black time after AI thinking: ${blackTime}s (was ${blackBeforeThinking}s)`);

      // The AI did not lose the 2 thinking seconds.
      expect(blackTime).toBe(blackBeforeThinking);
      expect(blackTime).toBeGreaterThan(58);
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

    // White spends 2 seconds then plays — commits ~2s to white's clock.
    await act(async () => {
      advanceTime(2);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Make Human Move'));
    });

    // Second half-move switches the running clock to black (the AI's side).
    await act(async () => {
      fireEvent.click(screen.getByText('Make Human Move'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('b');
    });

    // Black "thinks" for 1 second, then commits its move. After black moves,
    // play resumes for the next side and only black's elapsed time is deducted.
    await act(async () => {
      advanceTime(1);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Make Human Move'));
    });

    const finalWhiteTime = parseInt(screen.getByTestId('white-time').textContent || '0');
    const finalBlackTime = parseInt(screen.getByTestId('black-time').textContent || '0');

    console.log(`Times - Initial: W=${initialWhiteTime}, B=${initialBlackTime}`);
    console.log(`Times - Final: W=${finalWhiteTime}, B=${finalBlackTime}`);

    // Both players should have lost some time, but not excessively.
    expect(finalWhiteTime).toBeLessThan(initialWhiteTime); // White lost ~2s
    expect(finalBlackTime).toBeLessThan(initialBlackTime); // Black lost ~1s

    // Black shouldn't have lost the full thinking window (no extra time bled off).
    expect(finalBlackTime).toBeGreaterThan(initialBlackTime - 3); // < 3s lost
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

    // First half-move (white). Commits white's elapsed time; clock parks at null.
    await act(async () => {
      fireEvent.click(screen.getByText('Make Human Move'));
    });
    // Second half-move brings the game under way; running clock switches to black.
    await act(async () => {
      fireEvent.click(screen.getByText('Make Human Move'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-color')).toHaveTextContent('b');
    });

    recordState(); // State 2: Black to move, clock running (AI about to think)

    // Let some time pass while AI thinks (clock interval runs the whole time).
    await act(async () => {
      advanceTime(1);
    });

    recordState(); // State 3: During AI thinking

    await act(async () => {
      advanceTime(1);
    });

    recordState(); // State 4: More AI thinking

    console.log('Timer state progression:');
    timerStates.forEach((state, i) => {
      console.log(`State ${i + 1}: Active=${state.activeColor}, W=${state.whiteTime}, B=${state.blackTime}`);
    });

    // The bug this test guards against: black's clock bleeding down while the AI
    // is merely thinking. With the fixed architecture, gameState.blackTime is
    // only deducted when black actually moves, so across the whole thinking
    // window (states 2 -> 4) it must be the active side but with constant time.
    const becameBlacksTurn = timerStates[1];
    const duringThinking = timerStates[timerStates.length - 1];

    expect(becameBlacksTurn.activeColor).toBe('b');
    expect(duringThinking.activeColor).toBe('b');

    // Black's clock did NOT count down during AI thinking.
    expect(duringThinking.blackTime).toBe(becameBlacksTurn.blackTime);
    expect(duringThinking.blackTime).toBeGreaterThan(58);
  });
});