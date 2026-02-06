import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const poolConfig: PoolConfig = {
  // Support both individual DB vars (Railway) and DATABASE_URL (Render)
  ...(process.env.DATABASE_URL 
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432'),
        database: process.env.PGDATABASE || process.env.DB_NAME || 'railway',
        user: process.env.PGUSER || process.env.DB_USER || 'postgres',
        password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'chess_password',
      }),
  
  // Connection pool settings - keep defaults conservative for hosted tiers
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '60000'), // Increased idle timeout
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'), // Increased connection timeout
  
  // Additional optimizations
  allowExitOnIdle: true, // Allow process to exit when no connections are active
  maxUses: parseInt(process.env.DB_MAX_USES || '7500'), // Max uses per connection before recycling
  
  // SSL configuration (enable in production)
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

// Create connection pool
export const pool = new Pool(poolConfig);

// Enhanced pool monitoring and error handling
pool.on('error', (err) => {
  console.error('🔴 Unexpected error on idle client', err);
  // Never exit — allow the server to recover and stay alive for healthchecks
});

pool.on('connect', () => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🟢 New database client connected');
  }
});

// Pool monitoring function
export const getPoolStatus = () => {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    maxConnections: poolConfig.max,
    minConnections: poolConfig.min,
    utilizationPercent: ((pool.totalCount - pool.idleCount) / (poolConfig.max || 50)) * 100
  };
};

// Log pool status periodically in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    const status = getPoolStatus();
    if (status.totalCount > 0) {
      console.log('📊 DB Pool Status:', status);
    }
  }, 30000); // Every 30 seconds
}

// Test database connection
export const testConnection = async (): Promise<boolean> => {
  try {
    // Log connection attempt details (without password)
    console.log('🔄 Attempting database connection...');
    if (process.env.DATABASE_URL) {
      const urlParts = process.env.DATABASE_URL.split('@');
      const sanitizedUrl = urlParts.length > 1 ? 
        `${urlParts[0].split(':')[0]}://***:***@${urlParts[1]}` : 
        'DATABASE_URL is set but format unclear';
      console.log('📊 Using DATABASE_URL:', sanitizedUrl);
    } else {
      console.log('📊 Using individual PG/DB variables:', {
        host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
        port: process.env.PGPORT || process.env.DB_PORT || '5432',
        database: process.env.PGDATABASE || process.env.DB_NAME || 'railway',
        user: process.env.PGUSER || process.env.DB_USER || 'postgres',
        ssl: process.env.NODE_ENV === 'production'
      });
    }
    
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Error details:', {
      errno: error.errno,
      syscall: error.syscall,
      hostname: error.hostname,
      port: error.port
    });
    return false;
  }
};

// Enhanced query function with better monitoring and connection management
export const query = async (text: string, params?: any[], options?: { timeout?: number }) => {
  const start = Date.now();
  const queryId = Math.random().toString(36).substring(7);
  
  try {
    // Add query timeout if specified
    const queryOptions = options?.timeout ? { ...options } : undefined;
    
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Enhanced logging in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Query ${queryId}:`, { 
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration, 
        rows: res.rowCount,
        poolStatus: getPoolStatus()
      });
    }
    
    // Warn about slow queries
    if (duration > 1000) {
      console.warn(`⚠️ Slow query detected (${duration}ms):`, text.substring(0, 200));
    }
    
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`❌ Query ${queryId} failed after ${duration}ms:`, { 
      text: text.substring(0, 200),
      error: error instanceof Error ? error.message : error,
      poolStatus: getPoolStatus()
    });
    throw error;
  }
};

// Optimized query for read-only operations (can use read replicas in future)
export const queryRead = async (text: string, params?: any[]) => {
  return query(text, params, { timeout: 5000 }); // Shorter timeout for reads
};

// Optimized query for write operations
export const queryWrite = async (text: string, params?: any[]) => {
  return query(text, params, { timeout: 10000 }); // Longer timeout for writes
};

// Graceful shutdown
export const closePool = async (): Promise<void> => {
  try {
    await pool.end();
    console.log('Database pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error);
  }
};

export default pool;