import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import { Lc0Engine } from './lc0Engine';
import userRoutes from './routes/users';
import gameHistoryRoutes from './routes/gameHistory';
import analyticsRoutes from './routes/analytics';
import analysisRoutes from './routes/analysis';
import headToHeadRoutes from './routes/headToHead';
import systemRoutes from './routes/system';
import { GameSocketHandler } from './sockets/gameSocket';
import { testConnection, getPoolStatus, closePool } from './config/database';
import { initializeRedis, RedisManager, closeRedis } from './config/redis';
import { getAllowedOrigins, createOriginValidator } from './config/cors';
import { logger } from './utils/logger';

logger.debug('🔄 Server module loading...');
logger.debug('✅ All imports loaded successfully');

// Load environment variables
dotenv.config();

logger.info('📋 Environment:', {
  NODE_ENV: process.env.NODE_ENV || 'NOT SET',
  PORT: process.env.PORT || 'NOT SET (using 3005)',
  CORS_ORIGIN: process.env.CORS_ORIGIN ? 'set' : 'NOT SET',
  DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'NOT SET',
  REDIS_URL: process.env.REDIS_URL ? 'set' : 'NOT SET',
});

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3005;

// Allowed CORS origins, shared by Socket.IO and Express (see config/cors.ts)
const allowedOrigins = getAllowedOrigins();

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: createOriginValidator(allowedOrigins, 'Socket.IO'),
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: createOriginValidator(allowedOrigins, 'Express'),
  credentials: true,
}));
app.use(express.json());

// Engine instances for different difficulties
const engines: { [key: string]: Lc0Engine | null } = {
  beginner: null,
  easy: null,
  medium: null,
  hard: null,
  expert: null
};

const WEIGHTS_PATH = '/home/caspar/Documents/Coding/Chess/lc0/lc0/build/release/weights.pb';

// Initialize engines
async function initializeEngines() {
  try {
    logger.debug('Initializing Lc0 engines...');
    
    // Only initialize engines in development or when weights file exists
    if (process.env.NODE_ENV === 'development' && require('fs').existsSync(WEIGHTS_PATH)) {
      engines.beginner = await Lc0Engine.createBeginner(WEIGHTS_PATH);
      engines.easy = await Lc0Engine.createIntermediate(WEIGHTS_PATH);
      engines.medium = await Lc0Engine.createIntermediate(WEIGHTS_PATH);
      engines.hard = await Lc0Engine.createAdvanced(WEIGHTS_PATH);
      engines.expert = await Lc0Engine.createAdvanced(WEIGHTS_PATH);
      logger.debug('All Lc0 engines initialized successfully!');
    } else {
      logger.debug('⚠️  Lc0 engines not available in production. AI vs Human mode will be limited.');
      // Set all engines to null - they'll be handled gracefully in the endpoints
      Object.keys(engines).forEach(key => engines[key] = null);
    }
  } catch (error) {
    logger.error('Failed to initialize engines:', error);
    logger.debug('⚠️  Continuing without Lc0 engines. Multiplayer will still work.');
    Object.keys(engines).forEach(key => engines[key] = null);
  }
}

// Routes
const apiRoutes: Array<[string, express.Router]> = [
  ['/api/users', userRoutes],
  ['/api/game-history', gameHistoryRoutes],
  ['/api/analytics', analyticsRoutes],
  ['/api/analysis', analysisRoutes],
  ['/api/head-to-head', headToHeadRoutes],
  ['/api/system', systemRoutes],
];
for (const [path, router] of apiRoutes) {
  app.use(path, router);
  logger.debug(`✅ Route registered: ${path}`);
}

