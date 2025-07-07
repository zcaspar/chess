import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const poolConfig: PoolConfig = {
  // Support both individual DB vars (Railway) and DATABASE_URL (Render)
  ...(process.env.DATABASE_URL 
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'chess_app',
        user: process.env.DB_USER || 'chess_user',
        password: process.env.DB_PASSWORD || 'chess_password',
      }),
  
  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX || '20'), // Maximum number of connections
  min: parseInt(process.env.DB_POOL_MIN || '5'),  // Minimum number of connections
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
  
  // SSL configuration (enable in production)
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

// Create connection pool
export const pool = new Pool(poolConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

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
      console.log('📊 Using individual DB variables:', {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || '5432',
        database: process.env.DB_NAME || 'chess_app',
        user: process.env.DB_USER || 'chess_user',
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

// Helper function to execute queries
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    
    return res;
  } catch (error) {
    console.error('Database query error:', { text, error });
    throw error;
  }
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