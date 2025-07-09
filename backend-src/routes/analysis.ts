import express from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

/**
 * POST /api/analysis/position
 * Analyze a chess position using LC0 engine
 */
router.post('/position', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { fen, depth = 15 } = req.body;
    
    if (!fen) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'FEN position is required'
      });
    }

    // Check if LC0 server is available
    const LC0_SERVER_URL = process.env.LC0_SERVER_URL || 'https://web-production-4cc9.up.railway.app';
    
    try {
      // Call LC0 server for best move analysis
      const analysisResponse = await fetch(`${LC0_SERVER_URL}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fen,
          difficulty: 'expert' // Use expert level for analysis
        }),
        timeout: 30000 // 30 second timeout
      });

      if (!analysisResponse.ok) {
        throw new Error(`LC0 server responded with ${analysisResponse.status}: ${analysisResponse.statusText}`);
      }

      const analysisData = await analysisResponse.json();
      
      // Format the response for frontend consumption
      const formattedAnalysis = {
        position: fen,
        engine: 'LC0',
        depth: depth,
        analysisTime: analysisData.responseTime || 0,
        evaluation: null, // LC0 move endpoint doesn't provide evaluation
        bestMove: analysisData.move || null,
        recommendation: analysisData.move ? `Best move: ${analysisData.move.uci}` : null,
        analysisDate: new Date().toISOString()
      };

      res.json({
        success: true,
        analysis: formattedAnalysis
      });

    } catch (engineError) {
      console.warn('LC0 engine unavailable, providing fallback analysis:', engineError);
      
      // Fallback: Provide basic position information
      const fallbackAnalysis = {
        position: fen,
        engine: 'Fallback',
        depth: 0,
        analysisTime: 0,
        evaluation: null,
        bestMove: null,
        recommendation: null,
        analysisDate: new Date().toISOString(),
        message: 'LC0 engine temporarily unavailable. Analysis not available.'
      };

      res.json({
        success: true,
        analysis: fallbackAnalysis,
        warning: 'LC0 engine unavailable'
      });
    }

  } catch (error) {
    console.error('Error analyzing position:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to analyze position'
    });
  }
});

/**
 * GET /api/analysis/health
 * Check if analysis service is working
 */
router.get('/health', async (req, res) => {
  try {
    const LC0_SERVER_URL = process.env.LC0_SERVER_URL || 'https://web-production-4cc9.up.railway.app';
    
    const healthResponse = await fetch(`${LC0_SERVER_URL}/health`, {
      timeout: 5000
    });

    const isLC0Available = healthResponse.ok;
    
    res.json({
      status: 'ok',
      lc0Available: isLC0Available,
      lc0Url: LC0_SERVER_URL
    });

  } catch (error) {
    res.json({
      status: 'ok',
      lc0Available: false,
      error: 'LC0 server unreachable'
    });
  }
});

export default router;