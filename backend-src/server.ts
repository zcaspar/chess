import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import { Lc0Engine } from './lc0Engine';
import userRoutes from './routes/users';
import gameHistoryRoutes from './routes/gameHistory';
import { GameSocketHandler } from './sockets/gameSocket';
import { testConnection } from './config/database';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3005;

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
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
      console.log(`🚀 Chess Engine Backend Server running on port ${PORT}`);
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