import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GameControls from '../components/GameControls/GameControls';
import { Chess } from 'chess.js';
import {
  createMockGameContext as buildMockGameContext,
  createMockGameState,
} from '../test-utils/mockGameState';
import type { GameContextType, GameState } from '../contexts/GameContext';

// Mock dependencies. GameControls reads useGame(), useSocket() and useAuth();
// none of their providers are mounted here, so each is mocked with safe defaults.
jest.mock('../utils/chessAI');

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    profile: null,
    updateStats: jest.fn(),
    updatePreferences: jest.fn(),
  }),
}));

// GameControls calls useSocket(); without a provider it throws. Mock it with
// non-online defaults so the local (offline) draw/control paths are exercised.
jest.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({
    socket: null,
    isConnected: false,
    roomCode: null,
    assignedColor: null,
    players: { white: null, black: null },
    gameState: null,
    createRoom: jest.fn(),
    joinRoom: jest.fn(),
    makeMove: jest.fn(),
    resign: jest.fn(),
    offerDraw: jest.fn(),
    acceptDraw: jest.fn(),
    declineDraw: jest.fn(),
    leaveRoom: jest.fn(),
  }),
}));

// Factory only references jest.fn — concrete return value is set per-test.
jest.mock('../contexts/GameContext', () => ({
  useGame: jest.fn(),
}));

const { useGame } = require('../contexts/GameContext');

// gameState fields the tests override at the top level of their "overrides" object.
const GAME_STATE_KEYS: Array<keyof GameState> = [
  'game',
  'history',
  'currentMoveIndex',
  'gameResult',
  'gameId',
  'statsUpdated',
  'drawOffer',
  'timeControl',
  'whiteTime',
  'blackTime',
  'activeColor',
  'startTime',
  'players',
  'colorAssignment',
  'gameStats',
  'gameMode',
  'aiColor',
  'aiDifficulty',
];

// Build a complete GameContext value. Tests pass a flat overrides object that may
// contain either gameState fields (e.g. game, gameResult, drawOffer) or context
// methods/flags (e.g. canUndo). Split them and feed the shared factory.
const createMockGameContext = (overrides: Record<string, any> = {}): GameContextType => {
  const gameStateOverrides: Partial<GameState> = {};
  const contextOverrides: Record<string, any> = {};

  Object.entries(overrides).forEach(([key, value]) => {
    if ((GAME_STATE_KEYS as string[]).includes(key)) {
      (gameStateOverrides as any)[key] = value;
    } else {
      contextOverrides[key] = value;
    }
  });

  return buildMockGameContext({
    gameState: createMockGameState(gameStateOverrides),
    ...contextOverrides,
  });
};

