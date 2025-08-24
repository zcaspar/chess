import { query } from '../config/database';

export interface HeadToHeadRecord {
  id: number;
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  totalGames: number;
  lastGameAt: string;
  lastGameId: string;
  lastWinner: string;
  winStreakPlayer: string | null;
  winStreakCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HeadToHeadStats {
  opponentId: string;
  opponentName: string;
  yourWins: number;
  theirWins: number;
  draws: number;
  totalGames: number;
  winRate: number;
  lastGameAt: string;
  lastResult: 'win' | 'loss' | 'draw';
  currentStreak: number;
  streakType: 'winning' | 'losing' | 'none';
}

export class HeadToHeadModel {
  /**
   * Get head-to-head record between two players
   */
  static async getRecord(player1Id: string, player2Id: string): Promise<HeadToHeadRecord | null> {
    // Ensure consistent ordering
    const [p1, p2] = player1Id < player2Id ? [player1Id, player2Id] : [player2Id, player1Id];
    
    const selectQuery = `
      SELECT * FROM head_to_head_records 
      WHERE player1_id = $1 AND player2_id = $2
    `;
    
    try {
      const result = await query(selectQuery, [p1, p2]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToRecord(result.rows[0]);
    } catch (error) {
      console.error('Error fetching head-to-head record:', error);
      // If table doesn't exist, return null
      if ((error as any).code === '42P01') {
        return null;
      }
      throw new Error('Failed to fetch head-to-head record');
    }
  }

  /**
   * Update head-to-head record after a game
   */
  static async updateRecord(
    player1Id: string,
    player2Id: string,
    winnerId: string | null, // null for draw
    gameId: string
  ): Promise<void> {
    // Don't track head-to-head for AI games
    if (!player2Id || player2Id === 'ai') {
      return;
    }

    try {
      // Call the stored function to update the record
      const updateQuery = `
        SELECT update_head_to_head_record($1, $2, $3, $4)
      `;
      
      await query(updateQuery, [player1Id, player2Id, winnerId, gameId]);
      console.log('✅ Head-to-head record updated');
    } catch (error) {
      console.error('Error updating head-to-head record:', error);
      // If function doesn't exist, try direct insert/update
      if ((error as any).code === '42883') {
        await this.directUpdateRecord(player1Id, player2Id, winnerId, gameId);
      }
    }
  }

  /**
   * Direct update without stored procedure (fallback)
   */
  private static async directUpdateRecord(
    player1Id: string,
    player2Id: string,
    winnerId: string | null,
    gameId: string
  ): Promise<void> {
    // Ensure consistent ordering
    const [p1, p2] = player1Id < player2Id ? [player1Id, player2Id] : [player2Id, player1Id];
    const winnerResult = winnerId || 'draw';
    
    try {
      // Check if record exists
      const existing = await this.getRecord(p1, p2);
      
      if (existing) {
        // Update existing record
        const updateQuery = `
          UPDATE head_to_head_records SET
            player1_wins = player1_wins + $1,
            player2_wins = player2_wins + $2,
            draws = draws + $3,
            total_games = total_games + 1,
            last_game_at = CURRENT_TIMESTAMP,
            last_game_id = $4,
            last_winner = $5,
            win_streak_player = $6,
            win_streak_count = $7,
            updated_at = CURRENT_TIMESTAMP
          WHERE player1_id = $8 AND player2_id = $9
        `;
        
        const p1Won = winnerId === p1 ? 1 : 0;
        const p2Won = winnerId === p2 ? 1 : 0;
        const isDraw = winnerId === null ? 1 : 0;
        
        let streakPlayer = null;
        let streakCount = 0;
        
        if (winnerId) {
          if (winnerId === existing.winStreakPlayer) {
            streakPlayer = winnerId;
            streakCount = existing.winStreakCount + 1;
          } else {
            streakPlayer = winnerId;
            streakCount = 1;
          }
        }
        
        await query(updateQuery, [
          p1Won, p2Won, isDraw, gameId, winnerResult,
          streakPlayer, streakCount, p1, p2
        ]);
      } else {
        // Insert new record
        const insertQuery = `
          INSERT INTO head_to_head_records (
            player1_id, player2_id, player1_wins, player2_wins, draws,
            total_games, last_game_at, last_game_id, last_winner,
            win_streak_player, win_streak_count
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9, $10)
        `;
        
        const p1Won = winnerId === p1 ? 1 : 0;
        const p2Won = winnerId === p2 ? 1 : 0;
        const isDraw = winnerId === null ? 1 : 0;
        const streakPlayer = winnerId;
        const streakCount = winnerId ? 1 : 0;
        
        await query(insertQuery, [
          p1, p2, p1Won, p2Won, isDraw, 1, gameId, winnerResult,
          streakPlayer, streakCount
        ]);
      }
      
      console.log('✅ Head-to-head record updated (direct method)');
    } catch (error) {
      console.error('Error in direct update of head-to-head record:', error);
      // Don't throw - this is a non-critical feature
    }
  }

  /**
   * Get all head-to-head records for a player
   */
  static async getPlayerRecords(playerId: string): Promise<HeadToHeadStats[]> {
    const selectQuery = `
      SELECT 
        h.*,
        CASE 
          WHEN h.player1_id = $1 THEN u2.display_name
          ELSE u1.display_name
        END as opponent_name,
        CASE 
          WHEN h.player1_id = $1 THEN h.player2_id
          ELSE h.player1_id
        END as opponent_id
      FROM head_to_head_records h
      LEFT JOIN users u1 ON h.player1_id = u1.firebase_uid
      LEFT JOIN users u2 ON h.player2_id = u2.firebase_uid
      WHERE h.player1_id = $1 OR h.player2_id = $1
      ORDER BY h.last_game_at DESC
    `;
    
    try {
      const result = await query(selectQuery, [playerId]);
      return result.rows.map(row => this.mapRowToStats(row, playerId));
    } catch (error) {
      console.error('Error fetching player head-to-head records:', error);
      // If table doesn't exist, return empty array
      if ((error as any).code === '42P01') {
        return [];
      }
      throw new Error('Failed to fetch head-to-head records');
    }
  }

  /**
   * Get head-to-head stats formatted for display
   */
  static async getStats(player1Id: string, player2Id: string): Promise<HeadToHeadStats | null> {
    const record = await this.getRecord(player1Id, player2Id);
    if (!record) return null;

    // Get opponent name
    const opponentQuery = `SELECT display_name FROM users WHERE firebase_uid = $1`;
    const opponentResult = await query(opponentQuery, [player2Id]);
    const opponentName = opponentResult.rows[0]?.display_name || 'Unknown Player';

    // Determine stats from player1's perspective
    const isPlayer1 = player1Id < player2Id;
    const yourWins = isPlayer1 ? record.player1Wins : record.player2Wins;
    const theirWins = isPlayer1 ? record.player2Wins : record.player1Wins;
    
    let lastResult: 'win' | 'loss' | 'draw' = 'draw';
    if (record.lastWinner === 'draw') {
      lastResult = 'draw';
    } else if (record.lastWinner === player1Id) {
      lastResult = 'win';
    } else {
      lastResult = 'loss';
    }

    let currentStreak = 0;
    let streakType: 'winning' | 'losing' | 'none' = 'none';
    if (record.winStreakPlayer === player1Id) {
      currentStreak = record.winStreakCount;
      streakType = 'winning';
    } else if (record.winStreakPlayer === player2Id) {
      currentStreak = record.winStreakCount;
      streakType = 'losing';
    }

    return {
      opponentId: player2Id,
      opponentName,
      yourWins,
      theirWins,
      draws: record.draws,
      totalGames: record.totalGames,
      winRate: record.totalGames > 0 ? (yourWins / record.totalGames) * 100 : 0,
      lastGameAt: record.lastGameAt,
      lastResult,
      currentStreak,
      streakType
    };
  }

  /**
   * Map database row to HeadToHeadRecord
   */
  private static mapRowToRecord(row: any): HeadToHeadRecord {
    return {
      id: row.id,
      player1Id: row.player1_id,
      player2Id: row.player2_id,
      player1Wins: row.player1_wins,
      player2Wins: row.player2_wins,
      draws: row.draws,
      totalGames: row.total_games,
      lastGameAt: row.last_game_at,
      lastGameId: row.last_game_id,
      lastWinner: row.last_winner,
      winStreakPlayer: row.win_streak_player,
      winStreakCount: row.win_streak_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Map database row to HeadToHeadStats from a player's perspective
   */
  private static mapRowToStats(row: any, playerId: string): HeadToHeadStats {
    const isPlayer1 = row.player1_id === playerId;
    const yourWins = isPlayer1 ? row.player1_wins : row.player2_wins;
    const theirWins = isPlayer1 ? row.player2_wins : row.player1_wins;
    
    let lastResult: 'win' | 'loss' | 'draw' = 'draw';
    if (row.last_winner === 'draw') {
      lastResult = 'draw';
    } else if (row.last_winner === playerId) {
      lastResult = 'win';
    } else {
      lastResult = 'loss';
    }

    let currentStreak = 0;
    let streakType: 'winning' | 'losing' | 'none' = 'none';
    if (row.win_streak_player === playerId) {
      currentStreak = row.win_streak_count;
      streakType = 'winning';
    } else if (row.win_streak_player && row.win_streak_player !== playerId) {
      currentStreak = row.win_streak_count;
      streakType = 'losing';
    }

    return {
      opponentId: row.opponent_id,
      opponentName: row.opponent_name || 'Unknown Player',
      yourWins,
      theirWins,
      draws: row.draws,
      totalGames: row.total_games,
      winRate: row.total_games > 0 ? (yourWins / row.total_games) * 100 : 0,
      lastGameAt: row.last_game_at,
      lastResult,
      currentStreak,
      streakType
    };
  }
}