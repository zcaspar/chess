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

// Mock the ChessAI to make moves instantly
jest.mock('../utils/chessAI', () => ({
  ChessAI: jest.fn().mockImplementation(() => ({
    getBestMove: jest.fn().mockResolvedValue({ from: 'd2', to: 'd4', piece: 'p' }),
    setDifficulty: jest.fn(),
    getDifficulty: jest.fn().mockReturnValue('medium'),
  })),
}));

// Mock react-chessboard to avoid rendering issues
jest.mock('react-chessboard', () => ({
  Chessboard: () => <div data-testid="chessboard">Mocked Chessboard</div>
}));

// Helper component that wraps only the timer component
const TimerTestComponent: React.FC = () => {
  return (
    <GameProvider>
      <div>
        <ChessClock />
      </div>
    </GameProvider>
  );
};

describe('Chess Timer Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Timer Button Tests', () => {
    test('1 minute timer button sets correct time', async () => {
      render(<TimerTestComponent />);
      
      // Click the 1 minute button
      const oneMinButton = screen.getByText('1 min');
      fireEvent.click(oneMinButton);

      // Verify the time display shows 1:00 for both players
      await waitFor(() => {
        const timeDisplays = screen.getAllByText('1:00');
        expect(timeDisplays).toHaveLength(2); // White and Black timers
      });
    });

    test('5 minute timer button sets correct time', async () => {
      render(<TimerTestComponent />);
      
      // Click the 5 minute button
      const fiveMinButton = screen.getByText('5 min');
      fireEvent.click(fiveMinButton);

      // Verify the time display shows 5:00 for both players
      await waitFor(() => {
        const timeDisplays = screen.getAllByText('5:00');
        expect(timeDisplays).toHaveLength(2); // White and Black timers
      });
    });

    test('10 minute timer button sets correct time', async () => {
      render(<TimerTestComponent />);
      
      // Click the 10 minute button
      const tenMinButton = screen.getByText('10 min');
      fireEvent.click(tenMinButton);

      // Verify the time display shows 10:00 for both players
      await waitFor(() => {
        const timeDisplays = screen.getAllByText('10:00');
        expect(timeDisplays).toHaveLength(2); // White and Black timers
      });
    });
  });

  describe('Timer Reset and Control Tests', () => {
    test('timer resets properly when switching between different time controls', async () => {
      render(<TimerTestComponent />);
      
      // Start with 1 minute
      fireEvent.click(screen.getByText('1 min'));
      await waitFor(() => {
        expect(screen.getAllByText('1:00')).toHaveLength(2);
      });

      // Click "Change Time" to access other timer buttons
      fireEvent.click(screen.getByText('Change Time'));
      
      // Switch to 5 minutes
      fireEvent.click(screen.getByText('5 min'));
      await waitFor(() => {
        expect(screen.getAllByText('5:00')).toHaveLength(2);
      });

      // Click "Change Time" again to access other timer buttons
      fireEvent.click(screen.getByText('Change Time'));

      // Switch to 10 minutes
      fireEvent.click(screen.getByText('10 min'));
      await waitFor(() => {
        expect(screen.getAllByText('10:00')).toHaveLength(2);
      });

      // Verify no 1:00 or 5:00 times remain
      expect(screen.queryByText('1:00')).not.toBeInTheDocument();
      expect(screen.queryByText('5:00')).not.toBeInTheDocument();
    });

    test('timer UI displays correctly after selection', async () => {
      render(<TimerTestComponent />);
      
      // Set 5 minute timer
      fireEvent.click(screen.getByText('5 min'));
      
      await waitFor(() => {
        expect(screen.getAllByText('5:00')).toHaveLength(2);
      });

      // Verify the timer interface is displayed
      expect(screen.getByText('Chess Clock')).toBeInTheDocument();
      expect(screen.getByText('Player 1')).toBeInTheDocument();
      expect(screen.getByText('Player 2')).toBeInTheDocument();
      expect(screen.getByText('Change Time')).toBeInTheDocument();
      
      // Verify the time description
      expect(screen.getByText('5 minutes per side')).toBeInTheDocument();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('timer handles rapid button clicks without breaking', async () => {
      render(<TimerTestComponent />);
      
      // First click 1 min to set timer, then change between options
      fireEvent.click(screen.getByText('1 min'));
      
      // Then click change time and rapidly switch
      fireEvent.click(screen.getByText('Change Time'));
      fireEvent.click(screen.getByText('5 min'));
      
      fireEvent.click(screen.getByText('Change Time'));
      fireEvent.click(screen.getByText('10 min'));
      
      fireEvent.click(screen.getByText('Change Time'));
      fireEvent.click(screen.getByText('1 min'));

      // Final state should be 1 minute
      await waitFor(() => {
        expect(screen.getAllByText('1:00')).toHaveLength(2);
      });
    });

    test('timer displays format correctly for various time values', async () => {
      render(<TimerTestComponent />);
      
      // Test each timer setting
      const timers = [
        { button: '1 min', expected: '1:00' },
        { button: '5 min', expected: '5:00' },
        { button: '10 min', expected: '10:00' }
      ];

      for (let i = 0; i < timers.length; i++) {
        const timer = timers[i];
        
        if (i > 0) {
          // Need to click "Change Time" to access buttons after first selection
          fireEvent.click(screen.getByText('Change Time'));
        }
        
        fireEvent.click(screen.getByText(timer.button));
        await waitFor(() => {
          expect(screen.getAllByText(timer.expected)).toHaveLength(2);
        });
      }
    });

    test('timer buttons are accessible and functional', async () => {
      render(<TimerTestComponent />);
      
      // Verify all timer buttons exist
      expect(screen.getByText('1 min')).toBeInTheDocument();
      expect(screen.getByText('5 min')).toBeInTheDocument();
      expect(screen.getByText('10 min')).toBeInTheDocument();
      
      // Verify they're clickable
      const oneMinButton = screen.getByText('1 min');
      expect(oneMinButton).toBeEnabled();
      
      fireEvent.click(oneMinButton);
      
      // Should show corresponding time
      await waitFor(() => {
        expect(screen.getAllByText('1:00')).toHaveLength(2);
      });
    });

    test('change time button works correctly', async () => {
      render(<TimerTestComponent />);
      
      // Initially should show time selection interface
      expect(screen.getByText('Time Control')).toBeInTheDocument();
      expect(screen.getByText('1 min')).toBeInTheDocument();
      expect(screen.getByText('5 min')).toBeInTheDocument();
      expect(screen.getByText('10 min')).toBeInTheDocument();
      
      // Set a timer
      fireEvent.click(screen.getByText('5 min'));
      await waitFor(() => {
        expect(screen.getAllByText('5:00')).toHaveLength(2);
        expect(screen.getByText('Chess Clock')).toBeInTheDocument();
      });
      
      // Click "Change Time" to go back to selection
      fireEvent.click(screen.getByText('Change Time'));
      
      // Should show time selection interface again
      await waitFor(() => {
        expect(screen.getByText('Time Control')).toBeInTheDocument();
        expect(screen.getByText('1 min')).toBeInTheDocument();
      });
    });
  });
});