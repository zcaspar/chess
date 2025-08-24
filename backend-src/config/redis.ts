import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// Redis client configuration
const redisConfig = {
  url: process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379',
  socket: {
    connectTimeout: 5000,
    lazyConnect: true,
  },
  // Connection pool settings for better performance
  isolationPoolOptions: {
    min: 2,
    max: 10
  }
};

// Create Redis client
export let redisClient: RedisClientType;

// Initialize Redis connection
export const initializeRedis = async (): Promise<boolean> => {
  try {
    console.log('🔄 Initializing Redis connection...');
    
    redisClient = createClient(redisConfig);
    
    // Handle Redis errors
    redisClient.on('error', (err) => {
      console.error('🔴 Redis client error:', err);
    });
    
    redisClient.on('connect', () => {
      console.log('🟡 Redis client connecting...');
    });
    
    redisClient.on('ready', () => {
      console.log('🟢 Redis client ready');
    });
    
    redisClient.on('end', () => {
      console.log('🔴 Redis client disconnected');
    });
    
    redisClient.on('reconnecting', () => {
      console.log('🟡 Redis client reconnecting...');
    });
    
    // Connect to Redis
    await redisClient.connect();
    
    // Test the connection
    await redisClient.ping();
    console.log('✅ Redis connection successful');
    
    return true;
  } catch (error: any) {
    console.error('❌ Redis connection failed:', error.message);
    console.error('Redis will be disabled. Session and game state will use memory storage.');
    return false;
  }
};

// Redis utility functions
export class RedisManager {
  private static isAvailable = false;
  
  static setAvailable(available: boolean) {
    this.isAvailable = available;
  }
  
  static getAvailable(): boolean {
    return this.isAvailable && redisClient?.isReady;
  }
  
  // Session management
  static async setSession(sessionId: string, data: any, ttlSeconds: number = 3600): Promise<boolean> {
    if (!this.getAvailable()) return false;
    
    try {
      await redisClient.setEx(
        `session:${sessionId}`, 
        ttlSeconds, 
        JSON.stringify(data)
      );
      return true;
    } catch (error) {
      console.error('Redis setSession error:', error);
      return false;
    }
  }
  
  static async getSession(sessionId: string): Promise<any | null> {
    if (!this.getAvailable()) return null;
    
    try {
      const data = await redisClient.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis getSession error:', error);
      return null;
    }
  }
  
  static async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.getAvailable()) return false;
    
    try {
      await redisClient.del(`session:${sessionId}`);
      return true;
    } catch (error) {
      console.error('Redis deleteSession error:', error);
      return false;
    }
  }
  
  // Game state management
  static async setGameState(gameId: string, state: any, ttlSeconds: number = 7200): Promise<boolean> {
    if (!this.getAvailable()) return false;
    
    try {
      await redisClient.setEx(
        `game:${gameId}`, 
        ttlSeconds, 
        JSON.stringify(state)
      );
      return true;
    } catch (error) {
      console.error('Redis setGameState error:', error);
      return false;
    }
  }
  
  static async getGameState(gameId: string): Promise<any | null> {
    if (!this.getAvailable()) return null;
    
    try {
      const data = await redisClient.get(`game:${gameId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis getGameState error:', error);
      return null;
    }
  }
  
  static async deleteGameState(gameId: string): Promise<boolean> {
    if (!this.getAvailable()) return false;
    
    try {
      await redisClient.del(`game:${gameId}`);
      return true;
    } catch (error) {
      console.error('Redis deleteGameState error:', error);
      return false;
    }
  }
  
  // Player presence management
  static async setPlayerOnline(playerId: string, socketId: string, ttlSeconds: number = 300): Promise<boolean> {
    if (!this.getAvailable()) return false;
    
    try {
      await Promise.all([
        redisClient.setEx(`player:${playerId}`, ttlSeconds, socketId),
        redisClient.setEx(`socket:${socketId}`, ttlSeconds, playerId)
      ]);
      return true;
    } catch (error) {
      console.error('Redis setPlayerOnline error:', error);
      return false;
    }
  }
  
  static async getPlayerSocket(playerId: string): Promise<string | null> {
    if (!this.getAvailable()) return null;
    
    try {
      return await redisClient.get(`player:${playerId}`);
    } catch (error) {
      console.error('Redis getPlayerSocket error:', error);
      return null;
    }
  }
  
  static async getSocketPlayer(socketId: string): Promise<string | null> {
    if (!this.getAvailable()) return null;
    
    try {
      return await redisClient.get(`socket:${socketId}`);
    } catch (error) {
      console.error('Redis getSocketPlayer error:', error);
      return null;
    }
  }
  
  static async removePlayerOnline(playerId: string, socketId: string): Promise<boolean> {
    if (!this.getAvailable()) return false;
    
    try {
      await Promise.all([
        redisClient.del(`player:${playerId}`),
        redisClient.del(`socket:${socketId}`)
      ]);
      return true;
    } catch (error) {
      console.error('Redis removePlayerOnline error:', error);
      return false;
    }
  }
  
  // Statistics and monitoring
  static async incrementCounter(key: string, ttlSeconds?: number): Promise<number> {
    if (!this.getAvailable()) return 0;
    
    try {
      const count = await redisClient.incr(`counter:${key}`);
      if (ttlSeconds && count === 1) {
        await redisClient.expire(`counter:${key}`, ttlSeconds);
      }
      return count;
    } catch (error) {
      console.error('Redis incrementCounter error:', error);
      return 0;
    }
  }
  
  static async getCounter(key: string): Promise<number> {
    if (!this.getAvailable()) return 0;
    
    try {
      const value = await redisClient.get(`counter:${key}`);
      return value ? parseInt(value) : 0;
    } catch (error) {
      console.error('Redis getCounter error:', error);
      return 0;
    }
  }
  
  // Cache management
  static async setCache(key: string, data: any, ttlSeconds: number = 300): Promise<boolean> {
    if (!this.getAvailable()) return false;
    
    try {
      await redisClient.setEx(
        `cache:${key}`, 
        ttlSeconds, 
        JSON.stringify(data)
      );
      return true;
    } catch (error) {
      console.error('Redis setCache error:', error);
      return false;
    }
  }
  
  static async getCache(key: string): Promise<any | null> {
    if (!this.getAvailable()) return null;
    
    try {
      const data = await redisClient.get(`cache:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis getCache error:', error);
      return null;
    }
  }
  
  // Health check
  static async healthCheck(): Promise<{ connected: boolean; latency?: number; error?: string }> {
    if (!redisClient) {
      return { connected: false, error: 'Redis client not initialized' };
    }
    
    try {
      const start = Date.now();
      await redisClient.ping();
      const latency = Date.now() - start;
      
      return { connected: true, latency };
    } catch (error) {
      return { 
        connected: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  // Get Redis info
  static async getInfo(): Promise<any> {
    if (!this.getAvailable()) return null;
    
    try {
      const info = await redisClient.info();
      return this.parseRedisInfo(info);
    } catch (error) {
      console.error('Redis getInfo error:', error);
      return null;
    }
  }
  
  private static parseRedisInfo(infoString: string): any {
    const info: any = {};
    const lines = infoString.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        info[key] = value;
      }
    }
    
    return info;
  }
}

// Graceful shutdown
export const closeRedis = async (): Promise<void> => {
  try {
    if (redisClient?.isReady) {
      await redisClient.quit();
      console.log('Redis connection closed');
    }
  } catch (error) {
    console.error('Error closing Redis connection:', error);
  }
};

export default redisClient;