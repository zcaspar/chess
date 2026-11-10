import React from 'react';
import { render, screen, act, waitFor, renderHook } from '@testing-library/react';
import { Chess } from 'chess.js';
import { onAuthStateChanged } from 'firebase/auth';
import { formatRating, formatRatingChange } from '../utils/rating';
import { OnlineGameStatus } from '../components/OnlineGameStatus/OnlineGameStatus';
import GameEndModal from '../components/GameEndModal/GameEndModal';
import RatingPanel from '../components/Ratings/RatingPanel';
import { AuthProvider, useAuth as useRealAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../hooks/useAuth';
import { createMockGameContext, createMockGameState } from '../test-utils/mockGameState';

jest.mock('../config/firebase-client', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInAnonymously: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.mock('../contexts/SocketContext', () => ({ useSocket: jest.fn() }));
jest.mock('../contexts/GameContext', () => ({
  ...jest.requireActual('../contexts/GameContext'),
  useGame: jest.fn(),
}));
jest.mock('../hooks/useAuth', () => ({ useAuth: jest.fn() }));

const mockUseSocket = useSocket as jest.Mock;
const mockUseGame = useGame as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

const room = (overrides = {}) => ({
  isConnected: true,
  roomCode: 'ABC123',
  assignedColor: 'white',
  players: {
    white: { id: 'w', username: 'Player', displayName: 'Alice', rating: 1612, ratingProvisional: false },
    black: { id: 'b', username: 'Player', displayName: 'Bob', rating: 1500, ratingProvisional: true },
  },
  rated: true,
  ratingChanges: null,
  ...overrides,
});

describe('rating formatting', () => {
  it('marks a provisional rating with a question mark', () => {
    expect(formatRating(1612)).toBe('1612');
    expect(formatRating(1500.4, true)).toBe('1500?');
    expect(formatRating(null)).toBe('Unrated');
    expect(formatRating(undefined)).toBe('Unrated');
  });

  it('signs a rating change', () => {
    expect(formatRatingChange(12)).toBe('+12');
    expect(formatRatingChange(-8)).toBe('−8');
    expect(formatRatingChange(0)).toBe('±0');
  });
});

describe('ratings in an online game', () => {
  it('shows each player\'s rating and that the game is rated', () => {
    mockUseSocket.mockReturnValue(room());
    render(<OnlineGameStatus />);

    expect(screen.getByText('Rated')).toBeInTheDocument();
    expect(screen.getByTestId('rating-white')).toHaveTextContent('1612');
    expect(screen.getByTestId('rating-black')).toHaveTextContent('1500?');
  });

  it('says a game is casual when a player has no rating', () => {
    mockUseSocket.mockReturnValue(
      room({
        rated: false,
        players: {
          white: { id: 'w', username: 'Player', displayName: 'Alice', rating: 1612 },
          black: { id: 'b', username: 'Player', displayName: 'Guest', rating: null },
        },
      }),
    );
    render(<OnlineGameStatus />);

    expect(screen.getByText('Casual')).toBeInTheDocument();
    expect(screen.queryByTestId('rating-black')).not.toBeInTheDocument();
  });

  it('does not call a game rated or casual before the opponent has arrived', () => {
    mockUseSocket.mockReturnValue(room({ rated: false, players: { white: room().players.white, black: null } }));
    render(<OnlineGameStatus />);

    expect(screen.queryByText('Rated')).not.toBeInTheDocument();
    expect(screen.queryByText('Casual')).not.toBeInTheDocument();
  });

  it('shows what the game did to both ratings once it ends', () => {
    mockUseSocket.mockReturnValue(
      room({
        players: {
          white: { ...room().players.white, rating: 1598 },
          black: { ...room().players.black, rating: 1688 },
        },
        ratingChanges: {
          white: { before: 1612, after: 1598, change: -14, provisional: false },
          black: { before: 1500, after: 1688, change: 188, provisional: true },
        },
      }),
    );
    render(<OnlineGameStatus />);

    expect(screen.getByTestId('rating-white')).toHaveTextContent('1598');
    expect(screen.getByTestId('rating-change-white')).toHaveTextContent('−14');
    expect(screen.getByTestId('rating-change-black')).toHaveTextContent('+188');
  });
});

describe('rating change on the game-over screen', () => {
  const finished = () => {
    const game = new Chess();
    ['f3', 'e5', 'g4', 'Qh4#'].forEach((san) => game.move(san));
    return game.history({ verbose: true });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockUseGame.mockReturnValue(
      createMockGameContext({
        gameState: createMockGameState({
          gameResult: 'Black wins by checkmate',
          history: finished() as any,
          currentMoveIndex: 3,
        }),
      }),
    );
  });

  afterEach(() => jest.useRealTimers());

  const reveal = () =>
    act(() => {
      jest.advanceTimersByTime(600);
    });

  it('shows the new rating and the change after a rated game', () => {
    render(<GameEndModal ratingChange={{ before: 1500, after: 1512, change: 12, provisional: true }} />);
    reveal();

    expect(screen.getByTestId('rating-change')).toHaveTextContent('Rating 1512? (+12)');
  });

  it('says nothing about ratings after a casual or local game', () => {
    render(<GameEndModal />);
    reveal();

    expect(screen.getByText('Black wins by checkmate')).toBeInTheDocument();
    expect(screen.queryByTestId('rating-change')).not.toBeInTheDocument();
  });
});

describe('RatingPanel', () => {
  const originalFetch = global.fetch;
  const respond = (body: unknown) => ({ ok: true, json: async () => body });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows the player\'s rating, their recent rated games and the leaderboard', async () => {
    mockUseAuth.mockReturnValue({
      user: { isAnonymous: false, getIdToken: async () => 'token' },
      profile: { isGuest: false, rating: { value: 1688, deviation: 250, provisional: true, games: 1 } },
    });
    global.fetch = jest.fn(async (url: string) =>
      String(url).includes('/leaderboard')
        ? respond({ players: [{ rank: 1, name: 'Champ', rating: 2100, provisional: false, games: 40 }] })
        : respond({
            history: [
              { gameId: 'g2', outcome: 'win', opponentRating: 1612, ratingBefore: 1500, ratingAfter: 1688, createdAt: '' },
              { gameId: 'g1', outcome: 'loss', opponentRating: 1500, ratingBefore: 1600, ratingAfter: 1500, createdAt: '' },
            ],
          }),
    ) as unknown as typeof fetch;

    render(<RatingPanel />);

    expect(screen.getByTestId('own-rating')).toHaveTextContent('1688?');
    expect(screen.getByText('1 rated game')).toBeInTheDocument();
    expect(await screen.findByText('Won vs 1612')).toBeInTheDocument();
    expect(screen.getByText('1688 (+188)')).toBeInTheDocument();
    expect(screen.getByText('1500 (−100)')).toBeInTheDocument();
    expect(await screen.findByText('Champ')).toBeInTheDocument();
    expect(screen.getByText('2100')).toBeInTheDocument();

    // The history request carries the player's token; the leaderboard is public.
    const calls = (global.fetch as jest.Mock).mock.calls;
    const historyCall = calls.find(([url]) => String(url).includes('/rating-history'));
    expect(historyCall[1].headers.Authorization).toBe('Bearer token');
    const boardCall = calls.find(([url]) => String(url).includes('/leaderboard'));
    expect(boardCall[1]).toBeUndefined();
  });

  it('tells a guest how to get a rating, and asks for no private data', async () => {
    mockUseAuth.mockReturnValue({
      user: { isAnonymous: true, getIdToken: async () => 'token' },
      profile: { isGuest: true, rating: { value: 1500, deviation: 350, provisional: true, games: 0 } },
    });
    global.fetch = jest.fn(async () => respond({ players: [] })) as unknown as typeof fetch;

    render(<RatingPanel />);

    expect(screen.getByText(/Sign in with an account to play rated games/)).toBeInTheDocument();
    expect(await screen.findByText(/Nobody is ranked yet/)).toBeInTheDocument();
    expect((global.fetch as jest.Mock).mock.calls.some(([url]) => String(url).includes('/rating-history'))).toBe(false);
  });

  it('copes with the leaderboard being unavailable', async () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null });
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    render(<RatingPanel />);

    expect(await screen.findByText(/leaderboard is unavailable/)).toBeInTheDocument();
  });
});

