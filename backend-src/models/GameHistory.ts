import { pool, query } from '../config/database';

export interface GameHistoryEntry {
  id: number;
  playerId: string; // Firebase UID
  gameId: string; // Game session ID
  opponentId?: string; // Firebase UID of opponent (NULL for AI games)
  opponentName: string; // Display name or "Computer"
  playerColor: 'w' | 'b'; // Player's color
  gameResult: string; // Result description
  gameOutcome: 'win' | 'loss' | 'draw'; // Outcome for this player
  finalFen: string; // Final board position
  pgn: string; // Complete game in PGN format
  moveCount: number; // Total number of moves
  gameDuration?: number; // Game duration in seconds
  timeControl?: {
    initial: number;
    increment: number;
  };
  gameMode: 'human-vs-human' | 'human-vs-ai';
  aiDifficulty?: string; // AI difficulty if applicable
  createdAt: string;
  updatedAt: string;
}

export interface SaveGameRequest {
  playerId: string;
  gameId: string;
  opponentId?: string;
  opponentName: string;
  playerColor: 'w' | 'b';
  gameResult: string;
  gameOutcome: 'win' | 'loss' | 'draw';
  finalFen: string;
  pgn: string;
  moveCount: number;
  gameDuration?: number;
  timeControl?: {
    initial: number;
    increment: number;
  };
  gameMode: 'human-vs-human' | 'human-vs-ai';
  aiDifficulty?: string;
}

export class GameHistoryModel {
  /**
   * Save a completed game to history
   */
  static async saveGame(gameData: SaveGameRequest): Promise<GameHistoryEntry> {
    const insertQuery = `
      INSERT INTO game_history (
        player_id, game_id, opponent_id, opponent_name, player_color,
        game_result, game_outcome, final_fen, pgn, move_count,
        game_duration, time_control, game_mode, ai_difficulty
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      gameData.playerId,
      gameData.gameId,
      gameData.opponentId || null,
      gameData.opponentName,
      gameData.playerColor,
      gameData.gameResult,
      gameData.gameOutcome,
      gameData.finalFen,
      gameData.pgn,
      gameData.moveCount,
      gameData.gameDuration || null,
      gameData.timeControl ? JSON.stringify(gameData.timeControl) : null,
      gameData.gameMode,
      gameData.aiDifficulty || null
    ];

    try {
      const result = await query(insertQuery, values);
      return this.mapRowToGameHistory(result.rows[0]);
    } catch (error) {
      console.error('Error saving game history:', error);
      throw new Error('Failed to save game to history');
    }
  }

  /**
   * Get game history for a specific player
   */
  static async getPlayerHistory(
    playerId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<GameHistoryEntry[]> {
    const selectQuery = `
      SELECT * FROM game_history 
      WHERE player_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;

    try {
      const result = await query(selectQuery, [playerId, limit, offset]);
      return result.rows.map(row => this.mapRowToGameHistory(row));
    } catch (error) {
      console.error('Error fetching player history:', error);
      throw new Error('Failed to fetch game history');
    }
  }

  /**
   * Get a specific game by ID for replay
   */
  static async getGameById(gameHistoryId: number, playerId: string): Promise<GameHistoryEntry | null> {
    const selectQuery = `
      SELECT * FROM game_history 
      WHERE id = $1 AND player_id = $2
    `;

    try {
      const result = await query(selectQuery, [gameHistoryId, playerId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToGameHistory(result.rows[0]);
    } catch (error) {
      console.error('Error fetching game by ID:', error);
      throw new Error('Failed to fetch game');
    }
  }

  /**
   * Get player statistics from game history
   */
  static async getPlayerStats(playerId: string) {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_games,
        SUM(CASE WHEN game_outcome = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN game_outcome = 'loss' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN game_outcome = 'draw' THEN 1 ELSE 0 END) as draws,
        SUM(CASE WHEN game_mode = 'human-vs-ai' THEN 1 ELSE 0 END) as ai_games,
        SUM(CASE WHEN game_mode = 'human-vs-human' THEN 1 ELSE 0 END) as human_games,
        AVG(move_count) as avg_moves,
        AVG(game_duration) as avg_duration
      FROM game_history 
      WHERE player_id = $1
    `;

    try {
      const result = await query(statsQuery, [playerId]);
      const stats = result.rows[0];
      
      return {
        totalGames: parseInt(stats.total_games) || 0,
        wins: parseInt(stats.wins) || 0,
        losses: parseInt(stats.losses) || 0,
        draws: parseInt(stats.draws) || 0,
        aiGames: parseInt(stats.ai_games) || 0,
        humanGames: parseInt(stats.human_games) || 0,
        averageMoves: parseFloat(stats.avg_moves) || 0,
        averageDuration: parseFloat(stats.avg_duration) || 0,
        winRate: stats.total_games > 0 ? (parseInt(stats.wins) / parseInt(stats.total_games)) * 100 : 0
      };
    } catch (error) {
      console.error('Error fetching player stats:', error);
      throw new Error('Failed to fetch player statistics');
    }
  }

  /**
   * Delete a game from history (if player wants to remove it)
   */
  static async deleteGame(gameHistoryId: number, playerId: string): Promise<boolean> {
    const deleteQuery = `
      DELETE FROM game_history 
      WHERE id = $1 AND player_id = $2
    `;

    try {
      const result = await query(deleteQuery, [gameHistoryId, playerId]);
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting game:', error);
      throw new Error('Failed to delete game');
    }
  }

  /**
   * Get recent games across all players (for admin/analytics)
   */
  static async getRecentGames(limit: number = 20): Promise<GameHistoryEntry[]> {
    const selectQuery = `
      SELECT * FROM game_history 
      ORDER BY created_at DESC 
      LIMIT $1
    `;

    try {
      const result = await query(selectQuery, [limit]);
      return result.rows.map(row => this.mapRowToGameHistory(row));
    } catch (error) {
      console.error('Error fetching recent games:', error);
      throw new Error('Failed to fetch recent games');
    }
  }

  /**
   * Initialize database tables (development helper)
   */
  static async initializeTables(): Promise<void> {
    try {
      // Read and execute the schema file
      const fs = require('fs');
      const path = require('path');
      const schemaPath = path.join(__dirname, '../db/schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // Split by semicolon and execute each statement
      const statements = schema.split(';').filter((stmt: string) => stmt.trim().length > 0);
      
      for (const statement of statements) {
        await query(statement);
      }
      
      console.log('✅ Database tables initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing database tables:', error);
      throw error;
    }
  }

  /**
   * Map database row to GameHistoryEntry interface
   */
  private static mapRowToGameHistory(row: any): GameHistoryEntry {
    return {
      id: row.id,
      playerId: row.player_id,
      gameId: row.game_id,
      opponentId: row.opponent_id,
      opponentName: row.opponent_name,
      playerColor: row.player_color,
      gameResult: row.game_result,
      gameOutcome: row.game_outcome,
      finalFen: row.final_fen,
      pgn: row.pgn,
      moveCount: row.move_count,
      gameDuration: row.game_duration,
      timeControl: row.time_control ? JSON.parse(row.time_control) : undefined,
      gameMode: row.game_mode,
      aiDifficulty: row.ai_difficulty,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}