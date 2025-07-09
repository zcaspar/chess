import React from 'react';
import { render, screen } from '@testing-library/react';
import MoveHistory from './MoveHistory';
import { GameProvider } from '../../contexts/GameContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { Chess } from 'chess.js';

// Mock the contexts
const mockGameState = {
  chess: new Chess(),
  board: [],
  turn: 'w' as const,
  isCheck: false,
  isCheckmate: false,
  isStalemate: false,
  isDraw: false,
  isGameOver: false,
  winner: null,
  history: [],
  currentMoveIndex: -1,
  capturedPieces: { w: [], b: [] },
  gameStartTime: Date.now(),
  lastMoveTime: Date.now(),
  timeControl: { white: 600000, black: 600000 },
  timeRemaining: { white: 600000, black: 600000 },
  connectionStatus: 'connected' as const,
  gameMode: 'local' as const,
  difficulty: 'medium' as const,
  isThinking: false,
  roomCode: null,
  playerColor: null,
  isPlayerTurn: true,
  moveNumber: 1,
  pgn: ''
};

const mockGameContext = {
  gameState: mockGameState,
  makeMove: jest.fn(),
  resetGame: jest.fn(),
  setGameMode: jest.fn(),
  setDifficulty: jest.fn(),
  resign: jest.fn(),
  offerDraw: jest.fn(),
  acceptDraw: jest.fn(),
  rejectDraw: jest.fn(),
  jumpToMove: jest.fn(),
  saveGameToHistory: jest.fn(),
  createRoom: jest.fn(),
  joinRoom: jest.fn(),
  leaveRoom: jest.fn()
};

jest.mock('../../contexts/GameContext', () => ({
  ...jest.requireActual('../../contexts/GameContext'),
  useGame: () => mockGameContext
}));

const renderMoveHistory = (customGameState = {}) => {
  mockGameContext.gameState = { ...mockGameState, ...customGameState };
  
  return render(
    <AuthProvider>
      <GameProvider>
        <MoveHistory />
      </GameProvider>
    </AuthProvider>
  );
};

describe('MoveHistory Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with no moves initially', () => {
    renderMoveHistory();
    
    expect(screen.getByText('Move History')).toBeInTheDocument();
    expect(screen.getByText('No moves yet')).toBeInTheDocument();
  });

  it('should display moves in correct format', () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4', piece: 'p', color: 'w' },
      { san: 'e5', from: 'e7', to: 'e5', piece: 'p', color: 'b' },
      { san: 'Nf3', from: 'g1', to: 'f3', piece: 'n', color: 'w' },
      { san: 'Nc6', from: 'b8', to: 'c6', piece: 'n', color: 'b' }
    ];

    renderMoveHistory({ history, currentMoveIndex: 3 });

    // Check move numbers
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();

    // Check moves
    expect(screen.getByText('e4')).toBeInTheDocument();
    expect(screen.getByText('e5')).toBeInTheDocument();
    expect(screen.getByText('Nf3')).toBeInTheDocument();
    expect(screen.getByText('Nc6')).toBeInTheDocument();
  });

  it('should highlight current move', () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4', piece: 'p', color: 'w' },
      { san: 'e5', from: 'e7', to: 'e5', piece: 'p', color: 'b' },
      { san: 'Nf3', from: 'g1', to: 'f3', piece: 'n', color: 'w' }
    ];

    renderMoveHistory({ history, currentMoveIndex: 2 });

    // The last move (Nf3) should be highlighted
    const nf3Move = screen.getByText('Nf3');
    expect(nf3Move).toHaveClass('font-bold', 'text-blue-600');
  });

  it('should handle incomplete move pairs', () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4', piece: 'p', color: 'w' },
      { san: 'e5', from: 'e7', to: 'e5', piece: 'p', color: 'b' },
      { san: 'Nf3', from: 'g1', to: 'f3', piece: 'n', color: 'w' }
    ];

    renderMoveHistory({ history, currentMoveIndex: 2 });

    // Should show 2 complete rows
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    
    // Second row should only have white's move
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 move rows
  });

  it('should show moves ahead in history message', () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4', piece: 'p', color: 'w' },
      { san: 'e5', from: 'e7', to: 'e5', piece: 'p', color: 'b' },
      { san: 'Nf3', from: 'g1', to: 'f3', piece: 'n', color: 'w' },
      { san: 'Nc6', from: 'b8', to: 'c6', piece: 'n', color: 'b' },
      { san: 'Bc4', from: 'f1', to: 'c4', piece: 'b', color: 'w' }
    ];

    // Current move is at index 1 (after e5), but history has 5 moves
    renderMoveHistory({ history, currentMoveIndex: 1 });

    expect(screen.getByText('3 move(s) ahead in history')).toBeInTheDocument();
  });

  it('should handle empty history array', () => {
    renderMoveHistory({ history: [], currentMoveIndex: -1 });
    
    expect(screen.getByText('No moves yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('should display table headers correctly', () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4', piece: 'p', color: 'w' }
    ];

    renderMoveHistory({ history, currentMoveIndex: 0 });

    expect(screen.getByText('#')).toBeInTheDocument();
    expect(screen.getByText('White')).toBeInTheDocument();
    expect(screen.getByText('Black')).toBeInTheDocument();
  });

  it('should handle very long move lists with scrolling', () => {
    // Create a long history
    const history = [];
    for (let i = 0; i < 50; i++) {
      history.push(
        { san: `move${i*2}`, from: 'a1', to: 'a2', piece: 'p', color: 'w' },
        { san: `move${i*2+1}`, from: 'a7', to: 'a6', piece: 'p', color: 'b' }
      );
    }

    renderMoveHistory({ history, currentMoveIndex: 99 });

    // Check that scrollable container exists
    const scrollContainer = screen.getByRole('table').parentElement;
    expect(scrollContainer).toHaveClass('max-h-96', 'overflow-y-auto');
  });

  it('should not show future moves message when at latest move', () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4', piece: 'p', color: 'w' },
      { san: 'e5', from: 'e7', to: 'e5', piece: 'p', color: 'b' }
    ];

    renderMoveHistory({ history, currentMoveIndex: 1 });

    expect(screen.queryByText(/move\(s\) ahead in history/)).not.toBeInTheDocument();
  });

  it('should handle navigation through move history', () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4', piece: 'p', color: 'w' },
      { san: 'e5', from: 'e7', to: 'e5', piece: 'p', color: 'b' },
      { san: 'Nf3', from: 'g1', to: 'f3', piece: 'n', color: 'w' },
      { san: 'Nc6', from: 'b8', to: 'c6', piece: 'n', color: 'b' }
    ];

    // Test at different positions
    const { rerender } = renderMoveHistory({ history, currentMoveIndex: 0 });
    
    // Only first move should be highlighted
    expect(screen.getByText('e4')).toHaveClass('font-bold');
    expect(screen.getByText('e5')).not.toHaveClass('font-bold');
    
    // Move to position after black's first move
    mockGameContext.gameState = { ...mockGameState, history, currentMoveIndex: 1 };
    rerender(
      <AuthProvider>
        <GameProvider>
          <MoveHistory />
        </GameProvider>
      </AuthProvider>
    );
    
    expect(screen.getByText('e5')).toHaveClass('font-bold');
  });
});