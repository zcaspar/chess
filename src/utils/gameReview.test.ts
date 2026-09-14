import { Chess, Move, Square } from 'chess.js';
import {
  getLocalPlayerColor,
  getWinningColor,
  getOutcome,
  buildPgnFromHistory,
  buildReviewEntry,
} from './gameReview';
import { createMockGameState } from '../test-utils/mockGameState';
import type { GameState } from '../contexts/GameContext';

/** Play a list of SAN moves and return the verbose move objects. */
const playMoves = (sans: string[]): Move[] => {
  const game = new Chess();
  sans.forEach((san) => game.move(san));
  return game.history({ verbose: true }) as Move[];
};

const FOOLS_MATE = ['f3', 'e5', 'g4', 'Qh4#'];

describe('getLocalPlayerColor', () => {
  it('is White for a local human-vs-human game', () => {
    expect(getLocalPlayerColor('human-vs-human', null)).toBe('w');
  });

  it('is Black when the AI plays White', () => {
    expect(getLocalPlayerColor('human-vs-ai', 'w')).toBe('b');
  });

  it('is White when the AI plays Black', () => {
    expect(getLocalPlayerColor('human-vs-ai', 'b')).toBe('w');
  });
});

describe('getWinningColor', () => {
  const players = { player1: 'Alice', player2: 'Bob' };
  const assignment = { white: 'player1', black: 'player2' } as const;

  it('reads the winner out of a checkmate result', () => {
    expect(getWinningColor('Checkmate! Bob wins!', players, assignment)).toBe('b');
  });

  it('reads the winner out of a resignation result', () => {
    expect(getWinningColor('Alice wins by resignation!', players, assignment)).toBe('w');
  });

  it('reads the winner out of a timeout result', () => {
    expect(
      getWinningColor('Bob wins on time! Alice ran out of time.', players, assignment),
    ).toBe('b');
  });

  it('follows the colour assignment when colours are swapped', () => {
    expect(
      getWinningColor('Checkmate! Alice wins!', players, {
        white: 'player2',
        black: 'player1',
      }),
    ).toBe('b');
  });

  it('returns undefined for a draw', () => {
    expect(getWinningColor('Draw by stalemate!', players, assignment)).toBeUndefined();
  });

  it('returns undefined rather than guessing when both players share a name', () => {
    expect(
      getWinningColor('Checkmate! Player 1 wins!', { player1: 'Same', player2: 'Same' }, assignment),
    ).toBeUndefined();
  });
});

describe('getOutcome', () => {
  it('is a win when the local player won', () => {
    expect(getOutcome('Checkmate! Alice wins!', 'w', 'w')).toBe('win');
  });

  it('is a loss when the opponent won', () => {
    expect(getOutcome('Checkmate! Bob wins!', 'b', 'w')).toBe('loss');
  });

  it('is a draw for a drawn game', () => {
    expect(getOutcome('Draw by agreement!', undefined, 'w')).toBe('draw');
  });

  it('is a draw when the winner cannot be determined', () => {
    expect(getOutcome('Checkmate! Someone wins!', undefined, 'w')).toBe('draw');
  });
});

describe('buildPgnFromHistory', () => {
  it('rebuilds a complete PGN from the move list', () => {
    const pgn = buildPgnFromHistory(playMoves(FOOLS_MATE));

    expect(pgn).toContain('f3');
    expect(pgn).toContain('e5');
    expect(pgn).toContain('g4');
    expect(pgn).toContain('Qh4#');
  });

  it('produces a PGN the replay screen can load back', () => {
    const pgn = buildPgnFromHistory(playMoves(FOOLS_MATE));

    const replay = new Chess();
    replay.loadPgn(pgn);

    expect(replay.history()).toHaveLength(4);
    expect(replay.isCheckmate()).toBe(true);
  });

  it('returns an empty string for a game with no moves', () => {
    expect(buildPgnFromHistory([])).toBe('');
  });

  it('stops at a synthetic variant move instead of throwing', () => {
    const history = [
      ...playMoves(['e4']),
      { from: 'b8', to: 'b8', san: '💣xNb8', promotion: undefined } as unknown as Move,
    ];

    const pgn = buildPgnFromHistory(history);

    expect(pgn).toContain('e4');
    expect(pgn).not.toContain('💣');
  });
});

describe('buildReviewEntry', () => {
  /** A finished Fool's mate, as GameContext would leave it. */
  const finishedGame = (overrides: Partial<GameState> = {}): GameState => {
    const history = playMoves(FOOLS_MATE);
    const game = new Chess();
    history.forEach((m) =>
      game.move({ from: m.from as Square, to: m.to as Square, promotion: m.promotion }),
    );

    return createMockGameState({
      // GameContext rebuilds `game` from a bare FEN, so it carries no history.
      game: new Chess(game.fen()),
      history,
      currentMoveIndex: history.length - 1,
      gameResult: 'Checkmate! Player 2 wins!',
      ...overrides,
    });
  };

  it('carries the full game, not the empty PGN of the live board', () => {
    const state = finishedGame();

    // The live board object really does have no history of its own.
    expect(state.game.history()).toHaveLength(0);

    const entry = buildReviewEntry(state);

    expect(entry.pgn).toContain('Qh4#');
    expect(entry.moveCount).toBe(4);
  });

  it('records the final position', () => {
    const state = finishedGame();

    expect(buildReviewEntry(state).finalFen).toBe(state.game.fen());
  });

  it('records a local loss as a loss', () => {
    // Player 2 is Black and won; the local player is White.
    const entry = buildReviewEntry(finishedGame());

    expect(entry.playerColor).toBe('w');
    expect(entry.gameOutcome).toBe('loss');
  });

  it('records a local win as a win', () => {
    const entry = buildReviewEntry(
      finishedGame({ gameResult: 'Checkmate! Player 1 wins!' }),
    );

    expect(entry.gameOutcome).toBe('win');
  });

  it('names the computer as the opponent in an AI game', () => {
    const entry = buildReviewEntry(
      finishedGame({ gameMode: 'human-vs-ai', aiColor: 'b', aiDifficulty: 'expert' }),
    );

    expect(entry.opponentName).toBe('Computer (expert)');
    expect(entry.aiDifficulty).toBe('expert');
    expect(entry.playerColor).toBe('w');
  });

  it('names the other player as the opponent in a local game', () => {
    const entry = buildReviewEntry(finishedGame());

    expect(entry.opponentName).toBe('Player 2');
  });

  it('uses the server-assigned colour for an online game', () => {
    const entry = buildReviewEntry(
      finishedGame({
        onlineGameRoom: { myColor: 'b', opponentName: 'Remote Player' },
      } as Partial<GameState>),
    );

    expect(entry.playerColor).toBe('b');
    expect(entry.opponentName).toBe('Remote Player');
    // Black won the Fool's mate, so from Black's seat this is a win.
    expect(entry.gameOutcome).toBe('win');
  });

  it('carries the time control through when one was set', () => {
    const entry = buildReviewEntry(
      finishedGame({ timeControl: { initial: 300, increment: 5 } }),
    );

    expect(entry.timeControl).toEqual({ initial: 300, increment: 5 });
  });

  it('leaves the time control undefined for an untimed game', () => {
    expect(buildReviewEntry(finishedGame()).timeControl).toBeUndefined();
  });
});
