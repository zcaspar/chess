import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GameControls from '../components/GameControls/GameControls';
import { createMockGameContext, createMockGameState } from '../test-utils/mockGameState';

/**
 * In an online game the server owns the result. These controls used to act on
 * the local board only: Resign never reached the opponent (and resigned
 * whoever's turn it was), while Undo / Redo / New Game silently pulled this
 * client's board out of step with the server's.
 */

jest.mock('../utils/chessAI');

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    profile: null,
    updateStats: jest.fn(),
    updatePreferences: jest.fn(),
  }),
}));

const mockSocket = {
  socket: null,
  isConnected: true,
  roomCode: 'ABC123' as string | null,
  assignedColor: 'black' as 'white' | 'black' | 'spectator' | null,
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

jest.mock('../contexts/SocketContext', () => ({
  useSocket: () => mockSocket,
}));

jest.mock('../contexts/GameContext', () => ({
  useGame: jest.fn(),
}));

const { useGame } = require('../contexts/GameContext');

const onlineState = (overrides = {}) =>
  createMockGameState({
    // White to move; we are Black.
    onlineGameRoom: { opponentId: 'white-uid', opponentName: 'Opponent', myColor: 'b' },
    ...overrides,
  });

describe('GameControls in an online game', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.roomCode = 'ABC123';
    mockSocket.assignedColor = 'black';
  });

  it('sends a resignation to the server instead of ending the game locally', () => {
    const context = createMockGameContext({ gameState: onlineState() });
    useGame.mockReturnValue(context);
    render(<GameControls />);

    // It is White's turn, and we are Black: the old code resigned White here.
    fireEvent.click(screen.getByText('Resign'));

    expect(mockSocket.resign).toHaveBeenCalledTimes(1);
    expect(context.resign).not.toHaveBeenCalled();
  });

  it('does not let a spectator resign someone else\'s game', () => {
    mockSocket.assignedColor = 'spectator';
    const context = createMockGameContext({ gameState: createMockGameState() });
    useGame.mockReturnValue(context);
    render(<GameControls />);

    expect(screen.getByText('Resign')).toBeDisabled();
    fireEvent.click(screen.getByText('Resign'));

    expect(mockSocket.resign).not.toHaveBeenCalled();
    expect(context.resign).not.toHaveBeenCalled();
  });

  it('disables undo, redo and new game while the online game is live', () => {
    useGame.mockReturnValue(
      createMockGameContext({ gameState: onlineState(), canUndo: true, canRedo: true }),
    );
    render(<GameControls />);

    expect(screen.getByText('← Undo')).toBeDisabled();
    expect(screen.getByText('Redo →')).toBeDisabled();
    expect(screen.getByText('New Game')).toBeDisabled();
  });

  it('allows a new game once the online game is over', () => {
    useGame.mockReturnValue(
      createMockGameContext({ gameState: onlineState({ gameResult: 'White wins by resignation' }) }),
    );
    render(<GameControls />);

    expect(screen.getByText('New Game')).not.toBeDisabled();
  });

  it('accepts a draw through the server only', () => {
    const context = createMockGameContext({
      gameState: onlineState({ drawOffer: { offered: true, by: 'w' } }),
    });
    useGame.mockReturnValue(context);
    render(<GameControls />);

    fireEvent.click(screen.getByText('Accept'));

    expect(mockSocket.acceptDraw).toHaveBeenCalledTimes(1);
    // Ending it locally as well posted a second result the server never agreed to.
    expect(context.acceptDraw).not.toHaveBeenCalled();
  });

  it('goes back to local controls after "New Game" starts a local board in the old room', () => {
    // The socket is still in the finished room, but the board is a fresh local game.
    const context = createMockGameContext({ gameState: createMockGameState(), canUndo: true });
    useGame.mockReturnValue(context);
    render(<GameControls />);

    fireEvent.click(screen.getByText('Resign'));

    expect(context.resign).toHaveBeenCalledWith('w');
    expect(mockSocket.resign).not.toHaveBeenCalled();
    expect(screen.getByText('← Undo')).not.toBeDisabled();
  });
});