// Health check endpoint — keep this synchronous and simple so Railway healthcheck always passes
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Detailed health check with DB/Redis status (for monitoring, not Railway healthcheck)
app.get('/health/detailed', async (req, res) => {
  try {
    const poolStatus = getPoolStatus();
    const memoryUsage = process.memoryUsage();
    const redisHealth = await RedisManager.healthCheck();

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: poolStatus.totalCount > 0,
        poolUtilization: `${poolStatus.totalCount - poolStatus.idleCount}/${poolStatus.maxConnections}`,
        waitingConnections: poolStatus.waitingCount
      },
      redis: {
        connected: redisHealth.connected,
        latency: redisHealth.latency
      },
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024)
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Database health check endpoint
app.get('/health/db', async (req, res) => {
  try {
    const { pool } = await import('./config/database');
    
    // Try a direct query to get more detailed error
    try {
      const result = await pool.query('SELECT NOW()');
      res.status(200).json({ 
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
        dbTime: result.rows[0].now
      });
    } catch (queryError: any) {
      logger.error('Database query error in health check:', queryError);
      res.status(503).json({ 
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        error: {
          message: queryError.message,
          code: queryError.code,
          errno: queryError.errno,
          syscall: queryError.syscall,
          hostname: queryError.hostname
        }
      });
    }
  } catch (error) {
    res.status(503).json({ 
      status: 'error',
      database: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Environment debug endpoint (sanitized)
app.get('/debug/env', (req, res) => {
  const hasDbUrl = !!process.env.DATABASE_URL;
  const dbUrlFormat = process.env.DATABASE_URL ? 
    (process.env.DATABASE_URL.startsWith('postgresql://') ? 'postgresql://...' : 'unknown format') : 
    'not set';
  
  res.json({
    environment: process.env.NODE_ENV || 'not set',
    port: process.env.PORT || 'not set',
    cors_origin: process.env.CORS_ORIGIN || 'not set',
    database: {
      DATABASE_URL: hasDbUrl ? dbUrlFormat : 'not set',
      PGHOST: process.env.PGHOST ? 'set' : 'not set',
      PGUSER: process.env.PGUSER || 'not set',
      PGPASSWORD: process.env.PGPASSWORD ? 'set' : 'not set',
      PGDATABASE: process.env.PGDATABASE || 'not set',
      PGPORT: process.env.PGPORT || 'not set'
    }
  });
});

// Database test endpoint
app.get('/debug/db-test', async (req, res) => {
  try {
    const { pool } = await import('./config/database');
    
    // Test basic query
    const basicTest = await pool.query('SELECT 1 as test');
    
    // Test game_history table
    let tableTest: any = { exists: false, error: null };
    try {
      const result = await pool.query('SELECT COUNT(*) as count FROM game_history');
      tableTest = { exists: true, count: result.rows[0].count, error: null };
    } catch (e: any) {
      tableTest = { exists: false, error: e.message, count: 0 };
    }
    
    // Test JSONB insert
    let jsonbTest: any = { success: false, error: null };
    try {
      const testData = { initial: 300, increment: 5 };
      const result = await pool.query(
        'SELECT $1::jsonb as test_json',
        [JSON.stringify(testData)]
      );
      jsonbTest = { 
        success: true, 
        input: testData,
        output: result.rows[0].test_json,
        outputType: typeof result.rows[0].test_json,
        error: null
      };
    } catch (e: any) {
      jsonbTest = { success: false, error: e.message, input: null, output: null, outputType: null };
    }
    
    res.json({
      basicConnection: 'ok',
      tableTest,
      jsonbTest
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Database test failed',
      message: error.message
    });
  }
});

// Game history debug endpoint
// Debug endpoint to test game history database directly
app.get('/debug/test-game-history', async (req, res) => {
  try {
    const { pool } = await import('./config/database');
    
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'game_history'
      );
    `);
    
    // Get row count
    const countResult = await pool.query('SELECT COUNT(*) FROM game_history');
    
    // Get sample row
    const sampleResult = await pool.query('SELECT * FROM game_history LIMIT 1');
    
    let sampleRow = null;
    if (sampleResult.rows.length > 0) {
      const row = sampleResult.rows[0];
      sampleRow = {
        id: row.id,
        player_id: row.player_id,
        time_control_type: typeof row.time_control,
        time_control_value: row.time_control,
        time_control_is_null: row.time_control === null,
        all_columns: Object.keys(row)
      };
    }
    
    res.json({
      status: 'ok',
      table_exists: tableCheck.rows[0].exists,
      total_rows: parseInt(countResult.rows[0].count),
      sample_row: sampleRow,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    logger.error('Debug test error:', error);
    res.status(500).json({
      error: 'Debug test failed',
      message: error.message,
      code: error.code,
      detail: error.detail
    });
  }
});

app.get('/debug/game-history', async (req, res) => {
  try {
    logger.debug('🔍 Debug: Testing game history functionality...');
    
    // Test database connection
    const { testConnection, query } = await import('./config/database');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      return res.status(503).json({
        status: 'error',
        step: 'database_connection',
        message: 'Database connection failed'
      });
    }
    
    // Test if game_history table exists
    try {
      await query("SELECT COUNT(*) FROM game_history WHERE 1=0");
      logger.debug('✅ Debug: game_history table exists');
      
      res.status(200).json({
        status: 'ok',
        steps: {
          database_connection: 'ok',
          table_exists: 'ok'
        },
        message: 'Game history functionality appears to be working'
      });
    } catch (tableError: any) {
      logger.debug('❌ Debug: game_history table does not exist');
      logger.debug('Table error:', tableError);
      
      // Try to initialize tables
      try {
        logger.debug('🔄 Debug: Attempting to initialize tables...');
        const { GameHistoryModel } = await import('./models/GameHistory');
        await GameHistoryModel.initializeTables();
        
        res.status(200).json({
          status: 'ok',
          steps: {
            database_connection: 'ok',
            table_exists: 'created',
            table_initialization: 'ok'
          },
          message: 'Game history tables were created successfully'
        });
      } catch (initError: any) {
        logger.error('❌ Debug: Failed to initialize tables:', initError);
        
        res.status(503).json({
          status: 'error',
          steps: {
            database_connection: 'ok',
            table_exists: 'no',
            table_initialization: 'failed'
          },
          error: {
            message: initError.message,
            code: initError.code,
            detail: initError.detail
          }
        });
      }
    }
  } catch (error: any) {
    logger.error('❌ Debug endpoint error:', error);
    res.status(500).json({
      status: 'error',
      step: 'unknown',
      error: error.message || 'Unknown error'
    });
  }
});

// Get best move endpoint
app.post('/api/chess/move', async (req: any, res: any) => {
  try {
    const { fen, difficulty = 'medium', timeLimit } = req.body;
    
    if (!fen) {
      return res.status(400).json({ error: 'FEN position is required' });
    }

    if (!engines[difficulty]) {
      return res.status(400).json({ error: `Invalid difficulty: ${difficulty}` });
    }

    // Validate FEN
    try {
      new Chess(fen);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid FEN position' });
    }

    const game = new Chess(fen);
    const engine = engines[difficulty];
    
    if (!engine) {
      return res.status(500).json({ error: 'Engine not available' });
    }

    logger.debug(`Getting move for ${difficulty} difficulty, FEN: ${fen}`);
    const startTime = Date.now();
    
    const move = await engine.getBestMove(game, timeLimit);
    const thinkingTime = Date.now() - startTime;
    
    if (!move) {
      return res.status(200).json({ 
        move: null, 
        message: 'No legal moves available',
        thinkingTime 
      });
    }

    logger.debug(`Engine returned move: ${move.san} (${move.from}-${move.to}) in ${thinkingTime}ms`);
    
    res.json({
      move: {
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        san: move.san,
        flags: move.flags
      },
      thinkingTime,
      difficulty
    });
    
  } catch (error) {
    logger.error('Error getting move:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Engine status endpoint
app.get('/api/chess/engines', async (req: any, res: any) => {
  try {
    const status: { [key: string]: boolean } = {};
    
    for (const [difficulty, engine] of Object.entries(engines)) {
      if (engine) {
        status[difficulty] = await engine.isEngineReady();
      } else {
        status[difficulty] = false;
      }
    }
    
    res.json({ engines: status });
  } catch (error) {
    logger.error('Error checking engine status:', error);
    res.status(500).json({ error: 'Failed to check engine status' });
  }
});

// Test endpoint for quick validation
app.post('/api/chess/test', async (req: any, res: any) => {
  try {
    const startingFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const game = new Chess(startingFEN);
    
    const engine = engines.medium;
    if (!engine) {
      return res.status(500).json({ error: 'Test engine not available' });
    }
    
    logger.debug('Running test move from starting position...');
    const move = await engine.getBestMove(game, 1000);
    
    res.json({
      success: true,
      testMove: move ? {
        from: move.from,
        to: move.to,
        san: move.san
      } : null,
      message: 'Test completed successfully'
    });
    
  } catch (error) {
    logger.error('Test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Test failed'
    });
  }
});

// Memory monitoring and cleanup
setInterval(() => {
  const memUsage = process.memoryUsage();
  const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  
  // Log memory usage periodically
  if (memUsedMB > 100) { // Log if using more than 100MB
    logger.debug(`📊 Memory usage: ${memUsedMB}MB heap, ${Math.round(memUsage.rss / 1024 / 1024)}MB RSS`);
  }
  
  // Force garbage collection if memory is high (Railway limit is typically 512MB)
  if (memUsedMB > 256 && global.gc) {
    logger.debug('🧹 Running garbage collection to free memory');
    global.gc();
  }
}, 30000); // Check every 30 seconds

// Initialize Socket.io handler
const gameSocketHandler = new GameSocketHandler(io);

// Socket.io connection handler
io.on('connection', (socket) => {
  gameSocketHandler.handleConnection(socket);
});

// Background initialization of services (DB, Redis, engines)
async function initializeServices() {
  // Test database connection (non-blocking)
  try {
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('⚠️  Warning: Database connection failed. Online multiplayer features will be limited.');
    } else {
      logger.debug('✅ Database connection successful');

      // Initialize game history tables if they don't exist
      try {
        const { GameHistoryModel } = await import('./models/GameHistory');

        // Try multiple times with delays for Railway startup timing
        let tableInitialized = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            logger.debug(`🔄 Attempt ${attempt}/3: Initializing game history tables...`);
            await GameHistoryModel.initializeTables();
            logger.debug('✅ Game history tables initialized successfully');
            tableInitialized = true;
            break;
          } catch (attemptError: any) {
            logger.error(`❌ Attempt ${attempt} failed:`, attemptError.message);
            if (attempt < 3) {
              logger.debug(`⏳ Waiting 5 seconds before retry...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
          }
        }

        if (!tableInitialized) {
          logger.error('⚠️  Failed to initialize game history tables after 3 attempts');
          logger.debug('⚠️  Game history features will be disabled until tables are created manually');
        }
      } catch (tableError) {
        logger.error('⚠️  Warning: Could not initialize game history tables:', tableError);
        logger.debug('⚠️  Game history features may not work properly.');
      }

      // Initialize analytics tables if they don't exist
      try {
        const { AnalyticsModel } = await import('./models/Analytics');

        // Try multiple times with delays for Railway startup timing
        let analyticsInitialized = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            logger.debug(`🔄 Attempt ${attempt}/3: Initializing analytics tables...`);
            await AnalyticsModel.initializeAnalyticsTables();
            logger.debug('✅ Analytics tables initialized successfully');
            analyticsInitialized = true;
            break;
          } catch (attemptError: any) {
            logger.error(`❌ Attempt ${attempt} failed:`, attemptError.message);
            if (attempt < 3) {
              logger.debug(`⏳ Waiting 5 seconds before retry...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
          }
        }

        if (!analyticsInitialized) {
          logger.error('⚠️  Failed to initialize analytics tables after 3 attempts');
          logger.debug('⚠️  Analytics features will be disabled until tables are created manually');
        }
      } catch (analyticsError) {
        logger.error('⚠️  Warning: Could not initialize analytics tables:', analyticsError);
        logger.debug('⚠️  Analytics features may not work properly.');
      }
    }
  } catch (dbError) {
    logger.error('⚠️  Database connection error:', dbError);
    logger.debug('⚠️  Continuing without database. Basic chess features will work.');
  }

  // Initialize Redis (non-blocking)
  try {
    const redisConnected = await initializeRedis();
    if (redisConnected) {
      RedisManager.setAvailable(true);
      logger.debug('✅ Redis initialization completed');
    } else {
      logger.debug('⚠️  Continuing without Redis. Session and game state will use memory storage.');
    }
  } catch (redisError) {
    logger.error('⚠️  Redis initialization error:', redisError);
    logger.debug('⚠️  Continuing without Redis. Session and game state will use memory storage.');
  }

  // Initialize engines (non-blocking)
  try {
    await initializeEngines();
    logger.debug('✅ Engine initialization completed');
  } catch (engineError) {
    logger.error('⚠️  Engine initialization error:', engineError);
    logger.debug('⚠️  Continuing without engines. Multiplayer will work without AI.');
  }

  logger.info('✅ All service initialization completed');
}

// Start server — listen FIRST so healthcheck passes, then initialize services
function startServer() {
  logger.info(`🔄 Starting HTTP server on port ${PORT}...`);
  httpServer.listen(PORT, () => {
    logger.info(`🚀 Chess Engine Backend Server running on port ${PORT}`);
    logger.debug(`💻 Health check: http://localhost:${PORT}/health`);
    logger.debug(`🧠 API endpoint: http://localhost:${PORT}/api/chess/move`);
    logger.debug(`🔌 Socket.io server ready for multiplayer connections`);
    logger.debug(`🌍 CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);

    // Initialize DB, Redis, and engines in the background after server is listening
    initializeServices().catch((error) => {
      logger.error('⚠️  Background service initialization error:', error);
    });
  });
}

startServer();

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  logger.debug(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close Redis connection
    await closeRedis();
    logger.debug('✅ Redis connection closed');
    
    // Close database pool
    await closePool();
    logger.debug('✅ Database pool closed');
    
    // Close HTTP server
    httpServer.close(() => {
      logger.debug('✅ HTTP server closed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      logger.debug('⚠️  Forced shutdown after 10 seconds');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions — log but do NOT exit (keep server alive for healthcheck)
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', error);
  // Do NOT call process.exit() — keep the server running
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // Do NOT call process.exit() — keep the server running
});