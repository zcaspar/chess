import express from 'express';
import { AnalyticsModel } from '../models/Analytics';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/analytics/dashboard
 * Get dashboard summary data for authenticated user
 */
router.get('/dashboard', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user!.uid;
    
    // Check if database is available
    const { testConnection } = await import('../config/database');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      return res.status(503).json({
        error: 'Analytics feature temporarily unavailable',
        message: 'Database connection is not available.',
        data: null
      });
    }

    // Get dashboard summary
    const summary = await AnalyticsModel.getDashboardSummary(playerId);
    
    if (!summary) {
      return res.json({
        summary: {
          totalGames: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
          avgMovesPerGame: 0,
          avgGameDuration: 0,
          avgMoveTime: 0,
          lastGameDate: null,
          aiGames: 0,
          humanGames: 0
        },
        recentPerformance: [],
        difficultyBreakdown: [],
        timeControlBreakdown: [],
        openingStatistics: []
      });
    }

    // Get additional dashboard data
    const [recentPerformance, difficultyBreakdown, timeControlBreakdown, openingStatistics] = await Promise.all([
      AnalyticsModel.getRecentPerformance(playerId, 30),
      AnalyticsModel.getDifficultyBreakdown(playerId),
      AnalyticsModel.getTimeControlBreakdown(playerId),
      AnalyticsModel.getOpeningStatistics(playerId, 5)
    ]);

    res.json({
      summary,
      recentPerformance,
      difficultyBreakdown,
      timeControlBreakdown,
      openingStatistics
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch dashboard data'
    });
  }
});

/**
 * GET /api/analytics/trends
 * Get performance trends over time
 */
router.get('/trends', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user!.uid;
    const days = parseInt(req.query.days as string) || 30;
    
    // Check if database is available
    const { testConnection } = await import('../config/database');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      return res.status(503).json({
        error: 'Analytics feature temporarily unavailable',
        message: 'Database connection is not available.',
        data: []
      });
    }

    const trends = await AnalyticsModel.getRecentPerformance(playerId, days);
    
    res.json({
      trends,
      period: `${days} days`
    });

  } catch (error) {
    console.error('Error fetching trends data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch trends data'
    });
  }
});

/**
 * GET /api/analytics/breakdowns
 * Get performance breakdowns by various categories
 */
router.get('/breakdowns', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user!.uid;
    const category = req.query.category as string || 'all';
    
    // Check if database is available
    const { testConnection } = await import('../config/database');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      return res.status(503).json({
        error: 'Analytics feature temporarily unavailable',
        message: 'Database connection is not available.',
        data: {}
      });
    }

    const breakdowns: any = {};

    if (category === 'all' || category === 'difficulty') {
      breakdowns.difficulty = await AnalyticsModel.getDifficultyBreakdown(playerId);
    }

    if (category === 'all' || category === 'timeControl') {
      breakdowns.timeControl = await AnalyticsModel.getTimeControlBreakdown(playerId);
    }

    if (category === 'all' || category === 'openings') {
      breakdowns.openings = await AnalyticsModel.getOpeningStatistics(playerId, 10);
    }

    res.json({
      breakdowns,
      category
    });

  } catch (error) {
    console.error('Error fetching breakdowns data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch breakdowns data'
    });
  }
});

/**
 * GET /api/analytics/insights
 * Get insights and recommendations for the player
 */
router.get('/insights', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = req.user!.uid;
    
    // Check if database is available
    const { testConnection } = await import('../config/database');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      return res.status(503).json({
        error: 'Analytics feature temporarily unavailable',
        message: 'Database connection is not available.',
        insights: []
      });
    }

    // Get basic insights from the data
    const [summary, difficultyBreakdown, openingStats] = await Promise.all([
      AnalyticsModel.getDashboardSummary(playerId),
      AnalyticsModel.getDifficultyBreakdown(playerId),
      AnalyticsModel.getOpeningStatistics(playerId, 5)
    ]);

    const insights = [];

    if (summary) {
      // Generate insights based on data
      if (summary.totalGames >= 10) {
        if (summary.winRate > 70) {
          insights.push({
            type: 'strength',
            title: 'Strong Performance',
            description: `You have an excellent win rate of ${summary.winRate}%! Keep up the great work.`,
            confidence: 90
          });
        } else if (summary.winRate < 40) {
          insights.push({
            type: 'weakness',
            title: 'Room for Improvement',
            description: `Your win rate of ${summary.winRate}% has room for improvement. Consider focusing on fundamentals.`,
            confidence: 85
          });
        }

        // AI difficulty insights
        if (difficultyBreakdown.length > 0) {
          const strongestDifficulty = difficultyBreakdown.reduce((max, current) => 
            current.winRate > max.winRate ? current : max
          );
          
          insights.push({
            type: 'pattern',
            title: 'Strongest vs AI',
            description: `You perform best against ${strongestDifficulty.difficulty} AI with a ${strongestDifficulty.winRate}% win rate.`,
            confidence: 80
          });
        }

        // Opening insights
        if (openingStats.length > 0) {
          const bestOpening = openingStats[0];
          if (bestOpening.winRate > 60) {
            insights.push({
              type: 'strength',
              title: 'Strong Opening',
              description: `Your best opening has a ${bestOpening.winRate}% win rate in ${bestOpening.gamesPlayed} games.`,
              confidence: 75
            });
          }
        }
      } else {
        insights.push({
          type: 'recommendation',
          title: 'Play More Games',
          description: 'Play more games to get personalized insights and track your progress.',
          confidence: 100
        });
      }
    }

    res.json({
      insights,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch insights'
    });
  }
});

/**
 * POST /api/analytics/initialize
 * Initialize analytics tables (admin/development only)
 */
router.post('/initialize', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    // In production, you might want to restrict this to admin users
    await AnalyticsModel.initializeAnalyticsTables();
    
    res.json({
      message: 'Analytics tables initialized successfully'
    });

  } catch (error) {
    console.error('Error initializing analytics tables:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to initialize analytics tables'
    });
  }
});

export default router;