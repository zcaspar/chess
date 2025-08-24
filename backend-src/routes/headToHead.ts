import express from 'express';
import { HeadToHeadModel } from '../models/HeadToHead';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/head-to-head/:opponentId
 * Get head-to-head record between authenticated user and specified opponent
 */
router.get('/:opponentId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { opponentId } = req.params;
    const playerId = req.user!.uid;
    
    if (!opponentId) {
      return res.status(400).json({ error: 'Opponent ID is required' });
    }
    
    const stats = await HeadToHeadModel.getStats(playerId, opponentId);
    
    if (!stats) {
      // No record exists yet - return empty stats
      return res.json({
        success: true,
        stats: {
          opponentId,
          opponentName: 'Unknown Player',
          yourWins: 0,
          theirWins: 0,
          draws: 0,
          totalGames: 0,
          winRate: 0,
          lastGameAt: null,
          lastResult: null,
          currentStreak: 0,
          streakType: 'none'
        }
      });
    }
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('Error fetching head-to-head stats:', error);
    res.status(500).json({
      error: 'Failed to fetch head-to-head stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/head-to-head
 * Get all head-to-head records for the authenticated user
 */
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user!.uid;
    const records = await HeadToHeadModel.getPlayerRecords(playerId);
    
    res.json({
      success: true,
      records,
      count: records.length
    });
    
  } catch (error) {
    console.error('Error fetching player head-to-head records:', error);
    res.status(500).json({
      error: 'Failed to fetch head-to-head records',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/head-to-head/update
 * Manually update head-to-head record (admin only or for testing)
 */
router.post('/update', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    // Only allow in development for testing
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Manual update not allowed in production' });
    }
    
    const { player1Id, player2Id, winnerId, gameId } = req.body;
    
    if (!player1Id || !player2Id || !gameId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['player1Id', 'player2Id', 'gameId']
      });
    }
    
    await HeadToHeadModel.updateRecord(player1Id, player2Id, winnerId, gameId);
    
    res.json({
      success: true,
      message: 'Head-to-head record updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating head-to-head record:', error);
    res.status(500).json({
      error: 'Failed to update head-to-head record',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;