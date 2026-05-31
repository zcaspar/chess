import React from 'react';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { Chess } from 'chess.js';
import ChessBoard from '../components/ChessBoard/ChessBoard';
import { useGame } from '../contexts/GameContext';
import { useSocket } from '../contexts/SocketContext';
import { useOnlineGame } from '../hooks/useOnlineGame';
import { useAuth } from '../hooks/useAuth';
import { createMockGameContext, createMockGameState } from '../test-utils/mockGameState';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// react-chessboard renders a real <canvas>/DOM tree we don't care about. Replace
// it with a stub that (a) records the interaction callbacks so tests can invoke
// them, and (b) reflects the props we assert on (position, customSquareStyles,
// customBoardStyle) onto the DOM. customBoardStyle is applied as the element's
// inline `style` so `toHaveStyle` can read it.
jest.mock('react-chessboard', () => ({
  Chessboard: ({
    position,
    onPieceDrop,
    onSquareClick,
    onSquareRightClick,
    customSquareStyles,
    customBoardStyle,
    ...props
  }: any) => {
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
        style={customBoardStyle}
      >
        Mock Chessboard
      </div>
    );
  },
}));

// The contexts throw when used outside their providers, so mock the hooks and
// feed them complete values from the shared factory. GameProvider/SocketProvider
// are intentionally left out of the tree — every hook ChessBoard consumes is
// mocked, so the real providers aren't needed.
jest.mock('../contexts/GameContext', () => ({
  ...jest.requireActual('../contexts/GameContext'),
  useGame: jest.fn(),
}));

jest.mock('../contexts/SocketContext', () => ({
  ...jest.requireActual('../contexts/SocketContext'),
  useSocket: jest.fn(),
}));

jest.mock('../hooks/useOnlineGame', () => ({
  useOnlineGame: jest.fn(),
}));

