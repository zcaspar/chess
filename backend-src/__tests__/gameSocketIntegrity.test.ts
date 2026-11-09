/**
 * Multiplayer integrity: who may sit in a seat, who may end a game, and how
 * many times a game can end. Each test here is a way one player (or a
 * bystander) could previously cheat or break a live game.
 */
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

const mockRecordGameResult = jest.fn();
jest.mock('../models/User', () => ({
  UserModel: { recordGameResult: (...a: unknown[]) => mockRecordGameResult(...a) },
}));

const mockSaveGame = jest.fn();
jest.mock('../models/GameHistory', () => ({
  GameHistoryModel: { saveGame: (...a: unknown[]) => mockSaveGame(...a) },
}));

const mockUpdateRecord = jest.fn();
jest.mock('../models/HeadToHead', () => ({
  HeadToHeadModel: { updateRecord: (...a: unknown[]) => mockUpdateRecord(...a) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GameSocketHandler, parseTimeControl, describeResult } = require('../sockets/gameSocket');

type Emit = { room: string; event: string; payload: any };

const makeIo = () => {
  const roomEmits: Emit[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload?: any) => roomEmits.push({ room, event, payload }),
    }),
  };
  return { io, roomEmits };
};

const makeSocket = (id: string, userId?: string, username = 'Player') => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const emitted: Array<{ event: string; payload: any }> = [];
  const broadcast: Emit[] = [];
  return {
    id,
    data: { userId, username } as Record<string, unknown>,
    on: (event: string, fn: (...args: any[]) => any) => {
      handlers.set(event, fn);
    },
    emit: (event: string, payload?: any) => {
      emitted.push({ event, payload });
    },
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    to: (room: string) => ({
      emit: (event: string, payload?: any) => broadcast.push({ room, event, payload }),
    }),
    handlers,
    emitted,
    broadcast,
  };
};

