import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { Square } from 'chess.js';
import { GameProvider, useGame } from '../contexts/GameContext';
import { ChessAI } from '../utils/chessAI';
import { createMockChessAI } from '../test-utils/mockChessAI';

jest.mock('../utils/chessAI');

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, profile: null, updateStats: jest.fn() }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <GameProvider>{children}</GameProvider>
);

/** A promise whose resolution the test controls. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const mockAI = (getBestMove: jest.Mock) => {
  (ChessAI as jest.MockedClass<typeof ChessAI>).mockImplementation(() =>
    createMockChessAI({ getBestMove }),
  );
};

describe('a stale makeMove cannot rewind the game', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAI(jest.fn().mockResolvedValue(null));
  });

  it('applies a move held from before other moves to the current position', () => {
    const { result } = renderHook(() => useGame(), { wrapper });

    // Captured while the board is still empty of moves. The AI holds a
    // reference exactly like this across its ~30s think.
    const staleMakeMove = result.current.makeMove;

    act(() => {
      result.current.makeMove('e2', 'e4');
    });
    act(() => {
      result.current.makeMove('e7', 'e5');
    });

    act(() => {
      staleMakeMove('d2', 'd4');
    });

    // The bug: the stale callback rebuilt history from its own snapshot, so the
    // game rewound to a single move and carried on from there.
    expect(result.current.gameState.history.map((m) => m.san)).toEqual([
      'e4',
      'e5',
      'd4',
    ]);
    expect(result.current.gameState.currentMoveIndex).toBe(2);
  });

  it('rejects a stale move that is not legal in the current position', () => {
    const { result } = renderHook(() => useGame(), { wrapper });

    const staleMakeMove = result.current.makeMove;

    act(() => {
      result.current.makeMove('e2', 'e4');
    });

    // e2-e4 again: legal from the start position this callback remembers,
    // impossible now.
    let accepted: boolean | undefined;
    act(() => {
      accepted = staleMakeMove('e2', 'e4');
    });

    expect(accepted).toBe(false);
    expect(result.current.gameState.history.map((m) => m.san)).toEqual(['e4']);
  });
});

describe('AI vs AI move ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /** Let queued promise callbacks and the AI-vs-AI pacing delay run. */
  const settle = async () => {
    await act(async () => {
      jest.advanceTimersByTime(1500);
      await Promise.resolve();
    });
  };

  it('discards an engine move once the position has moved on', async () => {
    // The stale answer must be a move that is still *legal* in the new
    // position, or makeMove's own validity check would mask the bug. Here the
    // engine is asked about the start position, two knight moves happen while
    // it thinks, and e2-e4 is legal in both — but it was chosen for a position
    // that no longer exists and must not be played.
    const pending = deferred<{ from: Square; to: Square } | null>();
    const getBestMove = jest
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ from: 'b1', to: 'c3' });
    mockAI(getBestMove);

    const { result } = renderHook(() => useGame(), { wrapper });

    await act(async () => {
      await result.current.setGameMode('ai-vs-ai');
    });
    await waitFor(() => expect(getBestMove).toHaveBeenCalled());

    act(() => {
      result.current.makeMove('g1', 'f3');
    });
    act(() => {
      result.current.makeMove('g8', 'f6');
    });

    await act(async () => {
      pending.resolve({ from: 'e2', to: 'e4' });
      await Promise.resolve();
    });
    await settle();
    await settle();

    const sans = result.current.gameState.history.map((m) => m.san);
    expect(sans.slice(0, 2)).toEqual(['Nf3', 'Nf6']);
    expect(sans).not.toContain('e4');
  });

  it('keeps playing after a move is discarded', async () => {
    // The discard path changes nothing on the board, so no dependency of the AI
    // effect changes either. Without an explicit nudge the computer simply
    // stops playing.
    const first = deferred<{ from: Square; to: Square } | null>();
    const getBestMove = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ from: 'g8', to: 'f6' });
    mockAI(getBestMove);

    const { result } = renderHook(() => useGame(), { wrapper });

    await act(async () => {
      await result.current.setGameMode('ai-vs-ai');
    });
    await waitFor(() => expect(getBestMove).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.makeMove('d2', 'd4');
    });

    await act(async () => {
      first.resolve({ from: 'e2', to: 'e4' });
      await Promise.resolve();
    });
    await settle();

    // Asked again for the new position rather than going quiet.
    await waitFor(() => expect(getBestMove.mock.calls.length).toBeGreaterThan(1));
  });

  it('plays one move at a time rather than in bursts', async () => {
    const getBestMove = jest.fn().mockResolvedValue({ from: 'e2', to: 'e4' });
    mockAI(getBestMove);

    const { result } = renderHook(() => useGame(), { wrapper });

    await act(async () => {
      await result.current.setGameMode('ai-vs-ai');
    });
    await settle();

    // A single engine answer must produce a single move on the board, however
    // many times the effect re-runs while it is in flight.
    const e4Moves = result.current.gameState.history.filter((m) => m.san === 'e4');
    expect(e4Moves.length).toBeLessThanOrEqual(1);
  });
});
