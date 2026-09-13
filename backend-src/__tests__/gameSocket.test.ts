import { Chess } from 'chess.js';

const mockQuery = jest.fn();

jest.mock('../config/database', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
  query: (...a: unknown[]) => mockQuery(...a),
  testConnection: jest.fn().mockResolvedValue(true),
  getPoolStatus: jest.fn(),
  closePool: jest.fn(),
}));

jest.mock('../utils/roomPersistence', () => ({
  RoomPersistence: {
    loadRooms: jest.fn().mockReturnValue([]),
    saveRooms: jest.fn(),
  },
}));

const mockVerifyToken = jest.fn();
jest.mock('../middleware/auth', () => ({
  verifyToken: (...a: unknown[]) => mockVerifyToken(...a),
  verifyFirebaseToken: jest.fn(),
  authenticateToken: jest.fn(),
  optionalAuth: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GameSocketHandler } = require('../sockets/gameSocket');

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type RoomEmit = { room: string; event: string; payload: any };

const makeIo = () => {
  const roomEmits: RoomEmit[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload?: any) => roomEmits.push({ room, event, payload }),
    }),
  };
  return { io, roomEmits };
};

const makeSocket = (id: string, userId?: string) => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const emitted: Array<{ event: string; payload: any }> = [];
  const socket = {
    id,
    data: { userId, username: userId } as Record<string, unknown>,
    on: (event: string, fn: (...args: any[]) => any) => {
      handlers.set(event, fn);
    },
    emit: (event: string, payload?: any) => {
      emitted.push({ event, payload });
    },
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
    handlers,
    emitted,
  };
  return socket;
};

/**
 * Seed a two-player room directly. Going through createRoom/joinRoom would
 * require a live database; the handler's own state is what these tests are
 * about, so it is set up in place.
 */
const seedRoom = (
  handler: any,
  {
    roomCode = 'ABCD',
    fen,
    gameId,
    whiteSocketId = 'socket-white',
    blackSocketId = 'socket-black',
    timeControl = null as { initial: number; increment: number } | null,
  }: {
    roomCode?: string;
    fen?: string;
    gameId?: number;
    whiteSocketId?: string;
    blackSocketId?: string;
    timeControl?: { initial: number; increment: number } | null;
  } = {},
) => {
  const room = {
    id: roomCode,
    roomCode,
    whitePlayer: { id: 'white-uid', username: 'White', socketId: whiteSocketId },
    blackPlayer: { id: 'black-uid', username: 'Black', socketId: blackSocketId },
    game: fen ? new Chess(fen) : new Chess(),
    spectators: new Set<string>(),
    timeControl,
    whiteTime: timeControl ? timeControl.initial : 0,
    blackTime: timeControl ? timeControl.initial : 0,
    lastMoveTime: Date.now(),
    gameId,
  };
  handler.rooms.set(roomCode, room);
  handler.playerRooms.set(whiteSocketId, roomCode);
  handler.playerRooms.set(blackSocketId, roomCode);
  return room;
};

