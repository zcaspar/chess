import fs from 'fs';
import path from 'path';

const ROOM_STATE_FILE = path.join('/tmp', 'chess-rooms.json');

interface PersistedRoom {
  roomCode: string;
  whitePlayerId?: string;
  blackPlayerId?: string;
  whitePlayerUsername?: string;
  blackPlayerUsername?: string;
  fen: string;
  pgn: string;
  turn: 'w' | 'b';
  isGameOver: boolean;
  gameResult?: string;
  timeControl?: { initial: number; increment: number };
  whiteTime?: number;
  blackTime?: number;
  createdAt: string;
  lastActivity: string;
}

export class RoomPersistence {
  static saveRooms(rooms: Map<string, any>) {
    try {
      const persistedRooms: PersistedRoom[] = [];
      
      for (const [roomCode, room] of rooms) {
        // Only persist rooms that have been active in the last 2 hours
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        if (room.lastMoveTime && room.lastMoveTime > twoHoursAgo) {
          persistedRooms.push({
            roomCode: room.roomCode,
            whitePlayerId: room.whitePlayer?.id,
            blackPlayerId: room.blackPlayer?.id,
            whitePlayerUsername: room.whitePlayer?.username,
            blackPlayerUsername: room.blackPlayer?.username,
            fen: room.game.fen(),
            pgn: room.game.pgn(),
            turn: room.game.turn(),
            isGameOver: room.game.isGameOver(),
            gameResult: room.gameResult,
            timeControl: room.timeControl,
            whiteTime: room.whiteTime,
            blackTime: room.blackTime,
            createdAt: new Date(room.lastMoveTime - 60000).toISOString(), // Approximate
            lastActivity: new Date(room.lastMoveTime).toISOString(),
          });
        }
      }
      
      fs.writeFileSync(ROOM_STATE_FILE, JSON.stringify(persistedRooms, null, 2));
      console.log(`💾 Persisted ${persistedRooms.length} active rooms to disk`);
    } catch (error) {
      console.error('Failed to persist rooms:', error);
    }
  }
  
  static loadRooms(): PersistedRoom[] {
    try {
      if (fs.existsSync(ROOM_STATE_FILE)) {
        const data = fs.readFileSync(ROOM_STATE_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) {
          console.warn('Room persistence file has unexpected format, ignoring');
          return [];
        }
        const rooms = parsed as PersistedRoom[];
        console.log(`📂 Loaded ${rooms.length} persisted rooms from disk`);
        return rooms;
      }
    } catch (error) {
      console.error('Failed to load persisted rooms:', error);
    }
    return [];
  }
  
  static clearOldRooms() {
    try {
      const rooms = this.loadRooms();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const activeRooms = rooms.filter(room => 
        new Date(room.lastActivity) > oneHourAgo
      );
      
      if (activeRooms.length < rooms.length) {
        fs.writeFileSync(ROOM_STATE_FILE, JSON.stringify(activeRooms, null, 2));
        console.log(`🧹 Cleared ${rooms.length - activeRooms.length} old rooms`);
      }
    } catch (error) {
      console.error('Failed to clear old rooms:', error);
    }
  }
}