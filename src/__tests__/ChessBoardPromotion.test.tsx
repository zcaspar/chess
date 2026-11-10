import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';
import ChessBoard from '../components/ChessBoard/ChessBoard';
import { GameProvider } from '../contexts/GameContext';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../hooks/useAuth';

/**
 * Promotion through the real GameProvider and the real board logic. Only the
 * drawing library is stubbed, so these tests cover what the player sees: the
 * picker opens, and the piece they choose is the piece that lands.
 */

jest.mock('react-chessboard', () => ({
  Chessboard: ({ position, onPieceDrop, onSquareClick, onPromotionCheck }: any) => {
    (global as any).board = { onPieceDrop, onSquareClick, onPromotionCheck };
    return <div data-testid="chessboard" data-position={position} />;
  },
}));

jest.mock('../utils/chessAI');
jest.mock('../hooks/useSoundEffects', () => ({ useSoundEffects: jest.fn() }));
jest.mock('../hooks/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('../contexts/SocketContext', () => ({ useSocket: jest.fn() }));

const mockUseSocket = useSocket as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

const offline = {
  socket: null,
  isConnected: false,
  roomCode: null,
  assignedColor: null,
  players: { white: null, black: null },
  gameState: null,
  makeMove: jest.fn(),
};

const board = () => (global as any).board;
const fen = () => screen.getByTestId('chessboard').getAttribute('data-position') as string;
const drop = (from: string, to: string, piece = 'wP'): boolean => {
  let result = false;
  act(() => {
    result = board().onPieceDrop(from, to, piece);
  });
  return result;
};
const click = (square: string) =>
  act(() => {
    board().onSquareClick(square);
  });

// White pawn reaches b7 with a8 (rook) and b8 (empty) available: 8 plies.
const SETUP: Array<[string, string]> = [
  ['a2', 'a4'], ['b7', 'b5'], ['a4', 'b5'], ['a7', 'a6'],
  ['b5', 'a6'], ['c8', 'b7'], ['a6', 'b7'], ['b8', 'c6'],
];

const renderAtPromotion = () => {
  const view = render(
    <GameProvider>
      <ChessBoard />
    </GameProvider>,
  );
  SETUP.forEach(([from, to]) => expect(drop(from, to)).toBe(true));
  return view;
};

describe('pawn promotion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSocket.mockReturnValue(offline);
    mockUseAuth.mockReturnValue({ user: null, profile: null });
  });

  it('asks which piece to promote to instead of assuming a queen', () => {
    renderAtPromotion();
    const before = fen();

    const accepted = drop('b7', 'a8');

    expect(accepted).toBe(false); // the pawn waits on its square
    expect(fen()).toBe(before);
    expect(screen.getByRole('dialog', { name: /promote/i })).toBeInTheDocument();
    ['Queen', 'Rook', 'Bishop', 'Knight'].forEach((name) =>
      expect(screen.getByRole('button', { name })).toBeInTheDocument(),
    );
  });

  it.each([
    ['Knight', 'N'],
    ['Rook', 'R'],
    ['Bishop', 'B'],
    ['Queen', 'Q'],
  ])('promotes to a %s when that is chosen', (name, letter) => {
    renderAtPromotion();
    drop('b7', 'a8');

    fireEvent.click(screen.getByRole('button', { name }));

    expect(fen().startsWith(`${letter}2qkbnr/`)).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('works for click-to-move as well as drag and drop', () => {
    renderAtPromotion();

    click('b7');
    click('a8');
    fireEvent.click(screen.getByRole('button', { name: 'Rook' }));

    expect(fen().startsWith('R2qkbnr/')).toBe(true);
  });

  it('plays nothing when the choice is cancelled', () => {
    renderAtPromotion();
    const before = fen();
    drop('b7', 'a8');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fen()).toBe(before);

    // And the pawn can still be promoted afterwards.
    drop('b7', 'a8');
    fireEvent.click(screen.getByRole('button', { name: 'Queen' }));
    expect(fen().startsWith('Q2qkbnr/')).toBe(true);
  });

  it('does not ask for moves that are not promotions', () => {
    render(
      <GameProvider>
        <ChessBoard />
      </GameProvider>,
    );

    expect(drop('e2', 'e4')).toBe(true);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not open the picker for an illegal move onto the last rank', () => {
    renderAtPromotion();

    // d8 is on the last rank, but the b7 pawn cannot get there.
    expect(drop('b7', 'd8')).toBe(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('queens straight away when the player has asked for that', () => {
    mockUseAuth.mockReturnValue({ user: null, profile: { preferences: { autoPromoteQueen: true } } });
    renderAtPromotion();

    expect(drop('b7', 'a8')).toBe(true);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fen().startsWith('Q2qkbnr/')).toBe(true);
  });

  it('keeps the library\'s own promotion dialog out of the way', () => {
    renderAtPromotion();

    // Before the move, the pawn is still on b7: no built-in dialog.
    expect(board().onPromotionCheck('b7', 'a8', 'wP')).toBe(false);
  });

  it('sends the chosen piece to the server in an online game', () => {
    const view = renderAtPromotion();
    const socketMakeMove = jest.fn();
    mockUseSocket.mockReturnValue({
      ...offline,
      roomCode: 'ABC123',
      assignedColor: 'white',
      makeMove: socketMakeMove,
    });
    view.rerender(
      <GameProvider>
        <ChessBoard />
      </GameProvider>,
    );
    const before = fen();

    drop('b7', 'a8');
    fireEvent.click(screen.getByRole('button', { name: 'Bishop' }));

    expect(socketMakeMove).toHaveBeenCalledWith('b7', 'a8', 'b');
    expect(fen()).toBe(before); // the board waits for the server to confirm
  });
});