describe('multiplayer integrity', () => {
  let handler: any;
  let io: ReturnType<typeof makeIo>['io'];
  let roomEmits: Emit[];

  beforeEach(() => {
    jest.useFakeTimers();
    mockQuery.mockReset().mockResolvedValue({ rows: [{ id: 1 }] });
    mockRecordGameResult.mockReset().mockResolvedValue(true);
    mockSaveGame.mockReset().mockResolvedValue({});
    mockUpdateRecord.mockReset().mockResolvedValue(undefined);
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

  const connect = (id: string, userId?: string, username?: string) => {
    const socket = makeSocket(id, userId, username);
    handler.handleConnection(socket as any);
    return socket;
  };

  const gameEnded = () => roomEmits.filter((e) => e.event === 'gameEnded');
  const last = (socket: ReturnType<typeof makeSocket>, event: string) =>
    [...socket.emitted].reverse().find((e) => e.event === event)?.payload;

  /** Create a room as `creator`, join as `joiner`; returns sockets by colour. */
  const startGame = async (timeControl?: { initial: number; increment: number }) => {
    const creator = connect('socket-a', 'uid-a', 'Alice');
    const joiner = connect('socket-b', 'uid-b', 'Bob');
    await creator.handlers.get('createRoom')!({ timeControl, displayName: 'Alice' });
    const roomCode: string = last(creator, 'roomCreated').roomCode;
    await joiner.handlers.get('joinRoom')!({ roomCode, displayName: 'Bob' });
    const creatorIsWhite = last(creator, 'roomJoined').assignedColor === 'white';
    return {
      roomCode,
      room: handler.rooms.get(roomCode),
      white: creatorIsWhite ? creator : joiner,
      black: creatorIsWhite ? joiner : creator,
    };
  };

  describe('rooms', () => {
    it('refuses to create or join a room before authenticating', async () => {
      const socket = connect('socket-anon', undefined);

      await socket.handlers.get('createRoom')!({});
      await socket.handlers.get('joinRoom')!({ roomCode: 'ABC123' });

      expect(socket.emitted.filter((e) => e.event === 'error')).toHaveLength(2);
      expect(handler.rooms.size).toBe(0);
    });

    it('rejects a time control that would give unlimited or negative time', async () => {
      const socket = connect('socket-a', 'uid-a');

      await socket.handlers.get('createRoom')!({ timeControl: { initial: 300, increment: 1e9 } });
      await socket.handlers.get('createRoom')!({ timeControl: { initial: -5, increment: 0 } });
      await socket.handlers.get('createRoom')!({ timeControl: { initial: NaN, increment: 0 } });

      expect(handler.rooms.size).toBe(0);
      expect(parseTimeControl({ initial: 300, increment: 5 })).toEqual({ initial: 300, increment: 5 });
      expect(parseTimeControl(undefined)).toBeNull();
    });

    it('never shares a socket id or an email address with the other player', async () => {
      const { white, black } = await startGame();

      const serialised = JSON.stringify([...white.emitted, ...black.emitted, ...roomEmits]);
      expect(serialised).not.toContain('socket-a');
      expect(serialised).not.toContain('socket-b');
      expect(serialised).not.toContain('@');
      const started = roomEmits.find((e) => e.event === 'gameStarted')!.payload;
      expect(Object.keys(started.white).sort()).toEqual(['connected', 'displayName', 'id', 'username']);
      expect(Object.keys(started.black).sort()).toEqual(['connected', 'displayName', 'id', 'username']);
    });

    it('does not use the email address as the name shown to opponents', async () => {
      mockVerifyToken.mockResolvedValue({ uid: 'uid-a', email: 'alice@example.com', name: undefined });
      const socket = connect('socket-a', undefined);

      await socket.handlers.get('authenticate')!('token');

      expect(socket.data.userId).toBe('uid-a');
      expect(socket.data.username).toBe('Player');
    });
  });

  describe('seats', () => {
    it('keeps a seat for its owner when they drop mid-game, and gives it back', async () => {
      const { roomCode, room, white, black } = await startGame();
      await white.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });

      black.handlers.get('disconnect')!();
      expect(room.blackPlayer).not.toBeNull();
      expect(room.blackPlayer.socketId).toBe('');

      // Someone else opens the room link while Black is away.
      const intruder = connect('socket-x', 'uid-x', 'Mallory');
      await intruder.handlers.get('joinRoom')!({ roomCode });
      expect(last(intruder, 'roomJoined').assignedColor).toBe('spectator');
      await intruder.handlers.get('makeMove')!({ from: 'e7', to: 'e5' });
      expect(room.game.history()).toEqual(['e4']);

      // Black comes back on a new connection and carries on.
      const blackAgain = connect('socket-b2', black.data.userId as string, 'Bob');
      await blackAgain.handlers.get('joinRoom')!({ roomCode });
      expect(last(blackAgain, 'roomJoined').assignedColor).toBe('black');
      expect(last(blackAgain, 'roomJoined').gameState.history).toHaveLength(1);
      await blackAgain.handlers.get('makeMove')!({ from: 'e7', to: 'e5' });
      expect(room.game.history()).toEqual(['e4', 'e5']);
    });

    it('releases the seat when a player leaves before the game has started', async () => {
      const { roomCode, room, black } = await startGame();

      black.handlers.get('leaveRoom')!(roomCode);

      expect(room.blackPlayer).toBeNull();
      const replacement = connect('socket-c', 'uid-c');
      await replacement.handlers.get('joinRoom')!({ roomCode });
      expect(last(replacement, 'roomJoined').assignedColor).toBe('black');
    });

    it('drops a room once nobody is left to play it', async () => {
      const creator = connect('socket-a', 'uid-a');
      await creator.handlers.get('createRoom')!({});
      const { roomCode } = last(creator, 'roomCreated');

      creator.handlers.get('leaveRoom')!(roomCode);

      expect(handler.rooms.has(roomCode)).toBe(false);
    });

    it('does not let a player move before an opponent has joined', async () => {
      const creator = connect('socket-a', 'uid-a');
      await creator.handlers.get('createRoom')!({});
      const { roomCode } = last(creator, 'roomCreated');
      const room = handler.rooms.get(roomCode);
      if (!room.whitePlayer) {
        room.whitePlayer = room.blackPlayer;
        room.blackPlayer = null;
      }

      await creator.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });

      expect(room.game.history()).toHaveLength(0);
    });
  });

  describe('draws', () => {
    it('ignores an accepted draw that was never offered', async () => {
      const { black } = await startGame();

      await black.handlers.get('acceptDraw')!();

      expect(gameEnded()).toHaveLength(0);
    });

    it('does not let a player accept their own draw offer', async () => {
      const { white } = await startGame();

      white.handlers.get('offerDraw')!();
      await white.handlers.get('acceptDraw')!();

      expect(gameEnded()).toHaveLength(0);
    });

    it('does not let a spectator end the game as a draw', async () => {
      const { roomCode, white } = await startGame();
      const spectator = connect('socket-s', 'uid-s');
      await spectator.handlers.get('joinRoom')!({ roomCode });

      white.handlers.get('offerDraw')!();
      await spectator.handlers.get('acceptDraw')!();

      expect(gameEnded()).toHaveLength(0);
    });

    it('lets a draw offer lapse once a move is played', async () => {
      const { white, black } = await startGame();

      white.handlers.get('offerDraw')!();
      await white.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });
      await black.handlers.get('acceptDraw')!();

      expect(gameEnded()).toHaveLength(0);
    });

    it('ends the game when the opponent accepts a real offer', async () => {
      const { white, black } = await startGame();

      white.handlers.get('offerDraw')!();
      await black.handlers.get('acceptDraw')!();

      expect(gameEnded()).toHaveLength(1);
      expect(gameEnded()[0].payload).toMatchObject({ result: 'draw', resultText: 'Draw by agreement' });
    });
  });

  describe('a game ends exactly once', () => {
    it('ignores everything that arrives after the result', async () => {
      const { room, white, black } = await startGame();
      await white.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });
      await black.handlers.get('makeMove')!({ from: 'e7', to: 'e5' });

      await white.handlers.get('resign')!();
      await black.handlers.get('resign')!();
      white.handlers.get('offerDraw')!();
      await black.handlers.get('acceptDraw')!();
      await white.handlers.get('makeMove')!({ from: 'd2', to: 'd4' });

      expect(gameEnded()).toHaveLength(1);
      expect(gameEnded()[0].payload).toMatchObject({ result: 'black', reason: 'resignation' });
      expect(room.game.history()).toEqual(['e4', 'e5']);
    });

    it('flags a player on time once, however long the clock keeps ticking', async () => {
      const { white, black } = await startGame({ initial: 10, increment: 0 });
      await white.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });
      await black.handlers.get('makeMove')!({ from: 'e7', to: 'e5' });

      await jest.advanceTimersByTimeAsync(60_000);

      expect(gameEnded()).toHaveLength(1);
      expect(gameEnded()[0].payload).toMatchObject({ result: 'black', reason: 'timeout' });
      expect(mockRecordGameResult).toHaveBeenCalledTimes(2);
    });

    it('does not re-end a resigned game on time afterwards', async () => {
      const { white, black } = await startGame({ initial: 10, increment: 0 });
      await white.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });
      await black.handlers.get('makeMove')!({ from: 'e7', to: 'e5' });
      await white.handlers.get('resign')!();

      await jest.advanceTimersByTimeAsync(60_000);

      expect(gameEnded()).toHaveLength(1);
      expect(gameEnded()[0].payload.reason).toBe('resignation');
    });

    it('refuses a move that arrives after the flag has fallen', async () => {
      const { room, white, black } = await startGame({ initial: 10, increment: 5 });
      await white.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });
      room.lastMoveTime = Date.now() - 30_000; // Black has been thinking for 30s on a 10s clock

      await black.handlers.get('makeMove')!({ from: 'e7', to: 'e5' });

      expect(room.game.history()).toEqual(['e4']);
      expect(gameEnded()[0].payload).toMatchObject({ result: 'white', reason: 'timeout' });
    });
  });

  describe('results are recorded by the server', () => {
    it('scores both players, saves both histories and one head-to-head record', async () => {
      const { roomCode, room, white, black } = await startGame();
      await white.handlers.get('makeMove')!({ from: 'f2', to: 'f3' });
      await black.handlers.get('makeMove')!({ from: 'e7', to: 'e5' });
      await white.handlers.get('makeMove')!({ from: 'g2', to: 'g4' });
      await black.handlers.get('makeMove')!({ from: 'd8', to: 'h4' }); // fool's mate

      const whiteId = room.whitePlayer.id;
      const blackId = room.blackPlayer.id;
      expect(mockRecordGameResult.mock.calls).toEqual(
        expect.arrayContaining([[whiteId, 'loss'], [blackId, 'win']]),
      );
      expect(mockRecordGameResult).toHaveBeenCalledTimes(2);

      expect(mockSaveGame).toHaveBeenCalledTimes(2);
      const saved = mockSaveGame.mock.calls.map(([g]) => g);
      expect(saved.map((g) => g.gameOutcome).sort()).toEqual(['loss', 'win']);
      expect(saved[0].gameId).toBe(saved[1].gameId);
      expect(saved[0].gameId).toMatch(new RegExp(`^online-${roomCode}-`));
      expect(saved[0].gameResult).toBe('Black wins by checkmate');
      expect(new Chess(saved[0].finalFen).isCheckmate()).toBe(true);

      expect(mockUpdateRecord).toHaveBeenCalledTimes(1);
      expect(mockUpdateRecord).toHaveBeenCalledWith(whiteId, blackId, blackId, saved[0].gameId);
    });

    it('does not score a game nobody actually played', async () => {
      const { white } = await startGame();

      await white.handlers.get('resign')!();

      expect(gameEnded()).toHaveLength(1);
      expect(mockRecordGameResult).not.toHaveBeenCalled();
      expect(mockSaveGame).not.toHaveBeenCalled();
    });

    it('still announces the result when every write fails', async () => {
      mockRecordGameResult.mockRejectedValue(new Error('db down'));
      mockSaveGame.mockRejectedValue(new Error('db down'));
      mockUpdateRecord.mockRejectedValue(new Error('db down'));
      const { white, black } = await startGame();
      await white.handlers.get('makeMove')!({ from: 'e2', to: 'e4' });
      await black.handlers.get('makeMove')!({ from: 'e7', to: 'e5' });

      await expect(white.handlers.get('resign')!()).resolves.toBeUndefined();

      expect(gameEnded()).toHaveLength(1);
    });
  });

  it('describes results in plain words', () => {
    expect(describeResult('white', 'timeout')).toBe('White wins on time');
    expect(describeResult('draw', 'repetition')).toBe('Draw by threefold repetition');
  });
});
