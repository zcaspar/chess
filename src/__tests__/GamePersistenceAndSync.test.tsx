import React from 'react';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { Chess, Square } from 'chess.js';
import { GameProvider, useGame } from '../contexts/GameContext';

/**
 * Three things a player could lose without doing anything wrong:
 *  - the whole game, by reloading the page;
 *  - thinking time accounting, by pressing Pause;
 *  - the opponent's moves in an online game, by looking at another screen.
 */

jest.mock('../utils/chessAI');
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    updateStats: jest.fn(),
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <GameProvider>{children}</GameProvider>
);

const mount = () => renderHook(() => useGame(), { wrapper });

const play = (result: { current: ReturnType<typeof useGame> }, moves: Array<[string, string, string?]>) => {
  moves.forEach(([from, to, promotion]) => {
    act(() => {
      result.current.makeMove(from as Square, to as Square, promotion);
    });
  });
};

const STORAGE_KEY = 'chess_game_in_progress_v1';

describe('a game in progress survives a reload', () => {
  it('restores the position, move list and settings', () => {
    const view = mount();
    act(() => {
      view.result.current.setPlayerName('player1', 'Ada');
    });
    play(view.result, [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']]);
    const fenBefore = view.result.current.gameState.game.fen();
    view.unmount(); // the page goes away

    const { result: reloaded } = mount();

    expect(reloaded.current.gameState.game.fen()).toBe(fenBefore);
    expect(reloaded.current.gameState.history.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(reloaded.current.gameState.currentMoveIndex).toBe(2);
    expect(reloaded.current.gameState.players.player1).toBe('Ada');
    expect(reloaded.current.canUndo).toBe(true);
  });

  it('lets the restored game carry on', () => {
    const view = mount();
    play(view.result, [['e2', 'e4']]);
    view.unmount();

    const { result: reloaded } = mount();
    play(reloaded, [['e7', 'e5']]);

    expect(reloaded.current.gameState.history.map((m) => m.san)).toEqual(['e4', 'e5']);
  });

  it('keeps an underpromotion as the piece that was chosen', () => {
    const view = mount();
    play(view.result, [
      ['a2', 'a4'], ['b7', 'b5'], ['a4', 'b5'], ['a7', 'a6'],
      ['b5', 'a6'], ['c8', 'b7'], ['a6', 'b7'], ['b8', 'c6'],
      ['b7', 'a8', 'n'],
    ]);
    expect(view.result.current.gameState.game.get('a8' as Square)).toMatchObject({ type: 'n', color: 'w' });
    view.unmount();

    const { result: reloaded } = mount();

    expect(reloaded.current.gameState.game.get('a8' as Square)).toMatchObject({ type: 'n', color: 'w' });
  });

  it('restores the clocks with the time each side had left', () => {
    jest.useFakeTimers();
    try {
      const view = mount();
      act(() => {
        view.result.current.setTimeControl(5, 0);
      });
      play(view.result, [['e2', 'e4']]);
      act(() => {
        jest.advanceTimersByTime(20_000); // Black thinks for 20s
      });
      play(view.result, [['e7', 'e5']]);
      view.unmount();

      const { result: reloaded } = mount();
      const state = reloaded.current.gameState;

      expect(state.timeControl).toEqual({ initial: 300, increment: 0 });
      expect(state.whiteTime).toBe(300);
      expect(state.blackTime).toBeCloseTo(280, 0);
      expect(state.activeColor).toBe('w');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not bring back a finished game', () => {
    const view = mount();
    play(view.result, [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]);
    expect(view.result.current.gameState.gameResult).toContain('Checkmate');
    view.unmount();

    const { result: reloaded } = mount();

    expect(reloaded.current.gameState.history).toHaveLength(0);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('forgets the game when a new one is started', () => {
    const view = mount();
    play(view.result, [['e2', 'e4']]);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    act(() => {
      view.result.current.resetGame();
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['garbage', 'not json at all'],
    ['an impossible move list', JSON.stringify({
      version: 1, savedAt: Date.now(), moves: [{ from: 'e2', to: 'e5' }], fen: 'x', currentMoveIndex: 0,
      gameMode: 'human-vs-human',
    })],
    ['a position the moves do not reach', JSON.stringify({
      version: 1, savedAt: Date.now(), moves: [{ from: 'e2', to: 'e4' }],
      fen: '8/8/8/8/8/8/8/K6k w - - 0 1', currentMoveIndex: 0, gameMode: 'human-vs-human',
    })],
    ['a stale save', JSON.stringify({
      version: 1, savedAt: Date.now() - 30 * 24 * 60 * 60 * 1000, moves: [{ from: 'e2', to: 'e4' }],
      fen: new Chess().fen(), currentMoveIndex: 0, gameMode: 'human-vs-human',
    })],
  ])('starts fresh from %s', (_label, stored) => {
    window.localStorage.setItem(STORAGE_KEY, stored);

    const { result } = mount();

    expect(result.current.gameState.history).toHaveLength(0);
    expect(result.current.gameState.game.fen()).toBe(new Chess().fen());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('pausing the clock', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps the time already used instead of handing it back', () => {
    const { result } = mount();
    act(() => {
      result.current.setTimeControl(5, 0);
    });
    play(result, [['e2', 'e4']]); // Black's clock starts
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    act(() => {
      result.current.pauseClock();
    });

    expect(result.current.gameState.blackTime).toBeCloseTo(270, 0);
    expect(result.current.gameState.startTime).toBeNull();

    // Time does not run while paused...
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    // ...and resuming gives the clock back to the side to move, not to White.
    act(() => {
      result.current.startClock();
    });

    expect(result.current.gameState.activeColor).toBe('b');
    expect(result.current.gameState.blackTime).toBeCloseTo(270, 0);
    expect(result.current.gameState.whiteTime).toBe(300);
  });

  it('resumes by itself when the next move is played', () => {
    const { result } = mount();
    act(() => {
      result.current.setTimeControl(5, 0);
    });
    play(result, [['e2', 'e4']]);
    act(() => {
      result.current.pauseClock();
    });

    play(result, [['e7', 'e5']]);

    expect(result.current.gameState.activeColor).toBe('w');
    expect(result.current.gameState.startTime).not.toBeNull();
  });
});

describe('online moves arrive whichever screen is showing', () => {
  const serverEvent = (name: string, detail: unknown) =>
    act(() => {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    });

  const moveMade = (game: Chess, from: string, to: string) => {
    const move = game.move({ from, to });
    return {
      move: { from: move.from, to: move.to, promotion: move.promotion, san: move.san },
      fen: game.fen(),
      pgn: game.pgn(),
      turn: game.turn(),
      whiteTime: 299,
      blackTime: 300,
    };
  };

  const joinRoom = () =>
    serverEvent('socketRoomJoined', {
      roomCode: 'ABC123',
      assignedColor: 'black',
      gameState: { fen: new Chess().fen(), pgn: '', turn: 'w', isGameOver: false, history: [] },
      players: { white: { id: 'w', username: 'Player', displayName: 'Opponent' }, black: { id: 'b', username: 'Player', displayName: 'Me' } },
      timeControl: { initial: 300, increment: 0 },
      whiteTime: 300,
      blackTime: 300,
    });

  it('applies a server move with no board component mounted', () => {
    // Only the provider is mounted here — exactly the situation when the
    // player has the History or Stats screen open.
    const { result } = mount();
    joinRoom();
    const server = new Chess();

    serverEvent('socketMoveMade', moveMade(server, 'e2', 'e4'));

    expect(result.current.gameState.history.map((m) => m.san)).toEqual(['e4']);
    expect(result.current.gameState.game.fen()).toBe(server.fen());
    expect(result.current.gameState.whiteTime).toBe(299);
    expect(result.current.gameState.activeColor).toBe('b');
  });

  it('takes the server position when the local board has fallen out of step', () => {
    const { result } = mount();
    joinRoom();
    const server = new Chess();
    serverEvent('socketMoveMade', moveMade(server, 'e2', 'e4'));

    // Two moves happen on the server but only the second reaches this client.
    moveMade(server, 'e7', 'e5');
    serverEvent('socketMoveMade', moveMade(server, 'g1', 'f3'));

    expect(result.current.gameState.game.fen()).toBe(server.fen());
    expect(result.current.gameState.history.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(result.current.gameState.currentMoveIndex).toBe(2);
  });

  it('does not store an online game as a local game in progress', () => {
    mount();
    joinRoom();
    const server = new Chess();

    serverEvent('socketMoveMade', moveMade(server, 'e2', 'e4'));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
