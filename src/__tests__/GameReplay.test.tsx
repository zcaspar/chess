import React from 'react';
import { render, screen } from '@testing-library/react';
import GameReplay from '../components/GameReplay/GameReplay';
import { useAuth } from '../hooks/useAuth';

// react-chessboard renders a real board we don't assert on; a stub keeps the
// test focused on PGN parsing and the error path.
jest.mock('react-chessboard', () => ({
  Chessboard: ({ position }: any) => (
    <div data-testid="chessboard" data-position={position} />
  ),
}));

jest.mock('../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;

const baseGame = {
  id: 1,
  gameId: 'game-1',
  opponentName: 'Computer (medium)',
  playerColor: 'w' as const,
  gameResult: 'Checkmate! Player 2 wins!',
  gameOutcome: 'loss' as const,
  finalFen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
  pgn: '1. f3 e5 2. g4 Qh4#',
  moveCount: 4,
  gameMode: 'human-vs-ai' as const,
  createdAt: new Date().toISOString(),
};

describe('GameReplay PGN parsing', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null, profile: null });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
      text: async () => '',
    }) as unknown as typeof fetch;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const reactRenderWarnings = () =>
    consoleErrorSpy.mock.calls.filter((call) =>
      String(call[0]).includes('Cannot update a component'),
    );

  it('replays a plain move-list PGN', () => {
    render(<GameReplay game={baseGame} />);

    expect(screen.queryByText('Error Loading Game')).not.toBeInTheDocument();
    expect(screen.getByTestId('chessboard')).toBeInTheDocument();
    expect(reactRenderWarnings()).toHaveLength(0);
  });

  it('replays a PGN that still carries its header tags and result marker', () => {
    const withHeaders = {
      ...baseGame,
      pgn: [
        '[Event "?"]',
        '[Site "?"]',
        '[Date "????.??.??"]',
        '[Result "0-1"]',
        '',
        '1. f3 e5 2. g4 Qh4# 0-1',
      ].join('\n'),
    };

    render(<GameReplay game={withHeaders} />);

    expect(screen.queryByText('Error Loading Game')).not.toBeInTheDocument();
    expect(reactRenderWarnings()).toHaveLength(0);
  });

  it('falls back to the recorded final position when the PGN cannot be parsed', () => {
    // The parser's last-resort branch returns an empty move list when a
    // finalFen is recorded. The board must then show that recorded position,
    // not a pristine starting board pretending to be the game.
    const broken = { ...baseGame, pgn: 'not a chess game at all' };

    render(<GameReplay game={broken} />);

    expect(screen.queryByText('Error Loading Game')).not.toBeInTheDocument();
    expect(screen.getByTestId('chessboard')).toHaveAttribute(
      'data-position',
      broken.finalFen,
    );
  });

  it('shows the error panel when the PGN is missing entirely', () => {
    const broken = { ...baseGame, pgn: '' };

    render(<GameReplay game={broken} />);

    expect(screen.getByText('Error Loading Game')).toBeInTheDocument();
  });

  it('does not log a React render-phase update warning on the error path', () => {
    const broken = { ...baseGame, pgn: '' };

    render(<GameReplay game={broken} />);

    expect(reactRenderWarnings()).toHaveLength(0);
  });

  it('recovers when a previously broken game is replaced by a valid one', () => {
    const broken = { ...baseGame, pgn: '' };

    const { rerender } = render(<GameReplay game={broken} />);
    expect(screen.getByText('Error Loading Game')).toBeInTheDocument();

    rerender(<GameReplay game={baseGame} />);

    expect(screen.queryByText('Error Loading Game')).not.toBeInTheDocument();
    expect(screen.getByTestId('chessboard')).toBeInTheDocument();
  });
});