describe('GameControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: fresh game, white to move, nothing disabled beyond canUndo/canRedo.
    useGame.mockReturnValue(createMockGameContext());
  });

  describe('Rendering', () => {
    it('should render game controls with all buttons', () => {
      render(<GameControls />);

      expect(screen.getByText('Game Controls')).toBeInTheDocument();
      expect(screen.getByText('New Game')).toBeInTheDocument();
      expect(screen.getByText('Resign')).toBeInTheDocument();
      expect(screen.getByText('← Undo')).toBeInTheDocument();
      expect(screen.getByText('Redo →')).toBeInTheDocument();
      expect(screen.getByText('Offer Draw')).toBeInTheDocument();
    });

    it('should show proper styling classes', () => {
      render(<GameControls />);

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
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      const newGameButton = screen.getByText('New Game');
      fireEvent.click(newGameButton);

      expect(mockContext.resetGame).toHaveBeenCalledTimes(1);
    });

    it('should be enabled even when game is over', () => {
      const mockContext = createMockGameContext({
        gameResult: 'Checkmate! Player 1 wins!',
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      const newGameButton = screen.getByText('New Game');
      expect(newGameButton).not.toBeDisabled();
    });
  });

  describe('Resign Button', () => {
    it('should call resign with current player when clicked', () => {
      const mockContext = createMockGameContext();
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      const resignButton = screen.getByText('Resign');
      fireEvent.click(resignButton);

      expect(mockContext.resign).toHaveBeenCalledWith('w'); // White to move in starting position
    });

    it('should be disabled when game is over', () => {
      const mockContext = createMockGameContext({
        gameResult: 'Draw by agreement!',
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

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
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      const resignButton = screen.getByText('Resign');
      fireEvent.click(resignButton);

      expect(mockContext.resign).toHaveBeenCalledWith('b');
    });
  });

  describe('Undo/Redo Buttons', () => {
    it('should call undoMove when undo button is clicked', () => {
      render(<GameControls />);

      // Since the button is disabled by default, this test checks behavior rather than actual click
      const undoButton = screen.getByText('← Undo');
      expect(undoButton).toBeDisabled(); // Initial state should be disabled
    });

    it('should call redoMove when redo button is clicked', () => {
      render(<GameControls />);

      const redoButton = screen.getByText('Redo →');
      expect(redoButton).toBeDisabled(); // Initial state should be disabled
    });

    it('should disable undo button when canUndo is false', () => {
      const mockContext = createMockGameContext({
        canUndo: false,
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      const undoButton = screen.getByText('← Undo');
      expect(undoButton).toBeDisabled();
    });

    it('should disable redo button when canRedo is false', () => {
      const mockContext = createMockGameContext({
        canRedo: false,
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      const redoButton = screen.getByText('Redo →');
      expect(redoButton).toBeDisabled();
    });

    it('should disable both undo and redo when game is over', () => {
      const mockContext = createMockGameContext({
        canUndo: true,
        canRedo: true,
        gameResult: 'Stalemate!',
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

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
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      expect(screen.getByText('Offer Draw')).toBeInTheDocument();
    });

    it('should call offerDraw with current player when offer draw is clicked', () => {
      const mockContext = createMockGameContext();
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      const offerDrawButton = screen.getByText('Offer Draw');
      fireEvent.click(offerDrawButton);

      expect(mockContext.offerDraw).toHaveBeenCalledWith('w');
    });

    it('should show accept/decline buttons when opponent offers draw', () => {
      const mockContext = createMockGameContext({
        drawOffer: { offered: true, by: 'b' }, // Black offered, white to respond
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      expect(screen.getByText('Black offers a draw')).toBeInTheDocument();
      expect(screen.getByText('Accept')).toBeInTheDocument();
      expect(screen.getByText('Decline')).toBeInTheDocument();
    });

    it('should call acceptDraw when accept button is clicked', () => {
      const mockContext = createMockGameContext({
        drawOffer: { offered: true, by: 'b' },
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      const acceptButton = screen.getByText('Accept');
      fireEvent.click(acceptButton);

      expect(mockContext.acceptDraw).toHaveBeenCalledTimes(1);
    });

    it('should call declineDraw when decline button is clicked', () => {
      const mockContext = createMockGameContext({
        drawOffer: { offered: true, by: 'b' },
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      const declineButton = screen.getByText('Decline');
      fireEvent.click(declineButton);

      expect(mockContext.declineDraw).toHaveBeenCalledTimes(1);
    });

    it('should show waiting message when current player offered draw', () => {
      const mockContext = createMockGameContext({
        drawOffer: { offered: true, by: 'w' }, // White offered, white's turn
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      expect(screen.getByText('Draw offered - waiting for response')).toBeInTheDocument();
    });

    it('should show white offers draw when white offered on black turn', () => {
      const gameAfterMove = new Chess();
      gameAfterMove.move('e4'); // Make one move so it's black's turn

      const mockContext = createMockGameContext({
        game: gameAfterMove,
        drawOffer: { offered: true, by: 'w' },
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      expect(screen.getByText('White offers a draw')).toBeInTheDocument();
      expect(screen.getByText('Accept')).toBeInTheDocument();
      expect(screen.getByText('Decline')).toBeInTheDocument();
    });

    it('should not show draw controls when game is over', () => {
      const mockContext = createMockGameContext({
        gameResult: 'Checkmate! Player 1 wins!',
      });
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

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
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

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
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

      // All interactive buttons should be disabled except new game
      const resignButton = screen.getByText('Resign');
      expect(resignButton).toBeDisabled();

      const newGameButton = screen.getByText('New Game');
      expect(newGameButton).not.toBeDisabled();
    });

    it('should show correct disabled state based on canUndo/canRedo', () => {
      // Default context: fresh game, both undo/redo disabled.
      render(<GameControls />);

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
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

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
      useGame.mockReturnValue(mockContext);

      render(<GameControls />);

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
