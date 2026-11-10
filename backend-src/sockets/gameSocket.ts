import { randomInt } from 'crypto';
import { Server, Socket } from 'socket.io';
import { Chess } from 'chess.js';
import { query } from '../config/database';
import { verifyToken } from '../middleware/auth';
import { isDemoAuthEnabled, isFirebaseConfigError } from '../utils/demoAuth';
import { RoomPersistence } from '../utils/roomPersistence';
import { GameHistoryModel } from '../models/GameHistory';
import { HeadToHeadModel } from '../models/HeadToHead';
import { UserModel } from '../models/User';
import { logger } from '../utils/logger';

/**
 * A seat belongs to a user id for the life of the game. `socketId` is the
 * connection currently driving it and is '' while that player is offline.
 * Seats used to be set to null on disconnect, which handed the game to the
 * next person who opened the room link.
 */
interface Seat {
  id: string;
  username: string;
  displayName?: string;
  socketId: string;
  /** Rating shown next to the player; null for someone who cannot play rated. */
  rating?: number | null;
  ratingProvisional?: boolean;
}

type GameResult = 'white' | 'black' | 'draw';

interface GameRoom {
  id: string;
  roomCode: string;
  whitePlayer: Seat | null;
  blackPlayer: Seat | null;
  game: Chess;
  spectators: Set<string>;
  timeControl: { initial: number; increment: number } | null;
  whiteTime: number;
  blackTime: number;
  lastMoveTime: number;
  createdAt: number;
  /** Colour with an open draw offer, cleared by a decline or the next move. */
  drawOfferBy: 'w' | 'b' | null;
  /** Set exactly once by endGame; nothing may change the game afterwards. */
  ended: boolean;
  gameResult?: string;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  gameId?: number; // Database game ID
}

const MIN_INITIAL_SECONDS = 10;
const MAX_INITIAL_SECONDS = 3 * 60 * 60;
const MAX_INCREMENT_SECONDS = 180;
const MAX_DISPLAY_NAME_LENGTH = 40;
/** How long a finished room stays around so both players can read the result. */
const ENDED_ROOM_TTL_MS = 5 * 60 * 1000;
/** Unfinished rooms with no activity for this long are dropped. */
const STALE_ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
/** Fewer plies than this and the game is not scored (nobody really played). */
const MIN_PLIES_TO_SCORE = 2;

const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Validate a client-supplied time control. `undefined` means "reject". */
export const parseTimeControl = (
  input: unknown
): { initial: number; increment: number } | null | undefined => {
  if (input === undefined || input === null) return null; // untimed game
  if (typeof input !== 'object') return undefined;
  const { initial, increment } = input as { initial?: unknown; increment?: unknown };
  if (typeof initial !== 'number' || !Number.isFinite(initial)) return undefined;
  if (initial < MIN_INITIAL_SECONDS || initial > MAX_INITIAL_SECONDS) return undefined;
  const inc = increment === undefined || increment === null ? 0 : increment;
  if (typeof inc !== 'number' || !Number.isFinite(inc)) return undefined;
  if (inc < 0 || inc > MAX_INCREMENT_SECONDS) return undefined;
  return { initial: Math.round(initial), increment: Math.round(inc) };
};

const cleanDisplayName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH) : undefined;
};

/** Human-readable result, also stored as game_history.game_result. */
export const describeResult = (result: GameResult, reason: string): string => {
  if (result === 'draw') {
    const how: Record<string, string> = {
      agreement: 'agreement',
      stalemate: 'stalemate',
      repetition: 'threefold repetition',
      insufficient: 'insufficient material',
      'fifty-move': 'the fifty-move rule',
    };
    return how[reason] ? `Draw by ${how[reason]}` : 'Draw';
  }
  const winner = result === 'white' ? 'White' : 'Black';
  const how: Record<string, string> = {
    checkmate: 'by checkmate',
    resignation: 'by resignation',
    timeout: 'on time',
  };
  return `${winner} wins ${how[reason] || `(${reason})`}`;
};

