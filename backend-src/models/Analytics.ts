import { pool, query } from '../config/database';
import { safeJsonParse, prepareForJsonb } from '../utils/jsonHandler';

// Type definitions for analytics data
export interface GameStatistics {
  id: number;
  gameHistoryId: number;
  playerId: string;
  avgMoveTime?: number;
  longestThinkTime?: number;
  timePressureMoves: number;
  openingMoves?: string[];
  openingName?: string;
  gameQualityScore?: number;
  decisiveMoments: number;
  positionComplexityAvg?: number;
  materialAdvantagePeak?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerPerformance {
  id: number;
  playerId: string;
  periodStart: string;
  periodEnd: string;
  periodType: 'daily' | 'weekly' | 'monthly';
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  // Performance by game mode
  aiWins: number;
  aiLosses: number;
  aiDraws: number;
  humanWins: number;
  humanLosses: number;
  humanDraws: number;
  // Performance by difficulty
  beginnerWins: number;
  beginnerLosses: number;
  easyWins: number;
  easyLosses: number;
  mediumWins: number;
  mediumLosses: number;
  hardWins: number;
  hardLosses: number;
  expertWins: number;
  expertLosses: number;
  // Time control performance
  blitzWins: number;
  blitzLosses: number;
  rapidWins: number;
  rapidLosses: number;
  classicalWins: number;
  classicalLosses: number;
  // Average metrics
  avgGameLength: number;
  avgGameDuration: number;
  avgMoveTime: number;
  // Streaks
  currentWinStreak: number;
  currentLossStreak: number;
  bestWinStreak: number;
  worstLossStreak: number;
  createdAt: string;
  updatedAt: string;
}

export interface OpeningStatistics {
  id: number;
  playerId: string;
  openingMoves: string[];
  openingName?: string;
  color: 'w' | 'b';
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgGameLength: number;
  avgGameDuration: number;
  avgQualityScore: number;
  lastPlayed?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsightCache {
  id: number;
  playerId: string;
  cacheKey: string;
  insightType: 'weakness' | 'strength' | 'recommendation' | 'pattern';
  insightData: any;
  gameCount?: number;
  confidenceScore?: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  playerId: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgMovesPerGame: number;
  avgGameDuration: number;
  avgMoveTime: number;
  lastGameDate: string;
  aiGames: number;
  humanGames: number;
}

export interface RecentPerformance {
  playerId: string;
  gameDate: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  dailyWinRate: number;
}

export interface PerformanceTrend {
  date: string;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  gamesPlayed: number;
}

export interface DifficultyBreakdown {
  difficulty: string;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  gamesPlayed: number;
}

export interface TimeControlBreakdown {
  timeControl: string;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  gamesPlayed: number;
}

export class AnalyticsModel {
  /**
   * Get dashboard summary for a player
   */
  static async getDashboardSummary(playerId: string): Promise<DashboardSummary | null> {
    try {
      const result = await query(
        'SELECT * FROM player_dashboard_summary WHERE player_id = $1',
        [playerId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        playerId: row.player_id,
        totalGames: parseInt(row.total_games),
        wins: parseInt(row.wins),
        losses: parseInt(row.losses),
        draws: parseInt(row.draws),
        winRate: parseFloat(row.win_rate) || 0,
        avgMovesPerGame: parseFloat(row.avg_moves_per_game) || 0,
        avgGameDuration: parseFloat(row.avg_game_duration) || 0,
        avgMoveTime: parseFloat(row.avg_move_time) || 0,
        lastGameDate: row.last_game_date,
        aiGames: parseInt(row.ai_games),
        humanGames: parseInt(row.human_games)
      };
    } catch (error) {
      console.error('Error fetching dashboard summary:', error);
      throw error;
    }
  }

  /**
   * Get recent performance trends for a player
   */
  static async getRecentPerformance(playerId: string, days: number = 30): Promise<RecentPerformance[]> {
    try {
      const result = await query(
        `SELECT * FROM player_recent_performance 
         WHERE player_id = $1 
         AND game_date >= CURRENT_DATE - INTERVAL '${days} days'
         ORDER BY game_date DESC`,
        [playerId]
      );
      
      return result.rows.map(row => ({
        playerId: row.player_id,
        gameDate: row.game_date,
        gamesPlayed: parseInt(row.games_played),
        wins: parseInt(row.wins),
        losses: parseInt(row.losses),
        draws: parseInt(row.draws),
        dailyWinRate: parseFloat(row.daily_win_rate) || 0
      }));
    } catch (error) {
      console.error('Error fetching recent performance:', error);
      throw error;
    }
  }

  /**
   * Get performance breakdown by AI difficulty
   */
  static async getDifficultyBreakdown(playerId: string): Promise<DifficultyBreakdown[]> {
    try {
      const result = await query(
        `SELECT 
          ai_difficulty as difficulty,
          SUM(CASE WHEN game_outcome = 'win' THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN game_outcome = 'loss' THEN 1 ELSE 0 END) as losses,
          SUM(CASE WHEN game_outcome = 'draw' THEN 1 ELSE 0 END) as draws,
          COUNT(*) as games_played,
          ROUND(
            (SUM(CASE WHEN game_outcome = 'win' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
          ) as win_rate
        FROM game_history 
        WHERE player_id = $1 
        AND game_mode = 'human-vs-ai'
        AND ai_difficulty IS NOT NULL
        GROUP BY ai_difficulty
        ORDER BY 
          CASE ai_difficulty
            WHEN 'beginner' THEN 1
            WHEN 'easy' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'hard' THEN 4
            WHEN 'expert' THEN 5
            ELSE 6
          END`,
        [playerId]
      );
      
      return result.rows.map(row => ({
        difficulty: row.difficulty,
        wins: parseInt(row.wins),
        losses: parseInt(row.losses),
        draws: parseInt(row.draws),
        winRate: parseFloat(row.win_rate) || 0,
        gamesPlayed: parseInt(row.games_played)
      }));
    } catch (error) {
      console.error('Error fetching difficulty breakdown:', error);
      throw error;
    }
  }

  /**
   * Get performance breakdown by time control
   */
  static async getTimeControlBreakdown(playerId: string): Promise<TimeControlBreakdown[]> {
    try {
      const result = await query(
        `SELECT 
          CASE 
            WHEN (time_control->>'initial')::integer <= 180 THEN 'Blitz'
            WHEN (time_control->>'initial')::integer <= 900 THEN 'Rapid'
            ELSE 'Classical'
          END as time_control_type,
          SUM(CASE WHEN game_outcome = 'win' THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN game_outcome = 'loss' THEN 1 ELSE 0 END) as losses,
          SUM(CASE WHEN game_outcome = 'draw' THEN 1 ELSE 0 END) as draws,
          COUNT(*) as games_played,
          ROUND(
            (SUM(CASE WHEN game_outcome = 'win' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
          ) as win_rate
        FROM game_history 
        WHERE player_id = $1 
        AND time_control IS NOT NULL
        GROUP BY time_control_type
        ORDER BY 
          CASE time_control_type
            WHEN 'Blitz' THEN 1
            WHEN 'Rapid' THEN 2
            WHEN 'Classical' THEN 3
            ELSE 4
          END`,
        [playerId]
      );
      
      return result.rows.map(row => ({
        timeControl: row.time_control_type,
        wins: parseInt(row.wins),
        losses: parseInt(row.losses),
        draws: parseInt(row.draws),
        winRate: parseFloat(row.win_rate) || 0,
        gamesPlayed: parseInt(row.games_played)
      }));
    } catch (error) {
      console.error('Error fetching time control breakdown:', error);
      throw error;
    }
  }

  /**
   * Get opening statistics for a player
   */
  static async getOpeningStatistics(playerId: string, limit: number = 10): Promise<OpeningStatistics[]> {
    try {
      const result = await query(
        `SELECT * FROM opening_statistics 
         WHERE player_id = $1 
         AND games_played > 0
         ORDER BY games_played DESC, win_rate DESC
         LIMIT $2`,
        [playerId, limit]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        playerId: row.player_id,
        openingMoves: row.opening_moves,
        openingName: row.opening_name,
        color: row.color,
        gamesPlayed: parseInt(row.games_played),
        wins: parseInt(row.wins),
        losses: parseInt(row.losses),
        draws: parseInt(row.draws),
        winRate: parseFloat(row.win_rate) || 0,
        avgGameLength: parseFloat(row.avg_game_length) || 0,
        avgGameDuration: parseFloat(row.avg_game_duration) || 0,
        avgQualityScore: parseFloat(row.avg_quality_score) || 0,
        lastPlayed: row.last_played,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('Error fetching opening statistics:', error);
      throw error;
    }
  }

  /**
   * Initialize analytics tables
   */
  static async initializeAnalyticsTables(): Promise<void> {
    try {
      // Instead of reading from file, define schema inline to avoid path issues
      const schemaSQL = `
        -- Chess App Analytics Database Schema
        -- Phase 8: Statistical Dashboard & Game Review Extensions

        -- Game Statistics Table
        -- Stores aggregated statistics for each game for efficient querying
        CREATE TABLE IF NOT EXISTS game_statistics (
            id SERIAL PRIMARY KEY,
            game_history_id INTEGER REFERENCES game_history(id) ON DELETE CASCADE,
            player_id VARCHAR(255) NOT NULL,
            
            -- Game metrics
            avg_move_time DECIMAL(10,2), -- Average time per move in seconds
            longest_think_time DECIMAL(10,2), -- Longest single move time
            time_pressure_moves INTEGER DEFAULT 0, -- Moves made under time pressure (<10s)
            
            -- Opening analysis
            opening_moves TEXT[], -- First 5 moves for opening classification
            opening_name VARCHAR(100), -- ECO code or opening name
            
            -- Game quality metrics
            game_quality_score DECIMAL(5,2), -- Overall game quality (0-100)
            decisive_moments INTEGER DEFAULT 0, -- Number of critical positions
            
            -- Performance indicators
            position_complexity_avg DECIMAL(5,2), -- Average position complexity
            material_advantage_peak DECIMAL(5,2), -- Peak material advantage
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Player Performance Table
        -- Tracks historical performance metrics and trends
        CREATE TABLE IF NOT EXISTS player_performance (
            id SERIAL PRIMARY KEY,
            player_id VARCHAR(255) NOT NULL,
            
            -- Time period for this performance snapshot
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
            
            -- Game statistics
            games_played INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            win_rate DECIMAL(5,2) DEFAULT 0,
            
            -- Average game metrics
            avg_game_length DECIMAL(10,2), -- Average moves per game
            avg_game_duration DECIMAL(10,2), -- Average game duration in seconds
            avg_move_time DECIMAL(10,2), -- Average time per move
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes for efficient queries
        CREATE INDEX IF NOT EXISTS idx_game_statistics_player_id ON game_statistics(player_id);
        CREATE INDEX IF NOT EXISTS idx_game_statistics_game_history_id ON game_statistics(game_history_id);
        CREATE INDEX IF NOT EXISTS idx_player_performance_player_id ON player_performance(player_id);

        -- Create a view for easy dashboard queries
        CREATE OR REPLACE VIEW player_dashboard_summary AS
        SELECT 
            gh.player_id,
            COUNT(*) as total_games,
            SUM(CASE WHEN gh.game_outcome = 'win' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN gh.game_outcome = 'loss' THEN 1 ELSE 0 END) as losses,
            SUM(CASE WHEN gh.game_outcome = 'draw' THEN 1 ELSE 0 END) as draws,
            ROUND(
                (SUM(CASE WHEN gh.game_outcome = 'win' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
            ) as win_rate,
            AVG(gh.move_count) as avg_moves_per_game,
            AVG(gh.game_duration) as avg_game_duration,
            AVG(gs.avg_move_time) as avg_move_time,
            MAX(gh.created_at) as last_game_date,
            COUNT(CASE WHEN gh.game_mode = 'human-vs-ai' THEN 1 END) as ai_games,
            COUNT(CASE WHEN gh.game_mode = 'human-vs-human' THEN 1 END) as human_games
        FROM game_history gh
        LEFT JOIN game_statistics gs ON gh.id = gs.game_history_id
        GROUP BY gh.player_id;

        -- Create a view for recent performance trends
        CREATE OR REPLACE VIEW player_recent_performance AS
        SELECT 
            player_id,
            DATE_TRUNC('day', created_at) as game_date,
            COUNT(*) as games_played,
            SUM(CASE WHEN game_outcome = 'win' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN game_outcome = 'loss' THEN 1 ELSE 0 END) as losses,
            SUM(CASE WHEN game_outcome = 'draw' THEN 1 ELSE 0 END) as draws,
            ROUND(
                (SUM(CASE WHEN game_outcome = 'win' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
            ) as daily_win_rate
        FROM game_history
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY player_id, DATE_TRUNC('day', created_at)
        ORDER BY player_id, game_date DESC;
      `;
      
      // Execute the schema
      await query(schemaSQL);
      console.log('✅ Analytics tables initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing analytics tables:', error);
      throw error;
    }
  }

  /**
   * Update game statistics for a game
   */
  static async updateGameStatistics(gameHistoryId: number, playerId: string, gameData: any): Promise<void> {
    try {
      // This would be called after a game is saved to calculate and store statistics
      // For now, we'll implement basic statistics
      
      const insertQuery = `
        INSERT INTO game_statistics (
          game_history_id, player_id, avg_move_time, time_pressure_moves,
          opening_moves, game_quality_score, decisive_moments
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (game_history_id) DO UPDATE SET
          avg_move_time = EXCLUDED.avg_move_time,
          time_pressure_moves = EXCLUDED.time_pressure_moves,
          opening_moves = EXCLUDED.opening_moves,
          game_quality_score = EXCLUDED.game_quality_score,
          decisive_moments = EXCLUDED.decisive_moments,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      // Calculate basic statistics (to be enhanced later)
      const avgMoveTime = gameData.gameDuration ? gameData.gameDuration / gameData.moveCount : null;
      const timePressureMoves = 0; // Will be calculated from move times
      const openingMoves = gameData.pgn ? this.extractOpeningMoves(gameData.pgn) : [];
      const gameQualityScore = 75; // Placeholder - will be calculated later
      const decisiveMoments = 3; // Placeholder - will be calculated later
      
      await query(insertQuery, [
        gameHistoryId,
        playerId,
        avgMoveTime,
        timePressureMoves,
        openingMoves,
        gameQualityScore,
        decisiveMoments
      ]);
      
    } catch (error) {
      console.error('Error updating game statistics:', error);
      throw error;
    }
  }

  /**
   * Extract opening moves from PGN (first 5 moves)
   */
  private static extractOpeningMoves(pgn: string): string[] {
    try {
      // Simple PGN parsing to extract first 5 moves
      const moves = pgn.match(/\d+\.\s*([a-zA-Z0-9+#=\-]+)\s*([a-zA-Z0-9+#=\-]+)?/g);
      if (!moves) return [];
      
      const openingMoves: string[] = [];
      for (let i = 0; i < Math.min(5, moves.length); i++) {
        const match = moves[i].match(/\d+\.\s*([a-zA-Z0-9+#=\-]+)\s*([a-zA-Z0-9+#=\-]+)?/);
        if (match) {
          openingMoves.push(match[1]); // White move
          if (match[2]) openingMoves.push(match[2]); // Black move
        }
      }
      
      return openingMoves.slice(0, 10); // First 10 half-moves (5 full moves)
    } catch (error) {
      console.error('Error extracting opening moves:', error);
      return [];
    }
  }
}