import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { act } from 'react';
import ChessBoard from '../components/ChessBoard/ChessBoard';
import { GameProvider } from '../contexts/GameContext';
import { SocketProvider } from '../contexts/SocketContext';
import { AuthProvider } from '../contexts/AuthContext';
import { Chess } from 'chess.js';

// Mock dependencies
jest.mock('react-chessboard', () => ({
  Chessboard: ({ 
    position, 
    onPieceDrop, 
    onSquareClick, 
    onSquareRightClick,
    customSquareStyles,
    ...props 
  }: any) => {
    // Store callbacks for testing
    (global as any).mockChessboardCallbacks = {
      onPieceDrop,
      onSquareClick,
      onSquareRightClick,
    };
    
    return (
      <div 
        data-testid="chessboard" 
        data-position={position}
        data-custom-styles={JSON.stringify(customSquareStyles)}
        {...props}
      >
        Mock Chessboard
      </div>
    );
  },
}));

jest.mock('../hooks/useOnlineGame', () => ({
  useOnlineGame: () => ({
    isOnlineGame: false,
  }),
}));

// Mock firebase
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn(() => () => {}),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
}));

const mockGameContext = {
  gameState: {
    game: new Chess(),
    history: [],
    currentMoveIndex: -1,
    gameResult: '',
    gameId: 'test-game-id',
    statsUpdated: false,
    drawOffer: { offered: false, by: null },
    timeControl: null,
    whiteTime: 0,
    blackTime: 0,
    activeColor: null,
    startTime: null,
    players: { player1: 'Player 1', player2: 'Player 2' },
    colorAssignment: { white: 'player1', black: 'player2' },
    gameStats: {
      player1: { wins: 0, draws: 0, losses: 0 },
      player2: { wins: 0, draws: 0, losses: 0 },
    },
    gameMode: 'human-vs-human' as const,
    aiColor: null,
    aiDifficulty: 'medium' as const,
  },
  makeMove: jest.fn(),
  undoMove: jest.fn(),
  redoMove: jest.fn(),
  resetGame: jest.fn(),
  clearAllGameData: jest.fn(),
  resign: jest.fn(),
  offerDraw: jest.fn(),
  acceptDraw: jest.fn(),
  declineDraw: jest.fn(),
  setTimeControl: jest.fn(),
  startClock: jest.fn(),
  pauseClock: jest.fn(),
  setPlayerName: jest.fn(),
  swapColors: jest.fn(),
  getPlayerByColor: jest.fn(),
  setGameMode: jest.fn(),
  setAIDifficulty: jest.fn(),
  canUndo: false,
  canRedo: false,
};

const mockSocketContext = {
  socket: null,
  roomCode: null,
  assignedColor: null,
  opponentName: null,
  isConnected: false,
  createRoom: jest.fn(),
  joinRoom: jest.fn(),
  leaveRoom: jest.fn(),
  makeMove: jest.fn(),
  offerDraw: jest.fn(),
  acceptDraw: jest.fn(),
  declineDraw: jest.fn(),
  resign: jest.fn(),
  onGameUpdate: jest.fn(),
  onOpponentJoined: jest.fn(),
  onOpponentLeft: jest.fn(),
  onGameEnded: jest.fn(),
  onDrawOffered: jest.fn(),
  onError: jest.fn(),
};

// Test wrapper with all providers
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    <GameProvider>
      <SocketProvider>
        {children}
      </SocketProvider>
    </GameProvider>
  </AuthProvider>
);

// Helper to render with custom contexts
const renderWithContext = (
  ui: React.ReactElement,
  gameContextValue = mockGameContext,
  socketContextValue = mockSocketContext
) => {
  return render(
    <div>
      {React.cloneElement(ui, {
        // Inject contexts via custom providers
      })}
    </div>
  );
};

