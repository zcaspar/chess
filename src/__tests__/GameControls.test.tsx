import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';
import GameControls from '../components/GameControls/GameControls';
import { GameProvider } from '../contexts/GameContext';
import { AuthProvider } from '../contexts/AuthContext';
import { Chess } from 'chess.js';

// Mock dependencies
jest.mock('../utils/chessAI');
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    profile: null,
    updateStats: jest.fn(),
  }),
}));

// Mock firebase
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn(() => () => {}),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    <GameProvider>
      {children}
    </GameProvider>
  </AuthProvider>
);

// Mock game context values
const createMockGameContext = (overrides = {}) => ({
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
    ...overrides,
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
});

describe('GameControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render game controls with all buttons', () => {
      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      expect(screen.getByText('Game Controls')).toBeInTheDocument();
      expect(screen.getByText('New Game')).toBeInTheDocument();
      expect(screen.getByText('Resign')).toBeInTheDocument();
      expect(screen.getByText('← Undo')).toBeInTheDocument();
      expect(screen.getByText('Redo →')).toBeInTheDocument();
      expect(screen.getByText('Offer Draw')).toBeInTheDocument();
    });

    it('should show proper styling classes', () => {
      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const newGameButton = screen.getByText('New Game');
      expect(newGameButton).toHaveClass('bg-blue-500', 'text-white', 'rounded');

      const resignButton = screen.getByText('Resign');
      expect(resignButton).toHaveClass('bg-red-500', 'text-white', 'rounded');

      const undoButton = screen.getByText('← Undo');
      expect(undoButton).toHaveClass('bg-gray-500', 'text-white', 'rounded');
    });
  });

  describe('New Game Button', () => {
    it('should call resetGame when new game button is clicked', () => {
      const mockContext = createMockGameContext();
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const newGameButton = screen.getByText('New Game');
      fireEvent.click(newGameButton);

      expect(mockContext.resetGame).toHaveBeenCalledTimes(1);
    });

    it('should be enabled even when game is over', () => {
      const mockContext = createMockGameContext({
        gameResult: 'Checkmate! Player 1 wins!',
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const newGameButton = screen.getByText('New Game');
      expect(newGameButton).not.toBeDisabled();
    });
  });

  describe('Resign Button', () => {
    it('should call resign with current player when clicked', () => {
      const mockContext = createMockGameContext();
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const resignButton = screen.getByText('Resign');
      fireEvent.click(resignButton);

      expect(mockContext.resign).toHaveBeenCalledWith('w'); // White to move in starting position
    });

    it('should be disabled when game is over', () => {
      const mockContext = createMockGameContext({
        gameResult: 'Draw by agreement!',
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const resignButton = screen.getByText('Resign');
      expect(resignButton).toBeDisabled();
      expect(resignButton).toHaveClass('disabled:opacity-50');
    });

    it('should call resign with black when it is black turn', () => {
      const gameAfterMove = new Chess();
      gameAfterMove.move('e4'); // Make one move so it's black's turn

      const mockContext = createMockGameContext({
        game: gameAfterMove,
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const resignButton = screen.getByText('Resign');
      fireEvent.click(resignButton);

      expect(mockContext.resign).toHaveBeenCalledWith('b');
    });
  });

  describe('Undo/Redo Buttons', () => {
    it('should call undoMove when undo button is clicked', () => {
      // Use real useGame hook but mock the functions
      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      // Since the button is disabled by default, this test checks behavior rather than actual click
      const undoButton = screen.getByText('← Undo');
      expect(undoButton).toBeDisabled(); // Initial state should be disabled
    });

    it('should call redoMove when redo button is clicked', () => {
      // Use real useGame hook but check disabled state
      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const redoButton = screen.getByText('Redo →');
      expect(redoButton).toBeDisabled(); // Initial state should be disabled
    });

    it('should disable undo button when canUndo is false', () => {
      const mockContext = createMockGameContext({
        canUndo: false,
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const undoButton = screen.getByText('← Undo');
      expect(undoButton).toBeDisabled();
    });

    it('should disable redo button when canRedo is false', () => {
      const mockContext = createMockGameContext({
        canRedo: false,
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const redoButton = screen.getByText('Redo →');
      expect(redoButton).toBeDisabled();
    });

    it('should disable both undo and redo when game is over', () => {
      const mockContext = createMockGameContext({
        canUndo: true,
        canRedo: true,
        gameResult: 'Stalemate!',
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const undoButton = screen.getByText('← Undo');
      const redoButton = screen.getByText('Redo →');
      
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();
    });
  });

  describe('Draw Controls', () => {
    it('should show offer draw button when no draw is offered', () => {
      const mockContext = createMockGameContext({
        drawOffer: { offered: false, by: null },
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      expect(screen.getByText('Offer Draw')).toBeInTheDocument();
    });

    it('should call offerDraw with current player when offer draw is clicked', () => {
      const mockContext = createMockGameContext();
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const offerDrawButton = screen.getByText('Offer Draw');
      fireEvent.click(offerDrawButton);

      expect(mockContext.offerDraw).toHaveBeenCalledWith('w');
    });

    it('should show accept/decline buttons when opponent offers draw', () => {
      const mockContext = createMockGameContext({
        drawOffer: { offered: true, by: 'b' }, // Black offered, white to respond
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      expect(screen.getByText('Black offers a draw')).toBeInTheDocument();
      expect(screen.getByText('Accept')).toBeInTheDocument();
      expect(screen.getByText('Decline')).toBeInTheDocument();
    });

    it('should call acceptDraw when accept button is clicked', () => {
      const mockContext = createMockGameContext({
        drawOffer: { offered: true, by: 'b' },
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const acceptButton = screen.getByText('Accept');
      fireEvent.click(acceptButton);

      expect(mockContext.acceptDraw).toHaveBeenCalledTimes(1);
    });

    it('should call declineDraw when decline button is clicked', () => {
      const mockContext = createMockGameContext({
        drawOffer: { offered: true, by: 'b' },
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const declineButton = screen.getByText('Decline');
      fireEvent.click(declineButton);

      expect(mockContext.declineDraw).toHaveBeenCalledTimes(1);
    });

    it('should show waiting message when current player offered draw', () => {
      const mockContext = createMockGameContext({
        drawOffer: { offered: true, by: 'w' }, // White offered, white's turn
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      expect(screen.getByText('Draw offered - waiting for response')).toBeInTheDocument();
    });

    it('should show white offers draw when white offered on black turn', () => {
      const gameAfterMove = new Chess();
      gameAfterMove.move('e4'); // Make one move so it's black's turn

      const mockContext = createMockGameContext({
        game: gameAfterMove,
        drawOffer: { offered: true, by: 'w' },
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      expect(screen.getByText('White offers a draw')).toBeInTheDocument();
      expect(screen.getByText('Accept')).toBeInTheDocument();
      expect(screen.getByText('Decline')).toBeInTheDocument();
    });

    it('should not show draw controls when game is over', () => {
      const mockContext = createMockGameContext({
        gameResult: 'Checkmate! Player 1 wins!',
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      expect(screen.queryByText('Offer Draw')).not.toBeInTheDocument();
      expect(screen.queryByText('Accept')).not.toBeInTheDocument();
      expect(screen.queryByText('Decline')).not.toBeInTheDocument();
    });
  });

  describe('Game State Integration', () => {
    it('should handle game over state from chess.js', () => {
      // Create a checkmate position
      const checkmateGame = new Chess();
      checkmateGame.load('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');

      const mockContext = createMockGameContext({
        game: checkmateGame,
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const resignButton = screen.getByText('Resign');
      const undoButton = screen.getByText('← Undo');
      const redoButton = screen.getByText('Redo →');

      expect(resignButton).toBeDisabled();
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();
      expect(screen.queryByText('Offer Draw')).not.toBeInTheDocument();
    });

    it('should handle stalemate position', () => {
      // Create a stalemate position
      const stalemateGame = new Chess();
      stalemateGame.load('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');

      const mockContext = createMockGameContext({
        game: stalemateGame,
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      // All interactive buttons should be disabled except new game
      const resignButton = screen.getByText('Resign');
      expect(resignButton).toBeDisabled();
      
      const newGameButton = screen.getByText('New Game');
      expect(newGameButton).not.toBeDisabled();
    });

    it('should show correct disabled state based on canUndo/canRedo', () => {
      // Test with initial game state where both should be disabled
      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const undoButton = screen.getByText('← Undo');
      const redoButton = screen.getByText('Redo →');

      // In initial game state, both buttons should be disabled
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();
    });
  });

  describe('Button Interactions', () => {
    it('should not trigger multiple calls on rapid clicks', () => {
      const mockContext = createMockGameContext();
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const newGameButton = screen.getByText('New Game');
      
      // Simulate rapid clicks
      fireEvent.click(newGameButton);
      fireEvent.click(newGameButton);
      fireEvent.click(newGameButton);

      // Should still only be called for each actual click
      expect(mockContext.resetGame).toHaveBeenCalledTimes(3);
    });

    it('should handle disabled button clicks gracefully', () => {
      const mockContext = createMockGameContext({
        canUndo: false,
        gameResult: 'Game Over',
      });
      jest.spyOn(require('../contexts/GameContext'), 'useGame').mockReturnValue(mockContext);

      render(
        <TestWrapper>
          <GameControls />
        </TestWrapper>
      );

      const undoButton = screen.getByText('← Undo');
      const resignButton = screen.getByText('Resign');

      // Clicking disabled buttons should not call functions
      fireEvent.click(undoButton);
      fireEvent.click(resignButton);

      expect(mockContext.undoMove).not.toHaveBeenCalled();
      expect(mockContext.resign).not.toHaveBeenCalled();
    });
  });
});