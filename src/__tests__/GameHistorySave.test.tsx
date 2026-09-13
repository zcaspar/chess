import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { Square } from 'chess.js';
import { GameProvider, useGame } from '../contexts/GameContext';

// GameContext posts finished games to /api/game-history, but only for a signed-in
// user. The existing GameContext.test.tsx mocks useAuth with `profile: null`, so
// that path never runs there. These tests supply a signed-in user instead.
jest.mock('../utils/chessAI');

const mockUpdateStats = jest.fn();

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'test-uid',
      email: 'player@example.com',
      displayName: 'Test Player',
      getIdToken: jest.fn().mockResolvedValue('fake-id-token'),
    },
    profile: {
      id: '1',
      firebaseUid: 'test-uid',
      username: 'testplayer',
      email: 'player@example.com',
      isGuest: false,
      preferences: {},
      stats: {
        wins: 0,
        losses: 0,
        draws: 0,
        rating: 1200,
        gamesPlayed: 0,
        totalPlayTime: 0,
        winStreak: 0,
        bestWinStreak: 0,
      },
      createdAt: '',
      updatedAt: '',
      lastLogin: '',
    },
    updateStats: mockUpdateStats,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <GameProvider>{children}</GameProvider>
);

// index.tsx renders the app inside <React.StrictMode>, which double-invokes
// state updaters. Anything with a side effect inside an updater therefore fires
// twice in development.
const strictWrapper = ({ children }: { children: React.ReactNode }) => (
  <React.StrictMode>
    <GameProvider>{children}</GameProvider>
  </React.StrictMode>
);

const FOOLS_MATE: Array<[Square, Square]> = [
  ['f2', 'f3'],
  ['e7', 'e5'],
  ['g2', 'g4'],
  ['d8', 'h4'],
];

const gameHistoryPosts = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).includes('/api/game-history'),
  );

describe('saving a finished game to history', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('records the real outcome of a local human-vs-human game', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });

    // Fool's mate — Black delivers checkmate, so the signed-in player (who is
    // White in a local game) lost.
    FOOLS_MATE.forEach(([from, to]) => {
      act(() => {
        result.current.makeMove(from, to);
      });
    });

    expect(result.current.gameState.gameResult).toContain('Checkmate');

    await waitFor(() => expect(gameHistoryPosts(fetchMock).length).toBeGreaterThan(0));

    const [, options] = gameHistoryPosts(fetchMock)[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body.playerColor).toBe('w');
    expect(body.gameResult).toContain('Checkmate');
    expect(body.gameOutcome).toBe('loss');
  });

  it('records a win when the signed-in player actually wins', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });

    // Scholar's mate — White mates on move 4.
    const scholars: Array<[Square, Square]> = [
      ['e2', 'e4'], ['e7', 'e5'],
      ['f1', 'c4'], ['b8', 'c6'],
      ['d1', 'h5'], ['g8', 'f6'],
      ['h5', 'f7'],
    ];
    scholars.forEach(([from, to]) => {
      act(() => {
        result.current.makeMove(from, to);
      });
    });

    expect(result.current.gameState.gameResult).toContain('Checkmate');

    await waitFor(() => expect(gameHistoryPosts(fetchMock).length).toBeGreaterThan(0));

    const [, options] = gameHistoryPosts(fetchMock)[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body.gameOutcome).toBe('win');
  });

  it('records a draw as a draw', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });

    act(() => {
      result.current.makeMove('e2', 'e4');
    });
    act(() => {
      result.current.offerDraw('w');
    });
    act(() => {
      result.current.acceptDraw();
    });

    await waitFor(() => expect(gameHistoryPosts(fetchMock).length).toBeGreaterThan(0));

    const [, options] = gameHistoryPosts(fetchMock)[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body.gameOutcome).toBe('draw');
  });

  it('sends the complete PGN, not just the last move', async () => {
    const { result } = renderHook(() => useGame(), { wrapper });

    FOOLS_MATE.forEach(([from, to]) => {
      act(() => {
        result.current.makeMove(from, to);
      });
    });

    await waitFor(() => expect(gameHistoryPosts(fetchMock).length).toBeGreaterThan(0));

    const [, options] = gameHistoryPosts(fetchMock)[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body.pgn).toContain('f3');
    expect(body.pgn).toContain('e5');
    expect(body.pgn).toContain('g4');
    expect(body.pgn).toContain('Qh4');
    expect(body.moveCount).toBe(4);
  });

  it('posts the finished game exactly once under StrictMode', async () => {
    const { result } = renderHook(() => useGame(), { wrapper: strictWrapper });

    FOOLS_MATE.forEach(([from, to]) => {
      act(() => {
        result.current.makeMove(from, to);
      });
    });

    await waitFor(() => expect(gameHistoryPosts(fetchMock).length).toBeGreaterThan(0));

    // Give any duplicate call a chance to land before asserting.
    await act(async () => {
      await Promise.resolve();
    });

    expect(gameHistoryPosts(fetchMock)).toHaveLength(1);
  });

  it('posts the finished game exactly once for a resignation', async () => {
    const { result } = renderHook(() => useGame(), { wrapper: strictWrapper });

    act(() => {
      result.current.makeMove('e2', 'e4');
    });
    act(() => {
      result.current.resign('b');
    });

    await waitFor(() => expect(gameHistoryPosts(fetchMock).length).toBeGreaterThan(0));

    await act(async () => {
      await Promise.resolve();
    });

    expect(gameHistoryPosts(fetchMock)).toHaveLength(1);
  });
});
