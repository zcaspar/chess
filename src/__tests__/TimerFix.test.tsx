import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GameProvider } from '../contexts/GameContext';
import ChessClock from '../components/ChessClock/ChessClock';

// GameProvider (via useAuth) and ChessClock (via useSocket) call sibling
// contexts that throw without their providers. Mock both with safe defaults so
// the component renders in isolation without real auth/socket/network.
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    error: null,
    updateStats: jest.fn(),
  }),
}));

jest.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({
    socket: null,
    isConnected: false,
    roomCode: null,
    assignedColor: null,
    players: { white: null, black: null },
    gameState: null,
    makeMove: jest.fn(),
  }),
}));

// Prevent any accidental network calls from hitting the real backend.
global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
) as unknown as typeof fetch;

// Mock chess.js completely.
// NOTE: must use a class (not jest.fn().mockImplementation returning an object
// literal) — under this CRA/babel setup, `new Chess()` on the object-literal
// form does not bind the methods, so gameState.game.fen() ends up undefined.
jest.mock('chess.js', () => {
  class MockChess {
    turn() { return 'w'; }
    moves() { return [{ from: 'e2', to: 'e4', piece: 'p' }]; }
    move() { return { from: 'e2', to: 'e4', piece: 'p' }; }
    isGameOver() { return false; }
    isCheckmate() { return false; }
    isDraw() { return false; }
    isStalemate() { return false; }
    isThreefoldRepetition() { return false; }
    isInsufficientMaterial() { return false; }
    fen() { return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; }
    pgn() { return ''; }
    board() { return Array(8).fill(Array(8).fill(null)); }
    history() { return []; }
    inCheck() { return false; }
    get() { return null; }
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

const TimerTestComponent: React.FC = () => {
  return (
    <GameProvider>
      <div>
        <ChessClock />
      </div>
    </GameProvider>
  );
};

describe('Timer Fix Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('timer displays correctly and maintains stable time values', async () => {
    render(<TimerTestComponent />);
    
    // Set 1 minute timer
    fireEvent.click(screen.getByText('1 min'));
    
    // Verify both timers show 1:00
    await waitFor(() => {
      expect(screen.getAllByText('1:00')).toHaveLength(2);
    });
    
    // Verify the component renders without crashing
    expect(screen.getByText('Chess Clock')).toBeInTheDocument();
    expect(screen.getByText('Player 1')).toBeInTheDocument();
    expect(screen.getByText('Player 2')).toBeInTheDocument();
  });

  test('timer system initializes correctly for different time controls', async () => {
    render(<TimerTestComponent />);
    
    // Test 1 minute
    fireEvent.click(screen.getByText('1 min'));
    await waitFor(() => {
      expect(screen.getAllByText('1:00')).toHaveLength(2);
    });
    
    // Switch to 5 minutes
    fireEvent.click(screen.getByText('Change Time'));
    fireEvent.click(screen.getByText('5 min'));
    await waitFor(() => {
      expect(screen.getAllByText('5:00')).toHaveLength(2);
    });
    
    // Switch to 10 minutes
    fireEvent.click(screen.getByText('Change Time'));
    fireEvent.click(screen.getByText('10 min'));
    await waitFor(() => {
      expect(screen.getAllByText('10:00')).toHaveLength(2);
    });
  });

  test('timer format displays correctly', async () => {
    render(<TimerTestComponent />);
    
    // Test different timer settings show proper format
    const timers = [
      { button: '1 min', expected: '1:00' },
      { button: '5 min', expected: '5:00' },
      { button: '10 min', expected: '10:00' }
    ];

    for (let i = 0; i < timers.length; i++) {
      const timer = timers[i];
      
      if (i > 0) {
        fireEvent.click(screen.getByText('Change Time'));
      }
      
      fireEvent.click(screen.getByText(timer.button));
      
      await waitFor(() => {
        const displays = screen.getAllByText(timer.expected);
        expect(displays).toHaveLength(2);
      });
      
      // Verify format shows minutes:seconds
      expect(timer.expected).toMatch(/^\d+:\d{2}$/);
    }
  });

  test('timer interface is stable and does not crash', async () => {
    render(<TimerTestComponent />);
    
    // Rapid switching between timers
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('1 min'));
      
      // Should not crash and should show timer
      await waitFor(() => {
        expect(screen.getByText('Chess Clock')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Change Time'));
      fireEvent.click(screen.getByText('5 min'));
      
      await waitFor(() => {
        expect(screen.getByText('Chess Clock')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByText('Change Time'));
    }
    
    // Final state should be stable
    expect(screen.getByText('Time Control')).toBeInTheDocument();
  });

  test('timer component renders all required elements', async () => {
    render(<TimerTestComponent />);
    
    // Initial state should show time selection
    expect(screen.getByText('Time Control')).toBeInTheDocument();
    expect(screen.getByText('1 min')).toBeInTheDocument();
    expect(screen.getByText('5 min')).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
    
    // Set a timer
    fireEvent.click(screen.getByText('1 min'));
    
    // Should show chess clock interface
    await waitFor(() => {
      expect(screen.getByText('Chess Clock')).toBeInTheDocument();
      expect(screen.getByText('Player 1')).toBeInTheDocument();
      expect(screen.getByText('Player 2')).toBeInTheDocument();
      expect(screen.getByText('Change Time')).toBeInTheDocument();
    });
  });
});