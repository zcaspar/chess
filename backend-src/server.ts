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
import { GameSocketHandler } from './sockets/gameSocket';
import { testConnection } from './config/database';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3005;

// Configure CORS to support multiple origins
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return callback(null, true);
      
      // Check if the origin is in the allowed list or matches Vercel preview pattern
      const isAllowed = allowedOrigins.some(allowed => {
        if (allowed.includes('*')) {
          // Support wildcard patterns like https://chess-pu71-*.vercel.app
          const pattern = allowed.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`);
          return regex.test(origin);
        }
        return allowed === origin;
      });
      
      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`Socket.IO CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Check if the origin is in the allowed list or matches Vercel preview pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // Support wildcard patterns like https://chess-pu71-*.vercel.app
        const pattern = allowed.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
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
    console.log('Initializing Lc0 engines...');
    
    // Only initialize engines in development or when weights file exists
    if (process.env.NODE_ENV === 'development' && require('fs').existsSync(WEIGHTS_PATH)) {
      engines.beginner = await Lc0Engine.createBeginner(WEIGHTS_PATH);
      engines.easy = await Lc0Engine.createIntermediate(WEIGHTS_PATH);
      engines.medium = await Lc0Engine.createIntermediate(WEIGHTS_PATH);
      engines.hard = await Lc0Engine.createAdvanced(WEIGHTS_PATH);
      engines.expert = await Lc0Engine.createAdvanced(WEIGHTS_PATH);
      console.log('All Lc0 engines initialized successfully!');
    } else {
      console.log('⚠️  Lc0 engines not available in production. AI vs Human mode will be limited.');
      // Set all engines to null - they'll be handled gracefully in the endpoints
      Object.keys(engines).forEach(key => engines[key] = null);
    }
  } catch (error) {
    console.error('Failed to initialize engines:', error);
    console.log('⚠️  Continuing without Lc0 engines. Multiplayer will still work.');
    Object.keys(engines).forEach(key => engines[key] = null);
  }
}

// Routes
console.log('🔗 Registering user routes...');
app.use('/api/users', userRoutes);
console.log('✅ User routes registered at /api/users');

console.log('🔗 Registering game history routes...');
app.use('/api/game-history', gameHistoryRoutes);
console.log('✅ Game history routes registered at /api/game-history');

console.log('🔗 Registering analytics routes...');
app.use('/api/analytics', analyticsRoutes);
console.log('✅ Analytics routes registered at /api/analytics');
console.log('📊 Analytics endpoints: /api/analytics/dashboard, /api/analytics/trends, /api/analytics/breakdowns');

console.log('🔗 Registering analysis routes...');
app.use('/api/analysis', analysisRoutes);
console.log('✅ Analysis routes registered at /api/analysis');
console.log('🧠 Analysis endpoints: /api/analysis/position, /api/analysis/health');

// Health check endpoint
app.get('/health', (req, res) => {
  // Fast health check - avoid any blocking operations
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
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
      console.error('Database query error in health check:', queryError);
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
    console.error('Debug test error:', error);
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
    console.log('🔍 Debug: Testing game history functionality...');
    
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
      console.log('✅ Debug: game_history table exists');
      
      res.status(200).json({
        status: 'ok',
        steps: {
          database_connection: 'ok',
          table_exists: 'ok'
        },
        message: 'Game history functionality appears to be working'
      });
    } catch (tableError: any) {
      console.log('❌ Debug: game_history table does not exist');
      console.log('Table error:', tableError);
      
      // Try to initialize tables
      try {
        console.log('🔄 Debug: Attempting to initialize tables...');
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
        console.error('❌ Debug: Failed to initialize tables:', initError);
        
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
    console.error('❌ Debug endpoint error:', error);
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

    console.log(`Getting move for ${difficulty} difficulty, FEN: ${fen}`);
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

    console.log(`Engine returned move: ${move.san} (${move.from}-${move.to}) in ${thinkingTime}ms`);
    
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
    console.error('Error getting move:', error);
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
    console.error('Error checking engine status:', error);
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
    
    console.log('Running test move from starting position...');
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
    console.error('Test failed:', error);
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
    console.log(`📊 Memory usage: ${memUsedMB}MB heap, ${Math.round(memUsage.rss / 1024 / 1024)}MB RSS`);
  }
  
  // Force garbage collection if memory is high (Railway limit is typically 512MB)
  if (memUsedMB > 256 && global.gc) {
    console.log('🧹 Running garbage collection to free memory');
    global.gc();
  }
}, 30000); // Check every 30 seconds

// Enhanced graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down server...');
  await gracefulShutdown('SIGINT');
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM from Railway, shutting down gracefully...');
  await gracefulShutdown('SIGTERM');
});

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.log('Attempting graceful shutdown...');
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('Continuing operation...');
});