// useAuth supplies only `profile` to ChessBoard (board theme / animation prefs).
jest.mock('../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

// useSoundEffects reaches into the Web Audio API (absent in jsdom); the board's
// interaction logic doesn't depend on it, so stub it out.
jest.mock('../hooks/useSoundEffects', () => ({
  useSoundEffects: jest.fn(),
}));

const mockUseGame = useGame as jest.Mock;
const mockUseSocket = useSocket as jest.Mock;
const mockUseOnlineGame = useOnlineGame as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

const defaultSocketValue = {
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
};

const renderBoard = () => render(<ChessBoard />);

const getCustomStyles = () => {
  const chessboard = screen.getByTestId('chessboard');
  return JSON.parse(chessboard.getAttribute('data-custom-styles') || '{}');
};

describe('ChessBoard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).mockChessboardCallbacks = {};
    mockUseGame.mockReturnValue(createMockGameContext());
    mockUseSocket.mockReturnValue({ ...defaultSocketValue });
    mockUseOnlineGame.mockReturnValue({ isOnlineGame: false });
    mockUseAuth.mockReturnValue({ profile: null });
  });

  describe('Rendering', () => {
    it('should render the chessboard with initial position', () => {
      renderBoard();

      const chessboard = screen.getByTestId('chessboard');
      expect(chessboard).toBeInTheDocument();
      expect(chessboard).toHaveAttribute(
        'data-position',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );
    });

    it('should apply custom board styles', () => {
      renderBoard();

      const chessboard = screen.getByTestId('chessboard');
      expect(chessboard).toHaveStyle({
        borderRadius: '8px',
        boxShadow:
          '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      });
    });
  });

  describe('Square Click Interactions', () => {
    it('should select a piece when clicking on it', () => {
      renderBoard();

      const { onSquareClick } = (global as any).mockChessboardCallbacks;

      act(() => {
        onSquareClick('e2');
      });

      expect(getCustomStyles().e2).toEqual({ backgroundColor: 'rgba(255, 255, 0, 0.4)' });
    });

    it('should deselect a piece when clicking on it again', () => {
      renderBoard();

      // Re-read the callback each time: every state update re-renders the mocked
      // Chessboard with a fresh onSquareClick closure over the latest state.
      act(() => {
        (global as any).mockChessboardCallbacks.onSquareClick('e2');
      });

      act(() => {
        (global as any).mockChessboardCallbacks.onSquareClick('e2');
      });

      expect(getCustomStyles().e2).toBeUndefined();
    });

    it('should show move options when selecting a piece', () => {
      renderBoard();

      const { onSquareClick } = (global as any).mockChessboardCallbacks;

      act(() => {
        onSquareClick('e2');
      });

      const customStyles = getCustomStyles();
      // Should show move options for e2 pawn (e3 and e4)
      expect(customStyles.e3).toHaveProperty('background');
      expect(customStyles.e4).toHaveProperty('background');
    });

    it('should not allow selecting opponent pieces', () => {
      renderBoard();

      const { onSquareClick } = (global as any).mockChessboardCallbacks;

      // Try to select black piece on white's turn
      act(() => {
        onSquareClick('e7');
      });

      expect(getCustomStyles().e7).toBeUndefined();
    });

    it('should not allow any interaction when game has ended', () => {
      mockUseGame.mockReturnValue(
        createMockGameContext({
          gameState: createMockGameState({ gameResult: 'Checkmate! Player 1 wins!' }),
        })
      );

      renderBoard();

      const { onSquareClick } = (global as any).mockChessboardCallbacks;

      act(() => {
        onSquareClick('e2');
      });

      // Should not select piece when game has ended
      expect(getCustomStyles().e2).toBeUndefined();
    });
  });

  describe('Move Making', () => {
    it('should make a move when clicking from and to squares', () => {
      const mockMakeMove = jest.fn().mockReturnValue(true);
      mockUseGame.mockReturnValue(createMockGameContext({ makeMove: mockMakeMove }));

      renderBoard();

      act(() => {
        (global as any).mockChessboardCallbacks.onSquareClick('e2');
      });

      act(() => {
        (global as any).mockChessboardCallbacks.onSquareClick('e4');
      });

      expect(mockMakeMove).toHaveBeenCalledWith('e2', 'e4');
    });

    it('should handle failed moves', () => {
      const mockMakeMove = jest.fn().mockReturnValue(false);
      mockUseGame.mockReturnValue(createMockGameContext({ makeMove: mockMakeMove }));

      renderBoard();

      act(() => {
        (global as any).mockChessboardCallbacks.onSquareClick('e2');
      });

      // e5 is not a legal destination for the e2 pawn, so makeMove returns false
      act(() => {
        (global as any).mockChessboardCallbacks.onSquareClick('e5');
      });

      expect(mockMakeMove).toHaveBeenCalledWith('e2', 'e5');

      // Selection should be cleared after a failed move to an empty square
      expect(getCustomStyles().e2).toBeUndefined();
    });
  });

  describe('Drag and Drop', () => {
    it('should make a move via drag and drop', () => {
      const mockMakeMove = jest.fn().mockReturnValue(true);
      mockUseGame.mockReturnValue(createMockGameContext({ makeMove: mockMakeMove }));

      renderBoard();

      const { onPieceDrop } = (global as any).mockChessboardCallbacks;

      let result: boolean | undefined;
      act(() => {
        result = onPieceDrop('e2', 'e4');
      });

      expect(mockMakeMove).toHaveBeenCalledWith('e2', 'e4');
      expect(result).toBe(true);
    });

    it('should not allow drag and drop when game has ended', () => {
      const mockMakeMove = jest.fn().mockReturnValue(true);
      mockUseGame.mockReturnValue(
        createMockGameContext({
          makeMove: mockMakeMove,
          gameState: createMockGameState({ gameResult: 'Draw by agreement!' }),
        })
      );

      renderBoard();

      const { onPieceDrop } = (global as any).mockChessboardCallbacks;

      let result: boolean | undefined;
      act(() => {
        result = onPieceDrop('e2', 'e4');
      });

      expect(result).toBe(false);
      expect(mockMakeMove).not.toHaveBeenCalled();
    });
  });

  describe('Right Click', () => {
    it('should highlight squares on right click', () => {
      renderBoard();

      const { onSquareRightClick } = (global as any).mockChessboardCallbacks;

      act(() => {
        onSquareRightClick('e4');
      });

      expect(getCustomStyles().e4).toEqual({ backgroundColor: 'rgba(0, 0, 255, 0.4)' });
    });

    it('should toggle highlight on multiple right clicks', () => {
      renderBoard();

      act(() => {
        (global as any).mockChessboardCallbacks.onSquareRightClick('e4');
      });

      act(() => {
        (global as any).mockChessboardCallbacks.onSquareRightClick('e4');
      });

      // Highlight should be removed
      expect(getCustomStyles().e4).toBeUndefined();
    });
  });

  describe('Online Game Integration', () => {
    it('should use socket move for online games', () => {
      const mockSocketMakeMove = jest.fn();
      const mockMakeMove = jest.fn().mockReturnValue(true);
      mockUseGame.mockReturnValue(createMockGameContext({ makeMove: mockMakeMove }));
      mockUseSocket.mockReturnValue({
        ...defaultSocketValue,
        roomCode: 'ABCD',
        assignedColor: 'white',
        makeMove: mockSocketMakeMove,
      });
      mockUseOnlineGame.mockReturnValue({ isOnlineGame: true });

      renderBoard();

      act(() => {
        (global as any).mockChessboardCallbacks.onSquareClick('e2');
      });

      act(() => {
        (global as any).mockChessboardCallbacks.onSquareClick('e4');
      });

      expect(mockSocketMakeMove).toHaveBeenCalledWith('e2', 'e4');
      expect(mockMakeMove).not.toHaveBeenCalled();
    });

    it('should not allow moves when it is not player turn in online game', () => {
      const mockSocketMakeMove = jest.fn();
      // Play one move so it's black's turn; the local player is white.
      const game = new Chess();
      game.move('e4');

      mockUseGame.mockReturnValue(
        createMockGameContext({ gameState: createMockGameState({ game }) })
      );
      mockUseSocket.mockReturnValue({
        ...defaultSocketValue,
        roomCode: 'ABCD',
        assignedColor: 'white',
        makeMove: mockSocketMakeMove,
      });
      mockUseOnlineGame.mockReturnValue({ isOnlineGame: true });

      renderBoard();

      const { onSquareClick } = (global as any).mockChessboardCallbacks;

      // Try to select/move a white piece when it's black's turn
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
      // Build a real game with one move so history contains a genuine Move object.
      const game = new Chess();
      const move = game.move('e4');

      mockUseGame.mockReturnValue(
        createMockGameContext({
          gameState: createMockGameState({ game, history: [move], currentMoveIndex: 0 }),
        })
      );

      renderBoard();

      const customStyles = getCustomStyles();
      expect(customStyles.e2).toEqual({ backgroundColor: 'rgba(255, 255, 0, 0.2)' });
      expect(customStyles.e4).toEqual({ backgroundColor: 'rgba(255, 255, 0, 0.2)' });
    });

    it('should clear all highlights when game ends', () => {
      const { rerender } = renderBoard();

      const { onSquareClick, onSquareRightClick } = (global as any).mockChessboardCallbacks;

      // Add some highlights
      act(() => {
        onSquareClick('e2');
        onSquareRightClick('d4');
      });

      // Update game state to ended and re-render
      mockUseGame.mockReturnValue(
        createMockGameContext({
          gameState: createMockGameState({ gameResult: 'Stalemate!' }),
        })
      );

      rerender(<ChessBoard />);

      const customStyles = getCustomStyles();
      // All highlights should be cleared
      expect(customStyles.e2).toBeUndefined();
      expect(customStyles.d4).toBeUndefined();
    });
  });
});