describe('ChessBoard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).mockChessboardCallbacks = {};
  });

  describe('Rendering', () => {
    it('should render the chessboard with initial position', () => {
      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const chessboard = screen.getByTestId('chessboard');
      expect(chessboard).toBeInTheDocument();
      expect(chessboard).toHaveAttribute(
        'data-position',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );
    });

    it('should apply custom board styles', () => {
      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const chessboard = screen.getByTestId('chessboard');
      expect(chessboard).toHaveStyle({
        borderRadius: '4px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      });
    });
  });

  describe('Square Click Interactions', () => {
    it('should select a piece when clicking on it', () => {
      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareClick } = (global as any).mockChessboardCallbacks;
      
      act(() => {
        onSquareClick('e2');
      });

      const chessboard = screen.getByTestId('chessboard');
      const customStyles = JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
      
      expect(customStyles.e2).toEqual({ backgroundColor: 'rgba(255, 255, 0, 0.4)' });
    });

    it('should deselect a piece when clicking on it again', () => {
      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareClick } = (global as any).mockChessboardCallbacks;
      
      // Select piece
      act(() => {
        onSquareClick('e2');
      });

      // Deselect piece
      act(() => {
        onSquareClick('e2');
      });

      const chessboard = screen.getByTestId('chessboard');
      const customStyles = JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
      
      expect(customStyles.e2).toBeUndefined();
    });

    it('should show move options when selecting a piece', () => {
      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareClick } = (global as any).mockChessboardCallbacks;
      
      act(() => {
        onSquareClick('e2');
      });

      const chessboard = screen.getByTestId('chessboard');
      const customStyles = JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
      
      // Should show move options for e2 pawn (e3 and e4)
      expect(customStyles.e3).toHaveProperty('background');
      expect(customStyles.e4).toHaveProperty('background');
    });

    it('should not allow selecting opponent pieces', () => {
      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareClick } = (global as any).mockChessboardCallbacks;
      
      // Try to select black piece on white's turn
      act(() => {
        onSquareClick('e7');
      });

      const chessboard = screen.getByTestId('chessboard');
      const customStyles = JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
      
      expect(customStyles.e7).toBeUndefined();
    });

    it('should not allow any interaction when game has ended', () => {
      const gameContextWithResult = {
        ...mockGameContext,
        gameState: {
          ...mockGameContext.gameState,
          gameResult: 'Checkmate! Player 1 wins!',
        },
      };

      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(gameContextWithResult);

      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareClick } = (global as any).mockChessboardCallbacks;
      
      act(() => {
        onSquareClick('e2');
      });

      const chessboard = screen.getByTestId('chessboard');
      const customStyles = JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
      
      // Should not select piece when game has ended
      expect(customStyles.e2).toBeUndefined();
    });
  });

  describe('Move Making', () => {
    it('should make a move when clicking from and to squares', () => {
      const mockMakeMove = jest.fn().mockReturnValue(true);
      const gameContext = {
        ...mockGameContext,
        makeMove: mockMakeMove,
      };

      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(gameContext);

      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareClick } = (global as any).mockChessboardCallbacks;
      
      // Select piece
      act(() => {
        onSquareClick('e2');
      });

      // Make move
      act(() => {
        onSquareClick('e4');
      });

      expect(mockMakeMove).toHaveBeenCalledWith('e2', 'e4');
    });

    it('should handle failed moves', () => {
      const mockMakeMove = jest.fn().mockReturnValue(false);
      const gameContext = {
        ...mockGameContext,
        makeMove: mockMakeMove,
      };

      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(gameContext);

      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareClick } = (global as any).mockChessboardCallbacks;
      
      // Select piece
      act(() => {
        onSquareClick('e2');
      });

      // Try invalid move
      act(() => {
        onSquareClick('e5');
      });

      expect(mockMakeMove).toHaveBeenCalledWith('e2', 'e5');
      
      // Selection should be cleared after failed move
      const chessboard = screen.getByTestId('chessboard');
      const customStyles = JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
      expect(customStyles.e2).toBeUndefined();
    });
  });

  describe('Drag and Drop', () => {
    it('should make a move via drag and drop', () => {
      const mockMakeMove = jest.fn().mockReturnValue(true);
      const gameContext = {
        ...mockGameContext,
        makeMove: mockMakeMove,
      };

      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(gameContext);

      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onPieceDrop } = (global as any).mockChessboardCallbacks;
      
      const result = onPieceDrop('e2', 'e4');

      expect(mockMakeMove).toHaveBeenCalledWith('e2', 'e4');
      expect(result).toBe(true);
    });

    it('should not allow drag and drop when game has ended', () => {
      const gameContextWithResult = {
        ...mockGameContext,
        gameState: {
          ...mockGameContext.gameState,
          gameResult: 'Draw by agreement!',
        },
      };

      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(gameContextWithResult);

      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onPieceDrop } = (global as any).mockChessboardCallbacks;
      
      const result = onPieceDrop('e2', 'e4');

      expect(result).toBe(false);
      expect(mockGameContext.makeMove).not.toHaveBeenCalled();
    });
  });

  describe('Right Click', () => {
    it('should highlight squares on right click', () => {
      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareRightClick } = (global as any).mockChessboardCallbacks;
      
      act(() => {
        onSquareRightClick('e4');
      });

      const chessboard = screen.getByTestId('chessboard');
      const customStyles = JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
      
      expect(customStyles.e4).toEqual({ backgroundColor: 'rgba(0, 0, 255, 0.4)' });
    });

    it('should toggle highlight on multiple right clicks', () => {
      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareRightClick } = (global as any).mockChessboardCallbacks;
      
      // First right click
      act(() => {
        onSquareRightClick('e4');
      });

      // Second right click on same square
      act(() => {
        onSquareRightClick('e4');
      });

      const chessboard = screen.getByTestId('chessboard');
      const customStyles = JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
      
      // Highlight should be removed
      expect(customStyles.e4).toBeUndefined();
    });
  });

  describe('Online Game Integration', () => {
    it('should use socket move for online games', () => {
      const mockSocketMakeMove = jest.fn();
      const socketContext = {
        ...mockSocketContext,
        roomCode: 'ABCD',
        assignedColor: 'white',
        makeMove: mockSocketMakeMove,
      };

      jest.spyOn(require('../contexts/SocketContext'), 'useSocket').mockReturnValue(socketContext);
      jest.spyOn(require('../hooks/useOnlineGame'), 'useOnlineGame').mockReturnValue({
        isOnlineGame: true,
      });

      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareClick } = (global as any).mockChessboardCallbacks;
      
      // Select and move
      act(() => {
        onSquareClick('e2');
      });

      act(() => {
        onSquareClick('e4');
      });

      expect(mockSocketMakeMove).toHaveBeenCalledWith('e2', 'e4');
      expect(mockGameContext.makeMove).not.toHaveBeenCalled();
    });

    it('should not allow moves when it is not player turn in online game', () => {
      const mockSocketMakeMove = jest.fn();
      const gameContextBlackTurn = {
        ...mockGameContext,
        gameState: {
          ...mockGameContext.gameState,
          game: (() => {
            const game = new Chess();
            game.move('e4'); // Make one move so it's black's turn
            return game;
          })(),
        },
      };
      
      const socketContext = {
        ...mockSocketContext,
        roomCode: 'ABCD',
        assignedColor: 'white',
        makeMove: mockSocketMakeMove,
      };

      jest.spyOn(require('../../contexts/GameContext'), 'useGame').mockReturnValue(gameContextBlackTurn);
      jest.spyOn(require('../contexts/SocketContext'), 'useSocket').mockReturnValue(socketContext);
      jest.spyOn(require('../hooks/useOnlineGame'), 'useOnlineGame').mockReturnValue({
        isOnlineGame: true,
      });

      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareClick } = (global as any).mockChessboardCallbacks;
      
      // Try to select white piece when it's black's turn
      act(() => {
        onSquareClick('d2');
      });

      act(() => {
        onSquareClick('d4');
      });

      expect(mockSocketMakeMove).not.toHaveBeenCalled();
    });
  });

  describe('Visual Highlights', () => {
    it('should highlight last move', () => {
      const gameContextWithHistory = {
        ...mockGameContext,
        gameState: {
          ...mockGameContext.gameState,
          history: [
            {
              from: 'e2',
              to: 'e4',
              color: 'w',
              piece: 'p',
              san: 'e4',
              flags: 'b',
              before: '',
              after: '',
            },
          ],
          currentMoveIndex: 0,
        },
      };

      jest.spyOn(require('../../contexts/GameContext'), 'useGame').mockReturnValue(gameContextWithHistory);

      render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const chessboard = screen.getByTestId('chessboard');
      const customStyles = JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
      
      expect(customStyles.e2).toEqual({ backgroundColor: 'rgba(255, 255, 0, 0.2)' });
      expect(customStyles.e4).toEqual({ backgroundColor: 'rgba(255, 255, 0, 0.2)' });
    });

    it('should clear all highlights when game ends', () => {
      const { rerender } = render(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const { onSquareClick, onSquareRightClick } = (global as any).mockChessboardCallbacks;
      
      // Add some highlights
      act(() => {
        onSquareClick('e2');
        onSquareRightClick('d4');
      });

      // Update game state to ended
      const gameContextWithResult = {
        ...mockGameContext,
        gameState: {
          ...mockGameContext.gameState,
          gameResult: 'Stalemate!',
        },
      };

      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(gameContextWithResult);

      rerender(
        <TestWrapper>
          <ChessBoard />
        </TestWrapper>
      );

      const chessboard = screen.getByTestId('chessboard');
      const customStyles = JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
      
      // All highlights should be cleared
      expect(customStyles.e2).toBeUndefined();
      expect(customStyles.d4).toBeUndefined();
    });
  });
});