async function gracefulShutdown(signal: string) {
  console.log(`Graceful shutdown initiated by ${signal}`);
  
  try {
    // Close HTTP server
    httpServer.close(() => {
      console.log('HTTP server closed');
    });
    
    // Shutdown all engines
    for (const [difficulty, engine] of Object.entries(engines)) {
      if (engine) {
        console.log(`Shutting down ${difficulty} engine...`);
        try {
          await engine.shutdown();
        } catch (error) {
          console.error(`Error shutting down ${difficulty} engine:`, error);
        }
      }
    }
    
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Initialize Socket.io handler
const gameSocketHandler = new GameSocketHandler(io);

// Socket.io connection handler
io.on('connection', (socket) => {
  gameSocketHandler.handleConnection(socket);
});

// Start server
async function startServer() {
  try {
    // Test database connection (non-blocking)
    try {
      const dbConnected = await testConnection();
      if (!dbConnected) {
        console.error('⚠️  Warning: Database connection failed. Online multiplayer features will be limited.');
      } else {
        console.log('✅ Database connection successful');
        
        // Initialize game history tables if they don't exist
        try {
          const { GameHistoryModel } = await import('./models/GameHistory');
          
          // Try multiple times with delays for Railway startup timing
          let tableInitialized = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              console.log(`🔄 Attempt ${attempt}/3: Initializing game history tables...`);
              await GameHistoryModel.initializeTables();
              console.log('✅ Game history tables initialized successfully');
              tableInitialized = true;
              break;
            } catch (attemptError: any) {
              console.error(`❌ Attempt ${attempt} failed:`, attemptError.message);
              if (attempt < 3) {
                console.log(`⏳ Waiting 5 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
            }
          }
          
          if (!tableInitialized) {
            console.error('⚠️  Failed to initialize game history tables after 3 attempts');
            console.log('⚠️  Game history features will be disabled until tables are created manually');
          }
        } catch (tableError) {
          console.error('⚠️  Warning: Could not initialize game history tables:', tableError);
          console.log('⚠️  Game history features may not work properly.');
        }
        
        // Initialize analytics tables if they don't exist
        try {
          const { AnalyticsModel } = await import('./models/Analytics');
          
          // Try multiple times with delays for Railway startup timing
          let analyticsInitialized = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              console.log(`🔄 Attempt ${attempt}/3: Initializing analytics tables...`);
              await AnalyticsModel.initializeAnalyticsTables();
              console.log('✅ Analytics tables initialized successfully');
              analyticsInitialized = true;
              break;
            } catch (attemptError: any) {
              console.error(`❌ Attempt ${attempt} failed:`, attemptError.message);
              if (attempt < 3) {
                console.log(`⏳ Waiting 5 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
            }
          }
          
          if (!analyticsInitialized) {
            console.error('⚠️  Failed to initialize analytics tables after 3 attempts');
            console.log('⚠️  Analytics features will be disabled until tables are created manually');
          }
        } catch (analyticsError) {
          console.error('⚠️  Warning: Could not initialize analytics tables:', analyticsError);
          console.log('⚠️  Analytics features may not work properly.');
        }
      }
    } catch (dbError) {
      console.error('⚠️  Database connection error:', dbError);
      console.log('⚠️  Continuing without database. Basic chess features will work.');
    }
    
    // Initialize engines (non-blocking)
    try {
      await initializeEngines();
      console.log('✅ Engine initialization completed');
    } catch (engineError) {
      console.error('⚠️  Engine initialization error:', engineError);
      console.log('⚠️  Continuing without engines. Multiplayer will work without AI.');
    }
    
    // Always start the HTTP server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Chess Engine Backend Server with PostgreSQL running on port ${PORT}`);
      console.log(`💻 Health check: http://localhost:${PORT}/health`);
      console.log(`🧠 API endpoint: http://localhost:${PORT}/api/chess/move`);
      console.log(`🔧 Test endpoint: http://localhost:${PORT}/api/chess/test`);
      console.log(`🔌 Socket.io server ready for multiplayer connections`);
      console.log(`🌍 CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
    });
  } catch (error) {
    console.error('Critical server startup error:', error);
    
    // Try to start server anyway for health checks
    try {
      httpServer.listen(PORT, () => {
        console.log(`🚨 Emergency server started on port ${PORT} (limited functionality)`);
        console.log(`💻 Health check available: http://localhost:${PORT}/health`);
      });
    } catch (emergencyError) {
      console.error('Failed to start emergency server:', emergencyError);
      process.exit(1);
    }
  }
}

startServer();