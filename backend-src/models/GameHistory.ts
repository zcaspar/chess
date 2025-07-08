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
      gameData.timeControl || null, // PostgreSQL JSONB handles JSON automatically
      gameData.gameMode,
      gameData.aiDifficulty || null
    ];

    try {
      const result = await query(insertQuery, values);
      return this.mapRowToGameHistory(result.rows[0]);
    } catch (error: any) {
      console.error('Error saving game history:', error);
      
      // Check if it's a table doesn't exist error
      if (error.code === '42P01') {
        console.log('🔄 Table does not exist, attempting to create it...');
        
        try {
          // Try to create the table and retry the insert
          await this.initializeTables();
          console.log('✅ Tables created, retrying insert...');
          
          const retryResult = await query(insertQuery, values);
          return this.mapRowToGameHistory(retryResult.rows[0]);
        } catch (retryError: any) {
          console.error('❌ Failed to create table and retry insert:', retryError);
          throw new Error(`Failed to initialize database tables: ${retryError.message}`);
        }
      }
      
      throw new Error(`Failed to save game to history: ${error.message}`);
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
      console.log('📖 Executing getPlayerHistory query for user:', playerId);
      console.log('Query params:', { playerId, limit, offset });
      
      const result = await query(selectQuery, [playerId, limit, offset]);
      console.log('Query result rows:', result.rows.length);
      
      // Log the first row structure if any
      if (result.rows.length > 0) {
        console.log('First row structure:', Object.keys(result.rows[0]));
        console.log('time_control field type:', typeof result.rows[0].time_control);
        console.log('time_control value:', result.rows[0].time_control);
      }
      
      return result.rows.map(row => this.mapRowToGameHistory(row));
    } catch (error: any) {
      console.error('Error fetching player history:', error);
      
      // Check if it's a table doesn't exist error
      if (error.code === '42P01') {
        console.error('Game history table does not exist. Returning empty array.');
        return []; // Return empty array instead of throwing
      }
      
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
      console.log('🔄 Starting database table initialization...');
      
      // Test database connection first
      try {
        await query('SELECT 1');
        console.log('✅ Database connection confirmed');
      } catch (connectionError: any) {
        console.error('❌ Database connection failed during initialization:', connectionError);
        throw new Error(`Database connection failed: ${connectionError.message}`);
      }
      
      // Try to read the schema file, if it fails, use inline SQL
      let schema: string;
      
      try {
        const fs = require('fs');
        const path = require('path');
        const schemaPath = path.join(__dirname, '../db/schema.sql');
        schema = fs.readFileSync(schemaPath, 'utf8');
        console.log('📁 Schema loaded from file');
      } catch (fileError) {
        console.log('📝 Using inline schema (file not found)');
        // Simplified inline schema as fallback - minimal setup for production
        schema = `
          CREATE TABLE IF NOT EXISTS game_history (
              id SERIAL PRIMARY KEY,
              player_id VARCHAR(255) NOT NULL,
              game_id VARCHAR(255) NOT NULL,
              opponent_id VARCHAR(255),
              opponent_name VARCHAR(255) NOT NULL,
              player_color VARCHAR(1) NOT NULL CHECK (player_color IN ('w', 'b')),
              game_result VARCHAR(50) NOT NULL,
              game_outcome VARCHAR(10) CHECK (game_outcome IN ('win', 'loss', 'draw')),
              final_fen TEXT NOT NULL,
              pgn TEXT NOT NULL,
              move_count INTEGER NOT NULL DEFAULT 0,
              game_duration INTEGER,
              time_control JSONB,
              game_mode VARCHAR(20) NOT NULL CHECK (game_mode IN ('human-vs-human', 'human-vs-ai')),
              ai_difficulty VARCHAR(20),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `;
      }
      
      // Split by semicolon and execute each statement
      const statements = schema.split(';').filter((stmt: string) => stmt.trim().length > 0);
      
      console.log(`🔄 Executing ${statements.length} SQL statements...`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i].trim();
        if (statement) {
          try {
            console.log(`🔄 Executing statement ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`);
            await query(statement);
            console.log(`✅ Statement ${i + 1} executed successfully`);
          } catch (statementError: any) {
            console.error(`❌ Error executing statement ${i + 1}:`, statementError);
            console.error('Statement was:', statement);
            console.error('Error details:', {
              code: statementError.code,
              message: statementError.message,
              detail: statementError.detail,
              position: statementError.position
            });
            throw statementError;
          }
        }
      }
      
      // Test that the table was created successfully
      try {
        const result = await query('SELECT COUNT(*) FROM game_history WHERE 1=0');
        console.log('✅ Table validation successful');
      } catch (validationError: any) {
        console.error('❌ Table validation failed:', validationError);
        throw new Error(`Table creation validation failed: ${validationError.message}`);
      }
      
      console.log('✅ Database tables initialized successfully');
    } catch (error: any) {
      console.error('❌ Error initializing database tables:', error);
      console.error('Full error object:', JSON.stringify(error, null, 2));
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        detail: error.detail,
        hint: error.hint,
        position: error.position,
        internalPosition: error.internalPosition,
        internalQuery: error.internalQuery,
        where: error.where,
        schema: error.schema,
        table: error.table,
        column: error.column,
        dataType: error.dataType,
        constraint: error.constraint,
        file: error.file,
        line: error.line,
        routine: error.routine
      });
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
      timeControl: row.time_control || undefined, // PostgreSQL JSONB returns parsed object
      gameMode: row.game_mode,
      aiDifficulty: row.ai_difficulty,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}