import express from 'express';
import { getPoolStatus } from '../config/database';
import { RedisManager } from '../config/redis';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/system/status
 * Get system status including database pool metrics
 */
router.get('/status', async (req, res) => {
  try {
    const poolStatus = getPoolStatus();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    const redisHealth = await RedisManager.healthCheck();
    
    // Convert memory usage to MB for readability
    const memoryMB = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024)
    };
    
    const systemStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptime),
        formatted: formatUptime(uptime)
      },
      memory: {
        usage: memoryMB,
        heapUtilization: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
      },
      database: {
        pool: poolStatus,
        status: poolStatus.totalCount > 0 ? 'connected' : 'disconnected'
      },
      redis: {
        connected: redisHealth.connected,
        latency: redisHealth.latency,
        error: redisHealth.error
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    res.json(systemStatus);
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get system status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/system/metrics
 * Get detailed system metrics (authenticated endpoint)
 */
router.get('/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    // Only allow admins to view detailed metrics (for now, any authenticated user)
    const poolStatus = getPoolStatus();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    const redisHealth = await RedisManager.healthCheck();
    const redisInfo = await RedisManager.getInfo();
    
    // Get CPU usage (basic implementation)
    const cpuUsage = process.cpuUsage();
    
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: uptime,
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
        cpuUsage: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      },
      memory: {
        total: memoryUsage,
        heapUtilization: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        external: memoryUsage.external
      },
      database: {
        pool: poolStatus,
        connectionEfficiency: poolStatus.totalCount > 0 ? 
          (poolStatus.totalCount - poolStatus.waitingCount) / poolStatus.totalCount : 0
      },
      redis: {
        health: redisHealth,
        info: redisInfo ? {
          version: redisInfo.redis_version,
          uptime: redisInfo.uptime_in_seconds,
          connected_clients: redisInfo.connected_clients,
          used_memory: redisInfo.used_memory,
          used_memory_human: redisInfo.used_memory_human,
          keyspace: redisInfo.db0 || 'No keys'
        } : null
      },
      process: {
        pid: process.pid,
        version: process.version,
        title: process.title,
        argv: process.argv
      }
    };
    
    res.json(metrics);
  } catch (error) {
    console.error('Error getting system metrics:', error);
    res.status(500).json({
      error: 'Failed to get system metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/system/gc
 * Manually trigger garbage collection (development only)
 */
router.post('/gc', async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Garbage collection not allowed in production' });
    }
    
    const beforeMemory = process.memoryUsage();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      const afterMemory = process.memoryUsage();
      
      res.json({
        success: true,
        message: 'Garbage collection triggered',
        memory: {
          before: {
            heapUsed: Math.round(beforeMemory.heapUsed / 1024 / 1024),
            heapTotal: Math.round(beforeMemory.heapTotal / 1024 / 1024)
          },
          after: {
            heapUsed: Math.round(afterMemory.heapUsed / 1024 / 1024),
            heapTotal: Math.round(afterMemory.heapTotal / 1024 / 1024)
          },
          freed: Math.round((beforeMemory.heapUsed - afterMemory.heapUsed) / 1024 / 1024)
        }
      });
    } else {
      res.json({
        success: false,
        message: 'Garbage collection not available (run with --expose-gc flag)'
      });
    }
  } catch (error) {
    console.error('Error triggering garbage collection:', error);
    res.status(500).json({
      error: 'Failed to trigger garbage collection',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper function to format uptime
function formatUptime(uptime: number): string {
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  
  return parts.join(' ') || '0s';
}

export default router;