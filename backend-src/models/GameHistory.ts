import { pool, query } from '../config/database';
import { safeJsonParse, prepareForJsonb } from '../utils/jsonHandler';
import { logger } from '../utils/logger';

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

/**
 * Split a SQL script into individual statements.
 *
 * A naive `split(';')` tears PL/pgSQL definitions apart, because the body of a
 * $$-quoted function legitimately contains semicolons — the created function
 * then arrives as two malformed fragments and the whole schema run aborts. This
 * tracks the dollar-quote state and drops comment-only fragments (the schema
 * ends with a commented-out ALTER TABLE whose trailing `;` would otherwise
 * produce one).
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;
  let i = 0;

  while (i < sql.length) {
    if (sql.startsWith('$$', i)) {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i += 2;
      continue;
    }

    const char = sql[i];
    if (char === ';' && !inDollarQuote) {
      statements.push(current);
      current = '';
    } else {
      current += char;
    }
    i += 1;
  }
  statements.push(current);

  return statements
    .map((statement) => statement.trim())
    .filter((statement) => {
      if (!statement) return false;
      // Keep only statements with at least one non-comment line.
      return statement
        .split('\n')
        .some((line) => line.trim() && !line.trim().startsWith('--'));
    });
}

export class GameHistoryModel {
  /**
   * Save a completed game to history
   */
  static async saveGame(gameData: SaveGameRequest): Promise<GameHistoryEntry> {
    const columns = `
        player_id, game_id, opponent_id, opponent_name, player_color,
        game_result, game_outcome, final_fen, pgn, move_count,
        game_duration, time_control, game_mode, ai_difficulty
    `;
    const placeholders = 'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)';

    // One row per (player_id, game_id). The same finished game legitimately
    // reaches here more than once — the socket path and the HTTP path both
    // save, a client retries after a timeout, StrictMode double-fires an
    // updater — and each of those used to append a duplicate row.
    const insertQuery = `
      INSERT INTO game_history (${columns})
      ${placeholders}
      ON CONFLICT (player_id, game_id) DO UPDATE SET
        opponent_id   = EXCLUDED.opponent_id,
        opponent_name = EXCLUDED.opponent_name,
        player_color  = EXCLUDED.player_color,
        game_result   = EXCLUDED.game_result,
        game_outcome  = EXCLUDED.game_outcome,
        final_fen     = EXCLUDED.final_fen,
        pgn           = EXCLUDED.pgn,
        move_count    = EXCLUDED.move_count,
        game_duration = EXCLUDED.game_duration,
        time_control  = EXCLUDED.time_control,
        game_mode     = EXCLUDED.game_mode,
        ai_difficulty = EXCLUDED.ai_difficulty
      RETURNING *
    `;

    // Used only when the database predates the unique index (see 42P10 below).
    const plainInsertQuery = `
      INSERT INTO game_history (${columns})
      ${placeholders}
      RETURNING *
    `;

    // Ensure timeControl is a proper object for JSONB
    const timeControlValue = prepareForJsonb(gameData.timeControl);

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
      timeControlValue, // Use the validated timeControl
      gameData.gameMode,
      gameData.aiDifficulty || null
    ];

    try {
      const result = await query(insertQuery, values);
      return this.mapRowToGameHistory(result.rows[0]);
    } catch (error: any) {
      logger.error('Error saving game history:', error);

      // Check if it's a table doesn't exist error
      if (error.code === '42P01') {
        logger.debug('🔄 Table does not exist, attempting to create it...');

        try {
          // Try to create the table and retry the insert
          await this.initializeTables();
          logger.debug('✅ Tables created, retrying insert...');

          const retryResult = await query(insertQuery, values);
          return this.mapRowToGameHistory(retryResult.rows[0]);
        } catch (retryError: any) {
          logger.error('❌ Failed to create table and retry insert:', retryError);
          throw new Error(`Failed to initialize database tables: ${retryError.message}`);
        }
      }

      // 42P10: "there is no unique or exclusion constraint matching the ON
      // CONFLICT specification" — a database from before the unique index was
      // added. Fall back to a plain insert rather than losing every game; the
      // index is created by db/schema.sql on the next deploy.
      if (error.code === '42P10') {
        logger.warn(
          '⚠️  game_history lacks the (player_id, game_id) unique index; ' +
          'saving without duplicate protection until the schema is applied.',
        );
        const fallbackResult = await query(plainInsertQuery, values);
        return this.mapRowToGameHistory(fallbackResult.rows[0]);
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
      logger.debug('📖 Executing getPlayerHistory query for user:', playerId);
      logger.debug('Query params:', { playerId, limit, offset });
      
      const result = await query(selectQuery, [playerId, limit, offset]);
      logger.debug('Query result rows:', result.rows.length);
      
      // Log the first row structure if any
      if (result.rows.length > 0) {
        logger.debug('First row structure:', Object.keys(result.rows[0]));
        logger.debug('time_control field type:', typeof result.rows[0].time_control);
        logger.debug('time_control value:', result.rows[0].time_control);
      }
      
      return result.rows.map(row => this.mapRowToGameHistory(row));
    } catch (error: any) {
      logger.error('Error fetching player history:', error);
      
      // Check if it's a table doesn't exist error
      if (error.code === '42P01') {
        logger.error('Game history table does not exist. Returning empty array.');
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
      logger.error('Error fetching game by ID:', error);
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
      logger.error('Error fetching player stats:', error);
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
      logger.error('Error deleting game:', error);
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
      logger.error('Error fetching recent games:', error);
      throw new Error('Failed to fetch recent games');
    }
  }

  /**
   * Collapse duplicate rows for the same (player_id, game_id) pair.
   *
   * Runs only while the unique index is missing — once it exists duplicates are
   * impossible — because otherwise an existing database that already contains
   * duplicates can never have the index built, and the protection stays off
   * forever. The oldest row of each pair is kept: the first write is the real
   * record, later ones are retries of it.
   *
   * Uses a window function rather than a self-join so it is O(n log n); the
   * naive `DELETE ... USING` form would be quadratic on a table with no index
   * on those columns, which is exactly the situation this runs in.
   *
   * @returns the number of duplicate rows removed
   */
  private static async dedupeGameHistory(): Promise<number> {
    // Nothing to do on a first run — checked up front so a brand-new database
    // does not log a "relation does not exist" error on every boot.
    const table = await query(`SELECT to_regclass('public.game_history') AS relation`);
    if (!table.rows[0]?.relation) {
      return 0;
    }

    // Duplicates are impossible once the index exists, and this is an O(n log n)
    // scan we have no reason to repeat on every startup.
    const index = await query(
      `SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'game_history_player_game_unique'`,
    );
    if (index.rows.length > 0) {
      return 0;
    }

    const result = await query(`
      DELETE FROM game_history
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY player_id, game_id ORDER BY id
          ) AS duplicate_rank
          FROM game_history
        ) ranked
        WHERE ranked.duplicate_rank > 1
      )
    `);
    return result.rowCount ?? 0;
  }

  /**
   * Initialize database tables (development helper)
   */
  static async initializeTables(): Promise<void> {
    try {
      logger.debug('🔄 Starting database table initialization...');
      
      // Test database connection first
      try {
        await query('SELECT 1');
        logger.debug('✅ Database connection confirmed');
      } catch (connectionError: any) {
        logger.error('❌ Database connection failed during initialization:', connectionError);
        throw new Error(`Database connection failed: ${connectionError.message}`);
      }
      
      // Try to read the schema files, if it fails, use inline SQL
      let schema: string;
      let h2hSchema: string = '';
      
      try {
        const fs = require('fs');
        const path = require('path');
        const schemaPath = path.join(__dirname, '../db/schema.sql');
        schema = fs.readFileSync(schemaPath, 'utf8');
        logger.debug('📁 Schema loaded from file');
        
        // Try to load head-to-head schema
        try {
          const h2hSchemaPath = path.join(__dirname, '../db/head-to-head-schema.sql');
          h2hSchema = fs.readFileSync(h2hSchemaPath, 'utf8');
          logger.debug('📁 Head-to-head schema loaded from file');
        } catch (h2hFileError) {
          logger.debug('📝 Head-to-head schema file not found, will be included in inline schema');
        }
      } catch (fileError) {
        logger.debug('📝 Using inline schema (file not found)');
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

          -- One row per (player, game); see db/schema.sql for the rationale.
          CREATE UNIQUE INDEX IF NOT EXISTS game_history_player_game_unique
              ON game_history(player_id, game_id);

          CREATE INDEX IF NOT EXISTS idx_game_history_player_id ON game_history(player_id);

          -- Head-to-head records table
          CREATE TABLE IF NOT EXISTS head_to_head_records (
              id SERIAL PRIMARY KEY,
              player1_id VARCHAR(255) NOT NULL,
              player2_id VARCHAR(255) NOT NULL,
              player1_wins INTEGER DEFAULT 0,
              player2_wins INTEGER DEFAULT 0,
              draws INTEGER DEFAULT 0,
              total_games INTEGER DEFAULT 0,
              last_game_at TIMESTAMP,
              last_game_id VARCHAR(255),
              last_winner VARCHAR(255),
              win_streak_player VARCHAR(255),
              win_streak_count INTEGER DEFAULT 0,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT check_player_order CHECK (player1_id < player2_id),
              CONSTRAINT unique_player_pair UNIQUE (player1_id, player2_id)
          );
        `;
      }
      
      // Collapse duplicates FIRST: the schema below adds the unique
      // (player_id, game_id) index, and on a database that already holds
      // duplicates that statement fails and the duplicate protection never
      // lands. Doing it here means no manual migration is required.
      try {
        const removed = await this.dedupeGameHistory();
        if (removed > 0) {
          logger.warn(
            `🧹 Removed ${removed} duplicate game_history row(s) before creating the unique index`,
          );
        }
      } catch (dedupeError: any) {
        logger.error(
          `⚠️  Could not collapse duplicate game_history rows (${dedupeError.message}); ` +
          'the unique index may not be created',
        );
      }

      // Combine schemas
      const fullSchema = schema + '\n' + h2hSchema;
      
      // Split into statements and execute each one.
      const statements = splitSqlStatements(fullSchema);

      logger.debug(`🔄 Executing ${statements.length} SQL statements...`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i].trim();
        if (statement) {
          try {
            logger.debug(`🔄 Executing statement ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`);
            await query(statement);
            logger.debug(`✅ Statement ${i + 1} executed successfully`);
          } catch (statementError: any) {
            logger.error(`❌ Error executing statement ${i + 1}:`, statementError);
            logger.error('Statement was:', statement);
            logger.error('Error details:', {
              code: statementError.code,
              message: statementError.message,
              detail: statementError.detail,
              position: statementError.position
            });

            // An index that cannot be built (most likely the unique
            // (player_id, game_id) index on a table that already contains
            // duplicates) costs performance and duplicate protection, not
            // correctness. Log it loudly and keep going rather than leaving the
            // server with no tables at all.
            if (/^\s*CREATE\s+(UNIQUE\s+)?INDEX/i.test(statement)) {
              logger.error(
                `⚠️  Continuing without index: ${statement.substring(0, 80)}`,
              );
              continue;
            }

            throw statementError;
          }
        }
      }
      
      // Test that the table was created successfully
      try {
        const result = await query('SELECT COUNT(*) FROM game_history WHERE 1=0');
        logger.debug('✅ Table validation successful');
      } catch (validationError: any) {
        logger.error('❌ Table validation failed:', validationError);
        throw new Error(`Table creation validation failed: ${validationError.message}`);
      }
      
      logger.debug('✅ Database tables initialized successfully');
    } catch (error: any) {
      logger.error('❌ Error initializing database tables:', error);
      logger.error('Full error object:', JSON.stringify(error, null, 2));
      logger.error('Error details:', {
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
    try {
      // Use safe JSON parsing for timeControl field
      const timeControl = safeJsonParse(row.time_control);
      
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
        timeControl: timeControl,
        gameMode: row.game_mode,
        aiDifficulty: row.ai_difficulty,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      logger.error('Error mapping game history row:', error);
      logger.error('Row data:', row);
      logger.error('Row time_control:', row.time_control);
      logger.error('Type of time_control:', typeof row.time_control);
      throw error;
    }
  }
}