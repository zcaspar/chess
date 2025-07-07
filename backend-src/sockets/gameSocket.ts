import { Server, Socket } from 'socket.io';
import { Chess } from 'chess.js';
import { query } from '../config/database';
import { verifyToken } from '../middleware/auth';
import { RoomPersistence } from '../utils/roomPersistence';

interface GameRoom {
  id: string;
  roomCode: string;
  whitePlayer: { id: string; username: string; socketId: string } | null;
  blackPlayer: { id: string; username: string; socketId: string } | null;
  game: Chess;
  spectators: Set<string>;
  timeControl: { initial: number; increment: number } | null;
  whiteTime: number;
  blackTime: number;
  lastMoveTime: number;
  gameId?: number; // Database game ID
}

interface PlayerData {
  id: string;
  username: string;
  socketId: string;
}

export class GameSocketHandler {
  private io: Server;
  private rooms: Map<string, GameRoom> = new Map();
  private playerRooms: Map<string, string> = new Map(); // socketId -> roomCode

  constructor(io: Server) {
    this.io = io;
    
    // Restore rooms from persistence on startup
    this.restorePersistedRooms();
    
    // Save rooms periodically
    setInterval(() => {
      RoomPersistence.saveRooms(this.rooms);
    }, 30000); // Every 30 seconds
  }
  