export class GameSocketHandler {
  private io: Server;
  private rooms: Map<string, GameRoom> = new Map();
  private playerRooms: Map<string, string> = new Map(); // socketId -> roomCode
  private saveInterval: ReturnType<typeof setInterval> | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(io: Server) {
    this.io = io;

    // Restore rooms from persistence on startup
    this.restorePersistedRooms();

    // Save rooms periodically
    this.saveInterval = setInterval(() => {
      RoomPersistence.saveRooms(this.rooms);
    }, 30000); // Every 30 seconds

    // Timer update broadcast - send timer updates every second
    this.timerInterval = setInterval(() => {
      this.broadcastTimerUpdates();
    }, 1000);

    // Rooms were only ever deleted after endGame, so every abandoned or
    // never-joined room stayed in memory until the next restart.
    this.sweepInterval = setInterval(() => {
      this.sweepStaleRooms();
    }, STALE_SWEEP_INTERVAL_MS);

    for (const interval of [this.saveInterval, this.timerInterval, this.sweepInterval]) {
      interval.unref?.();
    }
  }

  shutdown() {
    if (this.saveInterval) clearInterval(this.saveInterval);
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.sweepInterval) clearInterval(this.sweepInterval);
    for (const room of this.rooms.values()) {
      if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    }
    RoomPersistence.saveRooms(this.rooms);
  }

  private restorePersistedRooms() {
    try {
      const persistedRooms = RoomPersistence.loadRooms();
      for (const roomData of persistedRooms) {
        // Don't restore finished games
        if (roomData.isGameOver) {
          continue;
        }

        const lastActivity = new Date(roomData.lastActivity).getTime();
        const room: GameRoom = {
          id: roomData.roomCode,
          roomCode: roomData.roomCode,
          whitePlayer: roomData.whitePlayerId ? {
            id: roomData.whitePlayerId,
            username: roomData.whitePlayerUsername || 'Reconnecting...',
            socketId: ''
          } : null,
          blackPlayer: roomData.blackPlayerId ? {
            id: roomData.blackPlayerId,
            username: roomData.blackPlayerUsername || 'Reconnecting...',
            socketId: ''
          } : null,
          game: new Chess(roomData.fen),
          spectators: new Set(),
          timeControl: roomData.timeControl || null,
          whiteTime: roomData.whiteTime || 0,
          blackTime: roomData.blackTime || 0,
          lastMoveTime: lastActivity,
          createdAt: new Date(roomData.createdAt).getTime() || lastActivity,
          drawOfferBy: null,
          ended: false,
        };

        // Restore PGN move history
        if (roomData.pgn) {
          try {
            room.game.loadPgn(roomData.pgn);
          } catch (e) {
            logger.warn(`Failed to load PGN for room ${roomData.roomCode}, using FEN only`);
          }
        }

        this.rooms.set(roomData.roomCode, room);
        logger.debug(`🔄 Restored room ${roomData.roomCode} from persistence (turn: ${roomData.turn}, moves: ${room.game.history().length})`);
      }

      if (persistedRooms.length > 0) {
        logger.debug(`✅ Restored ${persistedRooms.length} active rooms from previous session`);
      }
    } catch (error) {
      logger.error('Failed to restore persisted rooms:', error);
    }
  }

  /**
   * What other people in the room may know about a player. The seat's
   * `username` used to be the account's email address and the whole object,
   * socket id included, was broadcast to anyone holding the room code.
   */
  private publicPlayer(seat: Seat | null) {
    if (!seat) return null;
    return {
      id: seat.id,
      username: seat.username,
      displayName: seat.displayName,
      connected: seat.socketId !== '',
      rating: seat.rating ?? null,
      ratingProvisional: seat.ratingProvisional ?? false,
    };
  }

  /** Fill in a seat's rating from the player's profile. Never fails a join. */
  private async loadSeatRating(seat: Seat): Promise<void> {
    try {
      const rating = await UserModel.getRatingSummary(seat.id);
      seat.rating = rating ? rating.value : null;
      seat.ratingProvisional = rating ? rating.provisional : false;
    } catch (error) {
      logger.warn('Could not load a rating for a joining player:', error);
      seat.rating = null;
    }
  }

  /** A game is rated when both players have a rating to play for. */
  private isRated(room: GameRoom): boolean {
    return (
      typeof room.whitePlayer?.rating === 'number' && typeof room.blackPlayer?.rating === 'number'
    );
  }

  /** The colour this connection is playing in the room, if any. */
  private seatColor(room: GameRoom, socket: Socket): 'w' | 'b' | null {
    if (room.whitePlayer && room.whitePlayer.socketId === socket.id) return 'w';
    if (room.blackPlayer && room.blackPlayer.socketId === socket.id) return 'b';
    return null;
  }

  private roomSnapshot(room: GameRoom) {
    return {
      gameState: {
        fen: room.game.fen(),
        pgn: room.game.pgn(),
        turn: room.game.turn(),
        isGameOver: room.ended || room.game.isGameOver(),
        history: room.game.history({ verbose: true }),
        moveNumber: room.game.moveNumber(),
      },
      players: {
        white: this.publicPlayer(room.whitePlayer),
        black: this.publicPlayer(room.blackPlayer),
      },
      timeControl: room.timeControl,
      ...this.currentClocks(room),
      drawOfferBy: room.drawOfferBy,
      gameResult: room.gameResult,
      rated: this.isRated(room),
    };
  }

  /** Clock values as of now, without mutating the authoritative ones. */
  private currentClocks(room: GameRoom): { whiteTime: number; blackTime: number } {
    let { whiteTime, blackTime } = room;
    if (this.isClockRunning(room)) {
      const elapsed = (Date.now() - room.lastMoveTime) / 1000;
      if (room.game.turn() === 'w') {
        whiteTime = Math.max(0, whiteTime - elapsed);
      } else {
        blackTime = Math.max(0, blackTime - elapsed);
      }
    }
    return { whiteTime, blackTime };
  }

  private isClockRunning(room: GameRoom): boolean {
    return !!(
      room.timeControl &&
      !room.ended &&
      !room.game.isGameOver() &&
      room.whitePlayer &&
      room.blackPlayer &&
      room.game.history().length > 0
    );
  }

  handleConnection(socket: Socket) {
    logger.debug('New socket connection:', socket.id);

    // Authenticate socket connection
    socket.on('authenticate', async (token: string) => {
      try {
        const user = await verifyToken(token);
        socket.data.userId = user.uid;
        // Never the email address: this name is shown to opponents.
        socket.data.username = cleanDisplayName(user.name) || 'Player';
        logger.debug(`Socket ${socket.id} authenticated as ${user.uid}`);
        socket.emit('authenticated', { success: true });
      } catch (error) {
        logger.error(`Socket ${socket.id} authentication failed:`, error);

        // Check if this is a Firebase Admin configuration issue. The demo
        // fallback is an explicit opt-in (ALLOW_DEMO_AUTH) rather than a
        // side effect of NODE_ENV being unset — see middleware/auth.ts.
        const errorMessage = (error as Error)?.message || '';
        if (isDemoAuthEnabled() && isFirebaseConfigError(errorMessage)) {
          logger.warn(`Firebase Admin not configured, using demo auth for socket ${socket.id}`);
          // Create a mock user for development/demo purposes
          socket.data.userId = 'demo-user-' + Date.now() + '-' + socket.id;
          socket.data.username = 'Demo User';
          logger.debug(`Socket ${socket.id} authenticated with demo credentials`);
          socket.emit('authenticated', { success: true });
          return;
        }

        socket.emit('authenticated', { success: false, error: 'Invalid token' });
        socket.disconnect();
      }
    });

    // Create a new game room
    socket.on('createRoom', async (data: { timeControl?: { initial: number; increment: number }; displayName?: string }) => {
      try {
        if (!socket.data.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const timeControl = parseTimeControl(data?.timeControl);
        if (timeControl === undefined) {
          socket.emit('error', { message: 'Invalid time control' });
          return;
        }

        const roomCode = this.generateRoomCode();
        logger.debug(`🎮 Creating new room ${roomCode} for socket ${socket.id}`);

        const now = Date.now();
        const room: GameRoom = {
          id: roomCode,
          roomCode,
          whitePlayer: null,
          blackPlayer: null,
          game: new Chess(),
          spectators: new Set(),
          timeControl,
          whiteTime: timeControl ? timeControl.initial : 0,
          blackTime: timeControl ? timeControl.initial : 0,
          lastMoveTime: now,
          createdAt: now,
          drawOfferBy: null,
          ended: false,
        };

        // Auto-join creator to the room with random color assignment
        const creatorData: Seat = {
          id: socket.data.userId,
          username: socket.data.username,
          displayName: cleanDisplayName(data?.displayName) || socket.data.username,
          socketId: socket.id,
        };

        await this.loadSeatRating(creatorData);

        // Randomly assign creator to white or black
        const assignedColor = randomInt(2) === 0 ? 'white' : 'black';

        if (assignedColor === 'white') {
          room.whitePlayer = creatorData;
        } else {
          room.blackPlayer = creatorData;
        }

        this.rooms.set(roomCode, room);
        socket.join(roomCode);
        this.playerRooms.set(socket.id, roomCode);

        // Save room state immediately after creation
        RoomPersistence.saveRooms(this.rooms);

        // Create game in database (if available)
        try {
          const result = await query(
            `INSERT INTO games (room_code, time_control, game_mode)
             VALUES ($1, $2, 'human-vs-human')
             RETURNING id`,
            [roomCode, JSON.stringify(timeControl)]
          );

          room.gameId = result.rows[0].id;

          // Update database with creator's assigned color
          const column = assignedColor === 'white' ? 'white_user_id' : 'black_user_id';
          await query(
            `UPDATE games SET ${column} = (SELECT id FROM users WHERE firebase_uid = $1) WHERE id = $2`,
            [socket.data.userId, room.gameId]
          );
        } catch (dbError) {
          logger.warn('Database unavailable, continuing without persistence:', dbError);
          // Continue without database persistence
        }

        const shareLink = `${process.env.FRONTEND_URL}/game/${roomCode}`;
        logger.debug(`✅ Room ${roomCode} created successfully. Share link: ${shareLink}`);

        // Emit both roomCreated and roomJoined events
        socket.emit('roomCreated', {
          roomCode,
          shareLink
        });

        // Also emit roomJoined so the creator knows they're in the game
        socket.emit('roomJoined', {
          roomCode,
          assignedColor,
          ...this.roomSnapshot(room),
        });
      } catch (error) {
        logger.error('Error creating room:', error);
        socket.emit('error', { message: 'Failed to create room' });
      }
    });

    // Join an existing room (also how a player returns after a dropped connection)
    socket.on('joinRoom', async (data: string | { roomCode: string; displayName?: string }) => {
      try {
        if (!socket.data.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Support both old format (string) and new format (object)
        const rawCode = typeof data === 'string' ? data : data?.roomCode;
        const displayName = typeof data === 'object' && data ? cleanDisplayName(data.displayName) : undefined;
        if (typeof rawCode !== 'string' || !/^[A-Za-z0-9]{6}$/.test(rawCode.trim())) {
          socket.emit('error', {
            message: 'Room not found. Please create a new room or check the room code.',
            code: 'ROOM_NOT_FOUND'
          });
          return;
        }
        const roomCode = rawCode.trim().toUpperCase();
        logger.debug(`🔗 Socket ${socket.id} attempting to join room ${roomCode}`);

        const roomToJoin = this.rooms.get(roomCode);
        if (!roomToJoin) {
          socket.emit('error', {
            message: 'Room not found. Please create a new room or check the room code.',
            code: 'ROOM_NOT_FOUND'
          });
          return;
        }

        const userId: string = socket.data.userId;
        const playerData: Seat = {
          id: userId,
          username: socket.data.username,
          displayName: displayName || socket.data.username,
          socketId: socket.id,
        };

        let assignedColor: 'white' | 'black' | 'spectator' = 'spectator';
        let isReturningPlayer = false;

        // A seat is keyed by user id: its owner gets it back on any new
        // connection, and nobody else can take it while the game is live.
        if (roomToJoin.whitePlayer?.id === userId) {
          roomToJoin.whitePlayer.socketId = socket.id;
          if (displayName) roomToJoin.whitePlayer.displayName = displayName;
          assignedColor = 'white';
          isReturningPlayer = true;
        } else if (roomToJoin.blackPlayer?.id === userId) {
          roomToJoin.blackPlayer.socketId = socket.id;
          if (displayName) roomToJoin.blackPlayer.displayName = displayName;
          assignedColor = 'black';
          isReturningPlayer = true;
        } else if (roomToJoin.ended) {
          socket.emit('error', { message: 'This game has already finished' });
          return;
        } else if (!roomToJoin.whitePlayer) {
          roomToJoin.whitePlayer = playerData;
          assignedColor = 'white';
          await this.loadSeatRating(playerData);
        } else if (!roomToJoin.blackPlayer) {
          roomToJoin.blackPlayer = playerData;
          assignedColor = 'black';
          await this.loadSeatRating(playerData);
        } else {
          // Room is full, user becomes spectator
          roomToJoin.spectators.add(socket.id);
        }
        // A room restored after a restart has seats without ratings; fill them
        // in when their owners come back.
        for (const seat of [roomToJoin.whitePlayer, roomToJoin.blackPlayer]) {
          if (seat && seat.rating === undefined && seat.id === userId) {
            await this.loadSeatRating(seat);
          }
        }

        logger.debug(`Socket ${socket.id} joined room ${roomCode} as ${assignedColor}${isReturningPlayer ? ' (returning)' : ''}`);

        socket.join(roomCode);
        this.playerRooms.set(socket.id, roomCode);

        // Update database with player assignment (if available)
        if (assignedColor !== 'spectator' && !isReturningPlayer && roomToJoin.gameId) {
          try {
            const column = assignedColor === 'white' ? 'white_user_id' : 'black_user_id';
            await query(
              `UPDATE games SET ${column} = (SELECT id FROM users WHERE firebase_uid = $1) WHERE id = $2`,
              [userId, roomToJoin.gameId]
            );
          } catch (dbError) {
            logger.warn('Database unavailable for player assignment:', dbError);
            // Continue without database persistence
          }
        }

        // Send room state to the joining player
        socket.emit('roomJoined', {
          roomCode,
          assignedColor,
          ...this.roomSnapshot(roomToJoin),
        });

        // If game is in progress, notify about restoration
        if (roomToJoin.game.history().length > 0) {
          socket.emit('gameRestored', {
            message: 'Game restored from previous session',
            moveCount: roomToJoin.game.history().length,
          });
        }

        // Notify other players in the room
        if (assignedColor !== 'spectator') {
          socket.to(roomCode).emit('playerJoined', {
            color: assignedColor,
            player: this.publicPlayer(assignedColor === 'white' ? roomToJoin.whitePlayer : roomToJoin.blackPlayer),
          });
        }

        // Start the game if both players are present
        if (roomToJoin.whitePlayer && roomToJoin.blackPlayer && !roomToJoin.ended) {
          this.io.to(roomCode).emit('gameStarted', {
            white: this.publicPlayer(roomToJoin.whitePlayer),
            black: this.publicPlayer(roomToJoin.blackPlayer),
            rated: this.isRated(roomToJoin),
          });
        }

        RoomPersistence.saveRooms(this.rooms);
      } catch (error) {
        logger.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Handle moves
    socket.on('makeMove', async (data: { from: string; to: string; promotion?: string }) => {
      try {
        if (!socket.data.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const roomCode = this.playerRooms.get(socket.id);
        if (!roomCode) {
          socket.emit('error', { message: 'Not in a room' });
          return;
        }

        const room = this.rooms.get(roomCode);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (room.ended) {
          socket.emit('error', { message: 'Game is already over' });
          return;
        }

        const playerColor = this.seatColor(room, socket);
        if (!playerColor) {
          socket.emit('error', { message: 'You are not a player in this game' });
          return;
        }

        if (!room.whitePlayer || !room.blackPlayer) {
          socket.emit('error', { message: 'Waiting for an opponent to join' });
          return;
        }

        if (room.game.turn() !== playerColor) {
          socket.emit('error', { message: 'Not your turn' });
          return;
        }

        if (
          !data ||
          typeof data.from !== 'string' ||
          typeof data.to !== 'string' ||
          (data.promotion !== undefined && data.promotion !== null && !/^[qrbn]$/.test(String(data.promotion)))
        ) {
          socket.emit('error', { message: 'Invalid move' });
          return;
        }

        // The flag falls before the move does: a move arriving after the
        // clock ran out must not be played (and must not collect increment).
        if (room.timeControl && room.game.history().length > 0) {
          const elapsed = (Date.now() - room.lastMoveTime) / 1000;
          const remaining = playerColor === 'w' ? room.whiteTime : room.blackTime;
          if (remaining - elapsed <= 0) {
            if (playerColor === 'w') room.whiteTime = 0;
            else room.blackTime = 0;
            await this.endGame(roomCode, playerColor === 'w' ? 'black' : 'white', 'timeout');
            return;
          }
        }

        // Make the move. chess.js throws on an illegal move.
        let move;
        try {
          move = room.game.move({
            from: data.from,
            to: data.to,
            promotion: data.promotion || undefined,
          });
        } catch {
          move = null;
        }

        if (!move) {
          socket.emit('error', { message: 'Invalid move' });
          return;
        }

        // Update time control
        const now = Date.now();
        if (room.timeControl) {
          const isFirstMove = room.game.history().length === 1; // First move just happened

          // The clock starts once the first move has been played.
          const elapsed = isFirstMove ? 0 : (now - room.lastMoveTime) / 1000;
          if (playerColor === 'w') {
            room.whiteTime = Math.max(0, room.whiteTime - elapsed) + room.timeControl.increment;
          } else {
            room.blackTime = Math.max(0, room.blackTime - elapsed) + room.timeControl.increment;
          }
        }
        room.lastMoveTime = now;

        // A draw offer lapses once a move is played.
        if (room.drawOfferBy) {
          room.drawOfferBy = null;
          this.io.to(roomCode).emit('drawDeclined');
        }

        // Save move to database (if available)
        if (room.gameId) {
          try {
            await query(
              `INSERT INTO moves (game_id, move_number, player_color, move_notation, move_data, time_remaining)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                room.gameId,
                Math.ceil(room.game.history().length / 2),
                playerColor,
                move.san,
                JSON.stringify(move),
                Math.round(playerColor === 'w' ? room.whiteTime : room.blackTime),
              ]
            );

            // Update game state in database
            await query(
              'UPDATE games SET fen = $1, pgn = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
              [room.game.fen(), room.game.pgn(), room.gameId]
            );
          } catch (dbError) {
            logger.warn('Database unavailable for move persistence:', dbError);
            // Continue without database persistence
          }
        }

        // Broadcast move to all players in the room
        this.io.to(roomCode).emit('moveMade', {
          move: {
            from: move.from,
            to: move.to,
            promotion: move.promotion,
            san: move.san,
          },
          fen: room.game.fen(),
          pgn: room.game.pgn(),
          turn: room.game.turn(),
          whiteTime: room.whiteTime,
          blackTime: room.blackTime,
        });

        // Save room state after move
        RoomPersistence.saveRooms(this.rooms);

        // Check for game over
        if (room.game.isGameOver()) {
          let result: GameResult = 'draw';
          let reason = 'draw';

          if (room.game.isCheckmate()) {
            result = room.game.turn() === 'w' ? 'black' : 'white';
            reason = 'checkmate';
          } else if (room.game.isStalemate()) {
            reason = 'stalemate';
          } else if (room.game.isThreefoldRepetition()) {
            reason = 'repetition';
          } else if (room.game.isInsufficientMaterial()) {
            reason = 'insufficient';
          } else if (room.game.isDraw()) {
            reason = 'fifty-move';
          }

          await this.endGame(roomCode, result, reason);
        }
      } catch (error) {
        logger.error('Error making move:', error);
        socket.emit('error', { message: 'Failed to make move' });
      }
    });

    // Handle resignation
    socket.on('resign', async () => {
      try {
        const room = this.liveRoomFor(socket);
        if (!room) return;

        const color = this.seatColor(room, socket);
        if (!color) return;

        await this.endGame(room.roomCode, color === 'w' ? 'black' : 'white', 'resignation');
      } catch (error) {
        logger.error('Error handling resignation:', error);
      }
    });

    // Handle draw offers
    socket.on('offerDraw', () => {
      const room = this.liveRoomFor(socket);
      if (!room) return;

      const color = this.seatColor(room, socket);
      if (!color) return;

      const opponent = color === 'w' ? room.blackPlayer : room.whitePlayer;
      if (!opponent) return; // nobody to offer it to yet

      room.drawOfferBy = color;

      // Notify the offeror that their draw offer was sent (so their UI updates)
      socket.emit('drawOfferSent', { by: color });

      if (opponent.socketId) {
        // Notify the opponent that a draw was offered
        this.io.to(opponent.socketId).emit('drawOffered', { by: color });
      }
    });

    socket.on('acceptDraw', async () => {
      try {
        const room = this.liveRoomFor(socket);
        if (!room) return;

        // Only the player the offer was made TO can accept it. This handler
        // used to end the game for any socket in the room — spectators
        // included — whether or not a draw had ever been offered.
        const color = this.seatColor(room, socket);
        if (!color || !room.drawOfferBy || room.drawOfferBy === color) {
          socket.emit('error', { message: 'There is no draw offer to accept' });
          return;
        }

        await this.endGame(room.roomCode, 'draw', 'agreement');
      } catch (error) {
        logger.error('Error accepting draw:', error);
      }
    });

    socket.on('declineDraw', () => {
      const room = this.liveRoomFor(socket);
      if (!room) return;

      const color = this.seatColor(room, socket);
      if (!color || !room.drawOfferBy || room.drawOfferBy === color) return;

      room.drawOfferBy = null;
      // Both players clear their draw state.
      this.io.to(room.roomCode).emit('drawDeclined');
    });

    // Handle leaving room
    socket.on('leaveRoom', (roomCode: string) => {
      logger.debug(`Socket ${socket.id} requesting to leave room ${roomCode}`);

      const currentRoomCode = this.playerRooms.get(socket.id);
      if (currentRoomCode && currentRoomCode === roomCode) {
        socket.leave(roomCode);
        this.detachSocket(socket, 'playerLeft');
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.debug('Socket disconnected:', socket.id);
      this.detachSocket(socket, 'playerDisconnected');
    });
  }

  /** The unfinished room this authenticated connection is in, if any. */
  private liveRoomFor(socket: Socket): GameRoom | null {
    if (!socket.data.userId) return null;
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return null;
    const room = this.rooms.get(roomCode);
    if (!room || room.ended) return null;
    return room;
  }

  /**
   * A connection stops driving its seat (dropped connection or an explicit
   * leave). Once a move has been played the seat stays reserved for that user
   * and their clock keeps running, so they can come back and nobody can take
   * the game over. Before the first move the seat is simply released.
   */
  private detachSocket(socket: Socket, event: 'playerLeft' | 'playerDisconnected') {
    const roomCode = this.playerRooms.get(socket.id);
    if (!roomCode) return;
    this.playerRooms.delete(socket.id);

    const room = this.rooms.get(roomCode);
    if (!room) return;

    let color: 'white' | 'black' | 'spectator' | null = null;
    const gameUnderway = room.game.history().length > 0 && !room.ended;
    // An explicit leave before the game starts gives the seat up; a dropped
    // connection never does (the creator may just be reloading the page).
    const releaseSeat = event === 'playerLeft' && !gameUnderway && !room.ended;

    if (room.whitePlayer && room.whitePlayer.socketId === socket.id) {
      color = 'white';
      if (releaseSeat) room.whitePlayer = null;
      else room.whitePlayer.socketId = '';
    } else if (room.blackPlayer && room.blackPlayer.socketId === socket.id) {
      color = 'black';
      if (releaseSeat) room.blackPlayer = null;
      else room.blackPlayer.socketId = '';
    } else if (room.spectators.delete(socket.id)) {
      color = 'spectator';
    }

    if (!color) return;

    socket.to(roomCode).emit(event, { color, seatReleased: releaseSeat && color !== 'spectator' });

    // Nobody left who could ever play this room.
    if (!room.whitePlayer && !room.blackPlayer && !room.ended) {
      this.deleteRoom(roomCode);
    }

    RoomPersistence.saveRooms(this.rooms);
    logger.debug(`Socket ${socket.id} (${color}) ${event} in room ${roomCode}`);
  }

  private deleteRoom(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (room?.cleanupTimer) clearTimeout(room.cleanupTimer);
    this.rooms.delete(roomCode);
    for (const [socketId, code] of this.playerRooms.entries()) {
      if (code === roomCode) this.playerRooms.delete(socketId);
    }
  }

  private sweepStaleRooms() {
    const cutoff = Date.now() - STALE_ROOM_TTL_MS;
    for (const [roomCode, room] of this.rooms.entries()) {
      // Timed games in progress end themselves on the clock; this is for
      // rooms nobody joined and untimed games that were walked away from.
      if (!room.ended && !this.isClockRunning(room) && room.lastMoveTime < cutoff) {
        logger.debug(`🧹 Dropping stale room ${roomCode}`);
        this.deleteRoom(roomCode);
      }
    }
  }

  private broadcastTimerUpdates() {
    for (const [roomCode, room] of this.rooms.entries()) {
      // Only update timer for live games with time control AND after the first move
      if (!this.isClockRunning(room)) continue;

      // Display times are computed WITHOUT mutating room state.
      // room.whiteTime/blackTime are only updated authoritatively in makeMove.
      const { whiteTime, blackTime } = this.currentClocks(room);

      // Check for timeout
      if (whiteTime <= 0 || blackTime <= 0) {
        const winner = whiteTime <= 0 ? 'black' : 'white';
        if (whiteTime <= 0) room.whiteTime = 0;
        else room.blackTime = 0;
        // Not awaited (this runs inside a 1s interval for every room), so make
        // sure a failure surfaces in the logs instead of becoming an
        // unhandled rejection.
        void this.endGame(roomCode, winner, 'timeout').catch((error) => {
          logger.error(`Failed to end timed-out game in room ${roomCode}:`, error);
        });
        continue;
      }

      // Broadcast timer update to all players in the room
      this.io.to(roomCode).emit('timerUpdate', {
        whiteTime,
        blackTime,
        turn: room.game.turn(),
      });
    }
  }

  private generateRoomCode(): string {
    // CSPRNG, and never hand out a code that is already in use: a collision
    // used to silently replace the existing room.
    for (;;) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length));
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  private async endGame(roomCode: string, result: GameResult, reason: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    // A game ends exactly once. Without this latch a timed-out room was
    // re-ended by the 1s clock tick for the whole five-minute grace period
    // (hundreds of `gameEnded` emits and stats writes), and a resigned or
    // drawn game was later "ended" again on time with a different result.
    if (room.ended) return;
    room.ended = true;
    room.drawOfferBy = null;

    const resultText = describeResult(result, reason);
    room.gameResult = resultText;

    // Announce the result BEFORE touching the database. room.gameId is undefined
    // whenever the createRoom insert failed, and the writes below can fail at any
    // time — in both cases the players still need to be told the game is over,
    // otherwise both clients sit on a board that is actually finished.
    this.io.to(roomCode).emit('gameEnded', {
      result,
      reason,
      resultText,
      pgn: room.game.pgn(),
      whiteTime: room.whiteTime,
      blackTime: room.blackTime,
    });

    // Clean up the room once the players have had time to read the result.
    room.cleanupTimer = setTimeout(() => {
      this.deleteRoom(roomCode);
    }, ENDED_ROOM_TTL_MS);
    room.cleanupTimer.unref?.();

    RoomPersistence.saveRooms(this.rooms);

    await this.persistResult(room, result, reason, resultText);
  }

  /**
   * Record a finished game. Every step is independent: a failure costs that
   * piece of history, never the game or the other records.
   */
  private async persistResult(room: GameRoom, result: GameResult, reason: string, resultText: string) {
    const { roomCode } = room;

    if (room.gameId) {
      try {
        await query(
          'UPDATE games SET result = $1, ended_at = CURRENT_TIMESTAMP, metadata = jsonb_set(COALESCE(metadata, \'{}\'::jsonb), \'{endReason}\', $2) WHERE id = $3',
          [result, JSON.stringify(reason), room.gameId]
        );
      } catch (error) {
        logger.error(`Error updating games row for room ${roomCode}:`, error);
      }
    }

    const white = room.whitePlayer;
    const black = room.blackPlayer;
    const plies = room.game.history().length;
    if (!white || !black || white.id === black.id || plies < MIN_PLIES_TO_SCORE) {
      logger.debug(`Room ${roomCode} ended unscored (${plies} plies)`);
      return;
    }

    // The server is the only writer of online results: statistics, each
    // player's history row and the head-to-head record all come from the game
    // it validated, not from anything a client reports afterwards.
    const historyGameId = `online-${roomCode}-${room.createdAt}`;
    const finalFen = room.game.fen();
    const pgn = room.game.pgn();
    const gameDuration = Math.max(0, Math.round((Date.now() - room.createdAt) / 1000));

    const sides = [
      { me: white, opponent: black, color: 'w' as const, won: result === 'white' },
      { me: black, opponent: white, color: 'b' as const, won: result === 'black' },
    ];

    for (const { me, opponent, color, won } of sides) {
      const outcome = result === 'draw' ? 'draw' : won ? 'win' : 'loss';

      try {
        await UserModel.recordGameResult(me.id, outcome);
      } catch (error) {
        logger.error(`Error updating stats for a player in room ${roomCode}:`, error);
      }

      try {
        await GameHistoryModel.saveGame({
          playerId: me.id,
          gameId: historyGameId,
          opponentId: opponent.id,
          opponentName: opponent.displayName || opponent.username,
          playerColor: color,
          gameResult: resultText,
          gameOutcome: outcome,
          finalFen,
          pgn,
          moveCount: plies,
          gameDuration,
          timeControl: room.timeControl || undefined,
          gameMode: 'human-vs-human',
        });
      } catch (error) {
        logger.error(`Error saving history for a player in room ${roomCode}:`, error);
      }
    }

    try {
      const winnerId = result === 'draw' ? null : result === 'white' ? white.id : black.id;
      await HeadToHeadModel.updateRecord(white.id, black.id, winnerId, historyGameId);
    } catch (error) {
      logger.error(`Error updating head-to-head for room ${roomCode}:`, error);
    }

    // Ratings last, and only from here: a rating changes when the server has
    // refereed a game to its end, never because a client says so.
    try {
      const rated = await UserModel.applyRatedGame({
        whiteUid: white.id,
        blackUid: black.id,
        result,
        gameId: historyGameId,
      });
      if (rated) {
        white.rating = rated.white.after;
        white.ratingProvisional = rated.white.provisional;
        black.rating = rated.black.after;
        black.ratingProvisional = rated.black.provisional;
        this.io.to(roomCode).emit('ratingsUpdated', rated);
      }
    } catch (error) {
      logger.error(`Error updating ratings for room ${roomCode}:`, error);
    }
  }
}
