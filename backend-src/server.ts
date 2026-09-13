import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp, initializeEngines } from './app';
import { GameSocketHandler } from './sockets/gameSocket';
import { testConnection, closePool } from './config/database';
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

const app = createApp();
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