  private restorePersistedRooms() {
    try {
      const persistedRooms = RoomPersistence.loadRooms();
      for (const roomData of persistedRooms) {
        // Don't restore finished games
        if (roomData.isGameOver) {
          continue;
        }
        
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
          lastMoveTime: new Date(roomData.lastActivity).getTime(),
        };
        
        // Restore PGN move history
        if (roomData.pgn) {
          try {
            room.game.loadPgn(roomData.pgn);
          } catch (e) {
            console.warn(`Failed to load PGN for room ${roomData.roomCode}, using FEN only`);
          }
        }
        
        this.rooms.set(roomData.roomCode, room);
        console.log(`🔄 Restored room ${roomData.roomCode} from persistence (turn: ${roomData.turn}, moves: ${room.game.history().length})`);
      }
      
      if (persistedRooms.length > 0) {
        console.log(`✅ Restored ${persistedRooms.length} active rooms from previous session`);
      }
    } catch (error) {
      console.error('Failed to restore persisted rooms:', error);
    }
  }

  handleConnection(socket: Socket) {
    console.log('New socket connection:', socket.id);

    // Authenticate socket connection
    socket.on('authenticate', async (token: string) => {
      try {
        console.log(`Authenticating socket ${socket.id} with token: ${token?.substring(0, 20)}...`);
        const user = await verifyToken(token);
        socket.data.userId = user.uid;
        socket.data.username = user.email || 'Anonymous';
        console.log(`Socket ${socket.id} authenticated successfully as ${user.email} (${user.uid})`);
        socket.emit('authenticated', { success: true });
      } catch (error) {
        console.error(`Socket ${socket.id} authentication failed:`, error);
        
        // Check if this is a Firebase Admin configuration issue
        const errorMessage = (error as Error)?.message || '';
        if (errorMessage.includes('auth/invalid-project-id') || 
            errorMessage.includes('no-app') ||
            errorMessage.includes('app/invalid-credential') ||
            errorMessage.includes('Firebase Admin SDK') ||
            errorMessage.includes('project')) {
          console.warn(`Firebase Admin not configured, using demo auth for socket ${socket.id}`);
          // Create a mock user for development/demo purposes
          socket.data.userId = 'demo-user-' + Date.now() + '-' + socket.id;
          socket.data.username = 'Demo User';
          console.log(`Socket ${socket.id} authenticated with demo credentials`);
          socket.emit('authenticated', { success: true });
          return;
        }
        
        socket.emit('authenticated', { success: false, error: 'Invalid token' });
        socket.disconnect();
      }
    });

    // Create a new game room
    socket.on('createRoom', async (data: { timeControl?: { initial: number; increment: number } }) => {
      try {
        const roomCode = this.generateRoomCode();
        console.log(`🎮 Creating new room ${roomCode} for socket ${socket.id} (${socket.data.username})`);
        
        const room: GameRoom = {
          id: roomCode,
          roomCode,
          whitePlayer: null,
          blackPlayer: null,
          game: new Chess(),
          spectators: new Set(),
          timeControl: data.timeControl || null,
          whiteTime: data.timeControl ? data.timeControl.initial : 0,
          blackTime: data.timeControl ? data.timeControl.initial : 0,
          lastMoveTime: Date.now(),
        };

        // Auto-join creator to the room with random color assignment
        const creatorData: PlayerData = {
          id: socket.data.userId,
          username: socket.data.username,
          socketId: socket.id,
        };
        
        // Randomly assign creator to white or black
        const assignedColor = Math.random() < 0.5 ? 'white' : 'black';
        
        if (assignedColor === 'white') {
          room.whitePlayer = creatorData;
        } else {
          room.blackPlayer = creatorData;
        }
        
        console.log(`Auto-assigned creator ${socket.id} to ${assignedColor.toUpperCase()} in room ${roomCode}`);

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
            [roomCode, JSON.stringify(data.timeControl)]
          );
          
          room.gameId = result.rows[0].id;
          
          // Update database with creator's assigned color
          const column = assignedColor === 'white' ? 'white_user_id' : 'black_user_id';
          await query(
            `UPDATE games SET ${column} = (SELECT id FROM users WHERE firebase_uid = $1) WHERE id = $2`,
            [socket.data.userId, room.gameId]
          );
        } catch (dbError) {
          console.warn('Database unavailable, continuing without persistence:', dbError);
          // Continue without database persistence
        }

        const shareLink = `${process.env.FRONTEND_URL}/game/${roomCode}`;
        console.log(`✅ Room ${roomCode} created successfully. Share link: ${shareLink}`);
        
        // Emit both roomCreated and roomJoined events
        socket.emit('roomCreated', { 
          roomCode, 
          shareLink
        });
        
        // Also emit roomJoined so the creator knows they're in the game
        socket.emit('roomJoined', {
          roomCode,
          assignedColor: assignedColor,
          gameState: {
            fen: room.game.fen(),
            pgn: room.game.pgn(),
            turn: room.game.turn(),
            isGameOver: room.game.isGameOver(),
          },
          players: {
            white: room.whitePlayer,
            black: room.blackPlayer,
          },
          timeControl: room.timeControl,
          whiteTime: room.whiteTime,
          blackTime: room.blackTime,
        });
      } catch (error) {
        console.error('Error creating room:', error);
        socket.emit('error', { message: 'Failed to create room' });
      }
    });

    // Join an existing room
    socket.on('joinRoom', async (roomCode: string) => {
      try {
        console.log(`🔗 Socket ${socket.id} (${socket.data.username}) attempting to join room ${roomCode}`);
        console.log(`Socket auth data: userId=${socket.data.userId}, username=${socket.data.username}`);
        console.log(`Current active rooms: [${Array.from(this.rooms.keys()).join(', ')}]`);
        const room = this.rooms.get(roomCode);
        
        if (!room) {
          // Try to load from database (if available)
          try {
            const gameResult = await query(
              'SELECT * FROM games WHERE room_code = $1 AND result = $2',
              [roomCode, 'ongoing']
            );

            if (gameResult.rows.length === 0) {
              socket.emit('error', { message: 'Room not found' });
              return;
            }

            // Recreate room from database
            const gameData = gameResult.rows[0];
            const newRoom: GameRoom = {
              id: roomCode,
              roomCode,
              whitePlayer: null,
              blackPlayer: null,
              game: new Chess(gameData.fen || undefined),
              spectators: new Set(),
              timeControl: gameData.time_control,
              whiteTime: gameData.time_control?.initial || 0,
              blackTime: gameData.time_control?.initial || 0,
              lastMoveTime: Date.now(),
              gameId: gameData.id,
            };

            this.rooms.set(roomCode, newRoom);
          } catch (dbError) {
            console.warn('Database unavailable, checking for persisted room:', dbError);
            
            // Don't auto-create rooms - force proper create/join flow
            socket.emit('error', { 
              message: 'Room not found. Please create a new room or check the room code.',
              code: 'ROOM_NOT_FOUND'
            });
            return;
          }
        }

        const roomToJoin = this.rooms.get(roomCode)!;
        socket.join(roomCode);
        this.playerRooms.set(socket.id, roomCode);

        // Assign player to a color if available
        const playerData: PlayerData = {
          id: socket.data.userId,
          username: socket.data.username,
          socketId: socket.id,
        };

        let assignedColor: 'white' | 'black' | 'spectator' = 'spectator';

        console.log(`Player joining room ${roomCode}:`);
        console.log(`Current white player: ${roomToJoin.whitePlayer?.socketId || 'none'} (userId: ${roomToJoin.whitePlayer?.id || 'none'})`);
        console.log(`Current black player: ${roomToJoin.blackPlayer?.socketId || 'none'} (userId: ${roomToJoin.blackPlayer?.id || 'none'})`);
        console.log(`New player socket: ${socket.id} (userId: ${socket.data.userId})`);

        // Check if this user was previously assigned to a color (handle reconnection)
        const wasWhitePlayer = roomToJoin.whitePlayer?.id === socket.data.userId;
        const wasBlackPlayer = roomToJoin.blackPlayer?.id === socket.data.userId;

        if (wasWhitePlayer && roomToJoin.whitePlayer) {
          // User is reconnecting as white player
          roomToJoin.whitePlayer.socketId = socket.id;
          assignedColor = 'white';
          console.log(`Reassigned ${socket.id} to WHITE (reconnection of user ${socket.data.userId})`);
        } else if (wasBlackPlayer && roomToJoin.blackPlayer) {
          // User is reconnecting as black player  
          roomToJoin.blackPlayer.socketId = socket.id;
          assignedColor = 'black';
          console.log(`Reassigned ${socket.id} to BLACK (reconnection of user ${socket.data.userId})`);
        } else if (!roomToJoin.whitePlayer) {
          // New assignment to white
          roomToJoin.whitePlayer = playerData;
          assignedColor = 'white';
          console.log(`Assigned ${socket.id} to WHITE (new user ${socket.data.userId})`);
        } else if (!roomToJoin.blackPlayer) {
          // New assignment to black
          roomToJoin.blackPlayer = playerData;
          assignedColor = 'black';
          console.log(`Assigned ${socket.id} to BLACK (new user ${socket.data.userId})`);
        } else {
          // Room is full, user becomes spectator
          roomToJoin.spectators.add(socket.id);
          console.log(`${socket.id} assigned as SPECTATOR (room full)`);
        }

        // Update database with player assignment (if available)
        if (assignedColor !== 'spectator' && roomToJoin.gameId) {
          try {
            const column = assignedColor === 'white' ? 'white_user_id' : 'black_user_id';
            await query(
              `UPDATE games SET ${column} = (SELECT id FROM users WHERE firebase_uid = $1) WHERE id = $2`,
              [socket.data.userId, roomToJoin.gameId]
            );
          } catch (dbError) {
            console.warn('Database unavailable for player assignment:', dbError);
            // Continue without database persistence
          }
        }

        // Send room state to the joining player
        socket.emit('roomJoined', {
          roomCode,
          assignedColor,
          gameState: {
            fen: roomToJoin.game.fen(),
            pgn: roomToJoin.game.pgn(),
            turn: roomToJoin.game.turn(),
            isGameOver: roomToJoin.game.isGameOver(),
            history: roomToJoin.game.history({ verbose: true }),
            moveNumber: roomToJoin.game.moveNumber(),
          },
          players: {
            white: roomToJoin.whitePlayer,
            black: roomToJoin.blackPlayer,
          },
          timeControl: roomToJoin.timeControl,
          whiteTime: roomToJoin.whiteTime,
          blackTime: roomToJoin.blackTime,
        });
        
        // If game is in progress, notify about restoration
        if (roomToJoin.game.history().length > 0) {
          socket.emit('gameRestored', {
            message: 'Game restored from previous session',
            moveCount: roomToJoin.game.history().length,
          });
        }

        // Notify other players in the room
        socket.to(roomCode).emit('playerJoined', {
          color: assignedColor,
          player: playerData,
        });

        // Start the game if both players are present
        if (roomToJoin.whitePlayer && roomToJoin.blackPlayer) {
          this.io.to(roomCode).emit('gameStarted', {
            white: roomToJoin.whitePlayer,
            black: roomToJoin.blackPlayer,
          });
        }
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Handle moves
    socket.on('makeMove', async (data: { from: string; to: string; promotion?: string }) => {
      try {
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

        // Verify it's the player's turn
        const isWhitePlayer = room.whitePlayer?.socketId === socket.id;
        const isBlackPlayer = room.blackPlayer?.socketId === socket.id;
        
        console.log(`Move attempt from socket ${socket.id}:`);
        console.log(`White player: ${room.whitePlayer?.socketId}, Black player: ${room.blackPlayer?.socketId}`);
        console.log(`Is white player: ${isWhitePlayer}, Is black player: ${isBlackPlayer}`);
        console.log(`Current turn: ${room.game.turn()}`);
        
        if (!isWhitePlayer && !isBlackPlayer) {
          console.log('Player not found in game');
          socket.emit('error', { message: 'You are not a player in this game' });
          return;
        }

        const playerColor = isWhitePlayer ? 'w' : 'b';
        console.log(`Player color: ${playerColor}, Game turn: ${room.game.turn()}`);
        
        if (room.game.turn() !== playerColor) {
          console.log('Not player\'s turn');
          socket.emit('error', { message: 'Not your turn' });
          return;
        }

        // Make the move
        const move = room.game.move({
          from: data.from,
          to: data.to,
          promotion: data.promotion,
        });

        if (!move) {
          socket.emit('error', { message: 'Invalid move' });
          return;
        }

        // Update time control
        if (room.timeControl) {
          const now = Date.now();
          const elapsed = (now - room.lastMoveTime) / 1000;
          
          if (playerColor === 'w') {
            room.whiteTime = Math.max(0, room.whiteTime - elapsed + room.timeControl.increment);
          } else {
            room.blackTime = Math.max(0, room.blackTime - elapsed + room.timeControl.increment);
          }
          
          room.lastMoveTime = now;

          // Check for time expiration
          if (room.whiteTime <= 0 || room.blackTime <= 0) {
            const winner = room.whiteTime <= 0 ? 'black' : 'white';
            await this.endGame(roomCode, winner, 'timeout');
            return;
          }
        }

        // Save move to database (if available)
        if (room.gameId) {
          try {
            await query(
              `INSERT INTO moves (game_id, move_number, player_color, move_notation, move_data, time_remaining)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                room.gameId,
                Math.ceil(room.game.moveNumber() / 2),
                playerColor,
                move.san,
                JSON.stringify(move),
                playerColor === 'w' ? room.whiteTime : room.blackTime,
              ]
            );

            // Update game state in database
            await query(
              'UPDATE games SET fen = $1, pgn = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
              [room.game.fen(), room.game.pgn(), room.gameId]
            );
          } catch (dbError) {
            console.warn('Database unavailable for move persistence:', dbError);
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
          let result: 'white' | 'black' | 'draw' = 'draw';
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
          }

          await this.endGame(roomCode, result, reason);
        }
      } catch (error) {
        console.error('Error making move:', error);
        socket.emit('error', { message: 'Failed to make move' });
      }
    });

    // Handle resignation
    socket.on('resign', async () => {
      try {
        const roomCode = this.playerRooms.get(socket.id);
        if (!roomCode) return;

        const room = this.rooms.get(roomCode);
        if (!room) return;

        const isWhitePlayer = room.whitePlayer?.socketId === socket.id;
        const isBlackPlayer = room.blackPlayer?.socketId === socket.id;

        if (isWhitePlayer || isBlackPlayer) {
          const winner = isWhitePlayer ? 'black' : 'white';
          await this.endGame(roomCode, winner, 'resignation');
        }
      } catch (error) {
        console.error('Error handling resignation:', error);
      }
    });

    // Handle draw offers
    socket.on('offerDraw', () => {
      const roomCode = this.playerRooms.get(socket.id);
      if (!roomCode) return;

      const room = this.rooms.get(roomCode);
      if (!room) return;

      const isWhitePlayer = room.whitePlayer?.socketId === socket.id;
      const isBlackPlayer = room.blackPlayer?.socketId === socket.id;

      if (isWhitePlayer || isBlackPlayer) {
        const opponent = isWhitePlayer ? room.blackPlayer : room.whitePlayer;
        if (opponent) {
          this.io.to(opponent.socketId).emit('drawOffered');
        }
      }
    });

    socket.on('acceptDraw', async () => {
      const roomCode = this.playerRooms.get(socket.id);
      if (!roomCode) return;

      await this.endGame(roomCode, 'draw', 'agreement');
    });

    // Handle leaving room
    socket.on('leaveRoom', (roomCode: string) => {
      console.log(`Socket ${socket.id} requesting to leave room ${roomCode}`);
      
      const currentRoomCode = this.playerRooms.get(socket.id);
      if (currentRoomCode === roomCode) {
        this.handlePlayerLeaveRoom(socket, roomCode);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
      
      const roomCode = this.playerRooms.get(socket.id);
      if (roomCode) {
        const room = this.rooms.get(roomCode);
        if (room) {
          let disconnectedColor: 'white' | 'black' | 'spectator' | null = null;
          
          // Check if disconnecting player was white or black
          if (room.whitePlayer?.socketId === socket.id) {
            console.log(`Removing white player ${socket.id} from room ${roomCode}`);
            room.whitePlayer = null;
            disconnectedColor = 'white';
          } else if (room.blackPlayer?.socketId === socket.id) {
            console.log(`Removing black player ${socket.id} from room ${roomCode}`);
            room.blackPlayer = null;
            disconnectedColor = 'black';
          } else if (room.spectators.has(socket.id)) {
            room.spectators.delete(socket.id);
            disconnectedColor = 'spectator';
          }

          // Notify other players about the disconnection
          socket.to(roomCode).emit('playerDisconnected', {
            socketId: socket.id,
            color: disconnectedColor,
          });

          console.log(`Player ${socket.id} (${disconnectedColor}) disconnected from room ${roomCode}`);
          console.log(`Room state after disconnect - White: ${room.whitePlayer?.socketId || 'none'}, Black: ${room.blackPlayer?.socketId || 'none'}`);
        }
        
        this.playerRooms.delete(socket.id);
      }
    });
  }
  
  private handlePlayerLeaveRoom(socket: Socket, roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    
    let leftColor: 'white' | 'black' | 'spectator' | null = null;
    
    // Remove player from their assigned slot
    if (room.whitePlayer?.socketId === socket.id) {
      console.log(`White player ${socket.id} leaving room ${roomCode}`);
      room.whitePlayer = null;
      leftColor = 'white';
    } else if (room.blackPlayer?.socketId === socket.id) {
      console.log(`Black player ${socket.id} leaving room ${roomCode}`);
      room.blackPlayer = null;
      leftColor = 'black';
    } else if (room.spectators.has(socket.id)) {
      room.spectators.delete(socket.id);
      leftColor = 'spectator';
    }
    
    // Leave the socket.io room
    socket.leave(roomCode);
    this.playerRooms.delete(socket.id);
    
    // Notify other players
    socket.to(roomCode).emit('playerLeft', {
      socketId: socket.id,
      color: leftColor,
    });
    
    // Save updated room state
    RoomPersistence.saveRooms(this.rooms);
    
    console.log(`Player ${socket.id} (${leftColor}) left room ${roomCode}`);
  }

  private generateRoomCode(): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
  }

  private async endGame(roomCode: string, result: 'white' | 'black' | 'draw', reason: string) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.gameId) return;

    // Update database
    await query(
      'UPDATE games SET result = $1, ended_at = CURRENT_TIMESTAMP, metadata = jsonb_set(metadata, \'{endReason}\', $2) WHERE id = $3',
      [result, JSON.stringify(reason), room.gameId]
    );

    // Update user statistics
    if (result !== 'draw' && room.whitePlayer && room.blackPlayer) {
      const winnerId = result === 'white' ? room.whitePlayer.id : room.blackPlayer.id;
      const loserId = result === 'white' ? room.blackPlayer.id : room.whitePlayer.id;

      // Update winner stats
      await query(
        `UPDATE users 
         SET stats = jsonb_set(
           jsonb_set(
             jsonb_set(stats, '{wins}', (COALESCE(stats->>'wins', '0')::int + 1)::text::jsonb),
             '{gamesPlayed}', (COALESCE(stats->>'gamesPlayed', '0')::int + 1)::text::jsonb
           ),
           '{winStreak}', (COALESCE(stats->>'winStreak', '0')::int + 1)::text::jsonb
         )
         WHERE firebase_uid = $1`,
        [winnerId]
      );

      // Update loser stats
      await query(
        `UPDATE users 
         SET stats = jsonb_set(
           jsonb_set(
             jsonb_set(stats, '{losses}', (COALESCE(stats->>'losses', '0')::int + 1)::text::jsonb),
             '{gamesPlayed}', (COALESCE(stats->>'gamesPlayed', '0')::int + 1)::text::jsonb
           ),
           '{winStreak}', '0'::jsonb
         )
         WHERE firebase_uid = $1`,
        [loserId]
      );
    } else if (result === 'draw' && room.whitePlayer && room.blackPlayer) {
      // Update both players for draw
      for (const playerId of [room.whitePlayer.id, room.blackPlayer.id]) {
        await query(
          `UPDATE users 
           SET stats = jsonb_set(
             jsonb_set(stats, '{draws}', (COALESCE(stats->>'draws', '0')::int + 1)::text::jsonb),
             '{gamesPlayed}', (COALESCE(stats->>'gamesPlayed', '0')::int + 1)::text::jsonb
           )
           WHERE firebase_uid = $1`,
          [playerId]
        );
      }
    }

    // Notify all players
    this.io.to(roomCode).emit('gameEnded', {
      result,
      reason,
      pgn: room.game.pgn(),
    });

    // Clean up room after a delay
    setTimeout(() => {
      this.rooms.delete(roomCode);
    }, 300000); // 5 minutes
  }
}