describe('GameSocketHandler', () => {
  let handler: any;
  let io: ReturnType<typeof makeIo>['io'];
  let roomEmits: RoomEmit[];

  beforeEach(() => {
    jest.useFakeTimers();
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    const made = makeIo();
    io = made.io;
    roomEmits = made.roomEmits;
    handler = new GameSocketHandler(io);
  });

  afterEach(() => {
    handler.shutdown();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const connect = (id: string, userId?: string) => {
    const socket = makeSocket(id, userId);
    handler.handleConnection(socket as any);
    return socket;
  };

  const gameEnded = () => roomEmits.filter((e) => e.event === 'gameEnded');
  const movesMade = () => roomEmits.filter((e) => e.event === 'moveMade');

  describe('makeMove', () => {
    it('rejects a move from an unauthenticated socket', async () => {
      const socket = connect('socket-white', undefined);
      seedRoom(handler);

      await socket.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });

      expect(socket.emitted).toContainEqual({
        event: 'error',
        payload: { message: 'Not authenticated' },
      });
      expect(movesMade()).toHaveLength(0);
    });

    it('rejects a move from a socket that is not in a room', async () => {
      const socket = connect('socket-stranger', 'stranger-uid');

      await socket.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });

      expect(socket.emitted.map((e) => e.event)).toContain('error');
      expect(movesMade()).toHaveLength(0);
    });

    it('rejects a move from someone who is only a spectator', async () => {
      const socket = connect('socket-spectator', 'spectator-uid');
      seedRoom(handler);
      handler.playerRooms.set('socket-spectator', 'ABCD');

      await socket.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });

      expect(socket.emitted).toContainEqual({
        event: 'error',
        payload: { message: 'You are not a player in this game' },
      });
      expect(movesMade()).toHaveLength(0);
    });

    it('rejects a move made out of turn', async () => {
      const black = connect('socket-black', 'black-uid');
      seedRoom(handler); // White to move

      await black.handlers.get('makeMove')!({ from: 'e7', to: 'e5' });

      expect(black.emitted).toContainEqual({
        event: 'error',
        payload: { message: 'Not your turn' },
      });
      expect(movesMade()).toHaveLength(0);
    });

    it('rejects an illegal move without broadcasting it', async () => {
      const white = connect('socket-white', 'white-uid');
      const room = seedRoom(handler);

      await white.handlers.get('makeMove')!({ from: 'e2', to: 'e5' });

      expect(white.emitted.map((e) => e.event)).toContain('error');
      expect(movesMade()).toHaveLength(0);
      expect(room.game.history()).toHaveLength(0);
    });

    it('broadcasts a legal move to the room', async () => {
      const white = connect('socket-white', 'white-uid');
      seedRoom(handler);

      await white.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });

      expect(movesMade()).toHaveLength(1);
      expect(movesMade()[0].payload.move).toMatchObject({ from: 'e2', to: 'e4' });
      expect(movesMade()[0].payload.turn).toBe('b');
    });

    it('rejects a move once the game is already over', async () => {
      // Fool's mate has already been played; it is White to move and mated.
      const white = connect('socket-white', 'white-uid');
      const room = seedRoom(handler, {
        fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      });

      await white.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });

      expect(movesMade()).toHaveLength(0);
      expect(room.game.history()).toHaveLength(0);
    });
  });

  describe('ending a game', () => {
    it('announces checkmate to the room', async () => {
      const black = connect('socket-black', 'black-uid');
      seedRoom(handler, {
        // After 1. f3 e5 2. g4 — Black to move, Qh4 is mate.
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',
        gameId: 7,
      });

      await black.handlers.get('makeMove')!({ from: 'd8', to: 'h4' });

      expect(gameEnded()).toHaveLength(1);
      expect(gameEnded()[0].payload).toMatchObject({
        result: 'black',
        reason: 'checkmate',
      });
    });

    it('announces the end even when the game was never persisted to the database', async () => {
      // room.gameId is undefined whenever the createRoom insert failed (a DB
      // blip). endGame currently returns early in that case, so both players
      // are left staring at a board that is actually finished.
      const black = connect('socket-black', 'black-uid');
      seedRoom(handler, {
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',
        gameId: undefined,
      });

      await black.handlers.get('makeMove')!({ from: 'd8', to: 'h4' });

      expect(gameEnded()).toHaveLength(1);
    });

    it('announces the end even when the database write fails', async () => {
      const black = connect('socket-black', 'black-uid');
      seedRoom(handler, {
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',
        gameId: 7,
      });
      mockQuery.mockRejectedValue(new Error('connection terminated'));

      await black.handlers.get('makeMove')!({ from: 'd8', to: 'h4' });

      expect(gameEnded()).toHaveLength(1);
    });

    it('records the completed game exactly once', async () => {
      const black = connect('socket-black', 'black-uid');
      seedRoom(handler, {
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',
        gameId: 7,
      });

      await black.handlers.get('makeMove')!({ from: 'd8', to: 'h4' });

      const resultWrites = mockQuery.mock.calls.filter(([sql]) =>
        String(sql).includes('UPDATE games SET result'),
      );
      expect(resultWrites).toHaveLength(1);
      expect(gameEnded()).toHaveLength(1);
    });

    it('announces a resignation to the room', async () => {
      const white = connect('socket-white', 'white-uid');
      seedRoom(handler, { gameId: 7 });

      await white.handlers.get('resign')!();

      expect(gameEnded()).toHaveLength(1);
      expect(gameEnded()[0].payload).toMatchObject({
        result: 'black',
        reason: 'resignation',
      });
    });

    it('announces an agreed draw to the room', async () => {
      const white = connect('socket-white', 'white-uid');
      const black = connect('socket-black', 'black-uid');
      seedRoom(handler, { gameId: 7 });

      white.handlers.get('offerDraw')!();
      await black.handlers.get('acceptDraw')!();

      expect(gameEnded()).toHaveLength(1);
      expect(gameEnded()[0].payload).toMatchObject({
        result: 'draw',
        reason: 'agreement',
      });
    });

    it('ignores a resignation from an unauthenticated socket', async () => {
      const socket = connect('socket-white', undefined);
      seedRoom(handler, { gameId: 7 });

      await socket.handlers.get('resign')!();

      expect(gameEnded()).toHaveLength(0);
    });
  });

  describe('authenticate', () => {
    it('rejects an invalid token and leaves the socket unauthenticated', async () => {
      mockVerifyToken.mockRejectedValue(new Error('bad token'));
      const socket = connect('socket-x');

      await socket.handlers.get('authenticate')!('garbage');

      expect(socket.emitted).toContainEqual({
        event: 'authenticated',
        payload: { success: false, error: 'Invalid token' },
      });
      expect(socket.data.userId).toBeUndefined();
    });

    it.each([
      'auth/invalid-project-id',
      'The default Firebase app does no-app exist.',
      'app/invalid-credential',
    ])(
      'does not fall back to a demo user for "%s" when NODE_ENV is unset',
      async (message) => {
        // The socket path has the same demo-auth fallback as the HTTP
        // middleware, gated only on NODE_ENV !== 'production'. A deployment
        // that forgets NODE_ENV therefore grants any socket a session.
        const originalNodeEnv = process.env.NODE_ENV;
        delete process.env.NODE_ENV;
        mockVerifyToken.mockRejectedValue(new Error(message));
        const socket = connect('socket-x');

        await socket.handlers.get('authenticate')!('garbage');

        expect(socket.data.userId).toBeUndefined();
        process.env.NODE_ENV = originalNodeEnv;
      },
    );

    it('accepts a valid token', async () => {
      mockVerifyToken.mockResolvedValue({ uid: 'real-user', name: 'Real' });
      mockQuery.mockResolvedValue({ rows: [{ firebase_uid: 'real-user' }] });
      const socket = connect('socket-x');

      await socket.handlers.get('authenticate')!('good-token');

      expect(socket.emitted.some((e) => e.event === 'authenticated' && e.payload.success)).toBe(
        true,
      );
      expect(socket.data.userId).toBe('real-user');
    });
  });
});