describe('the signed-in profile after a rated game', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('picks up the new rating as soon as the server announces it', async () => {
    const profile = {
      id: 'me',
      firebaseUid: 'me',
      username: 'me',
      email: 'me@example.com',
      isGuest: false,
      preferences: {},
      stats: { wins: 0, losses: 0, draws: 0, rating: 1500, gamesPlayed: 0, totalPlayTime: 0, winStreak: 0, bestWinStreak: 0 },
      rating: { value: 1500, deviation: 350, provisional: true, games: 0 },
      createdAt: '',
      updatedAt: '',
      lastLogin: '',
    };
    (onAuthStateChanged as jest.Mock).mockImplementation((_auth, callback) => {
      callback({ uid: 'me', email: 'me@example.com', isAnonymous: false, getIdToken: async () => 'token' });
      return jest.fn();
    });
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => profile })) as unknown as typeof fetch;

    const { result } = renderHook(() => useRealAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(result.current.profile?.rating?.value).toBe(1500));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('socketRatingsUpdated', {
          detail: [
            { playerId: 'someone-else', before: 1612, after: 1598, change: -14, provisional: false },
            { playerId: 'me', before: 1500, after: 1688, change: 188, provisional: true },
          ],
        }),
      );
    });

    expect(result.current.profile?.rating).toMatchObject({ value: 1688, provisional: true, games: 1 });
    expect(result.current.profile?.stats.rating).toBe(1688);
  });
});
