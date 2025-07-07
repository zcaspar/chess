import express from 'express';
import { GameHistoryModel, SaveGameRequest } from '../models/GameHistory';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

/**
 * POST /api/game-history
 * Save a completed game to history
 */
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    // First check if database is available
    const { testConnection } = await import('../config/database');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      return res.status(503).json({
        error: 'Game history feature temporarily unavailable',
        message: 'Database connection is not available. Your game was completed but not saved to history.',
        details: 'Game history will be available once database service is configured.'
      });
    }

    const {
      gameId,
      opponentId,
      opponentName,
      playerColor,
      gameResult,
      gameOutcome,
      finalFen,
      pgn,
      moveCount,
      gameDuration,
      timeControl,
      gameMode,
      aiDifficulty
    } = req.body;

    // Validate required fields
    if (!gameId || !opponentName || !playerColor || !gameResult || !gameOutcome || !finalFen || !pgn || moveCount === undefined || !gameMode) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['gameId', 'opponentName', 'playerColor', 'gameResult', 'gameOutcome', 'finalFen', 'pgn', 'moveCount', 'gameMode']
      });
    }

    // Validate enums
    if (!['w', 'b'].includes(playerColor)) {
      return res.status(400).json({ error: 'Invalid playerColor. Must be "w" or "b"' });
    }

    if (!['win', 'loss', 'draw'].includes(gameOutcome)) {
      return res.status(400).json({ error: 'Invalid gameOutcome. Must be "win", "loss", or "draw"' });
    }

    if (!['human-vs-human', 'human-vs-ai'].includes(gameMode)) {
      return res.status(400).json({ error: 'Invalid gameMode. Must be "human-vs-human" or "human-vs-ai"' });
    }

    const gameData: SaveGameRequest = {
      playerId: req.user!.uid, // From auth middleware
      gameId,
      opponentId,
      opponentName,
      playerColor,
      gameResult,
      gameOutcome,
      finalFen,
      pgn,
      moveCount,
      gameDuration,
      timeControl,
      gameMode,
      aiDifficulty
    };

    const savedGame = await GameHistoryModel.saveGame(gameData);
    
    res.status(201).json({
      success: true,
      message: 'Game saved to history successfully',
      game: savedGame
    });

  } catch (error: any) {
    console.error('Error saving game to history:', error);
    
    // Check if it's a table doesn't exist error
    if (error.code === '42P01') {
      res.status(503).json({
        error: 'Database tables not initialized',
        message: 'Game history tables are being created. Please try again in a moment.',
        details: error.message
      });
      return;
    }
    
    // Log the full error for debugging
    console.error('Full error details:', {
      code: error.code,
      message: error.message,
      detail: error.detail,
      stack: error.stack,
      hint: error.hint,
      position: error.position,
      internalPosition: error.internalPosition,
      internalQuery: error.internalQuery,
      where: error.where,
      schema: error.schema,
      table: error.table,
      column: error.column,
      dataType: error.dataType,
      constraint: error.constraint
    });
    
    // Special handling for JSONB errors
    if (error.message && error.message.includes('JSON')) {
      console.error('JSONB error detected. Request body:', req.body);
      console.error('timeControl value:', req.body.timeControl);
      console.error('timeControl type:', typeof req.body.timeControl);
    }
    
    res.status(500).json({
      error: 'Failed to save game to history',
      message: error.message || 'Unknown error',
      code: error.code,
      detail: error.detail
    });
  }
});

/**
 * GET /api/game-history
 * Get game history for the authenticated user
 */
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    console.log('📖 Fetching game history for user:', req.user?.uid);
    
    // First check if database is available
    const { testConnection } = await import('../config/database');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      return res.status(503).json({
        error: 'Game history feature temporarily unavailable',
        message: 'Database connection is not available. Game history will be available once database service is configured.',
        games: [],
        pagination: { limit: 0, offset: 0, count: 0 }
      });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Validate query parameters
    if (limit > 100) {
      return res.status(400).json({ error: 'Limit cannot exceed 100' });
    }

    if (limit < 1 || offset < 0) {
      return res.status(400).json({ error: 'Invalid limit or offset' });
    }

    const games = await GameHistoryModel.getPlayerHistory(req.user!.uid, limit, offset);
    
    res.json({
      success: true,
      games,
      pagination: {
        limit,
        offset,
        count: games.length
      }
    });

  } catch (error: any) {
    console.error('Error fetching game history:', error);
    
    // Check if it's a table doesn't exist error
    if (error.code === '42P01') {
      res.status(503).json({
        error: 'Game history feature is being set up',
        message: 'Database tables are being initialized. Please try again in a moment.'
      });
      return;
    }
    
    res.status(500).json({
      error: 'Failed to fetch game history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/game-history/:id
 * Get a specific game by ID for replay
 */
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const gameId = parseInt(req.params.id);

    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }

    const game = await GameHistoryModel.getGameById(gameId, req.user!.uid);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({
      success: true,
      game
    });

  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({
      error: 'Failed to fetch game',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/game-history/stats/summary
 * Get statistics summary for the authenticated user
 */
router.get('/stats/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const stats = await GameHistoryModel.getPlayerStats(req.user!.uid);
    
    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({
      error: 'Failed to fetch player statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/game-history/:id
 * Delete a game from history
 */
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const gameId = parseInt(req.params.id);

    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }

    const deleted = await GameHistoryModel.deleteGame(gameId, req.user!.uid);

    if (!deleted) {
      return res.status(404).json({ error: 'Game not found or already deleted' });
    }

    res.json({
      success: true,
      message: 'Game deleted from history successfully'
    });

  } catch (error) {
    console.error('Error deleting game:', error);
    res.status(500).json({
      error: 'Failed to delete game',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/game-history/admin/recent
 * Get recent games across all players (admin only)
 */
router.get('/admin/recent', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    // TODO: Add admin role check here when role system is implemented
    const limit = parseInt(req.query.limit as string) || 20;

    if (limit > 100) {
      return res.status(400).json({ error: 'Limit cannot exceed 100' });
    }

    const games = await GameHistoryModel.getRecentGames(limit);
    
    res.json({
      success: true,
      games,
      count: games.length
    });

  } catch (error) {
    console.error('Error fetching recent games:', error);
    res.status(500).json({
      error: 'Failed to fetch recent games',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/game-history/init-tables
 * Initialize database tables (development helper)
 */
router.post('/init-tables', async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Table initialization not allowed in production' });
    }

    await GameHistoryModel.initializeTables();
    
    res.json({
      success: true,
      message: 'Database tables initialized successfully'
    });

  } catch (error) {
    console.error('Error initializing tables:', error);
    res.status(500).json({
      error: 'Failed to initialize tables',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;