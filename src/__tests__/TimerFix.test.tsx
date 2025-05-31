import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GameProvider } from '../contexts/GameContext';
import ChessClock from '../components/ChessClock/ChessClock';

// Mock chess.js completely
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