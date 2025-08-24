#!/usr/bin/env node

/**
 * Simple load testing script for the Chess app backend
 * Tests concurrent connections, database pool usage, and Redis performance
 */

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

// Configuration
const config = {
  host: process.env.TEST_HOST || 'localhost',
  port: process.env.TEST_PORT || 3005,
  protocol: process.env.TEST_PROTOCOL || 'http',
  concurrent: parseInt(process.env.CONCURRENT_USERS || '50'),
  duration: parseInt(process.env.TEST_DURATION || '30'), // seconds
  rampUp: parseInt(process.env.RAMP_UP || '5'), // seconds
};

const baseUrl = `${config.protocol}://${config.host}:${config.port}`;
console.log(`🚀 Starting load test against: ${baseUrl}`);
console.log(`👥 Concurrent users: ${config.concurrent}`);
console.log(`⏱️  Test duration: ${config.duration}s`);
console.log(`📈 Ramp up time: ${config.rampUp}s`);

// Statistics tracking
const stats = {
  requests: 0,
  responses: 0,
  errors: 0,
  timeouts: 0,
  latencies: [],
  startTime: null,
  endTime: null,
  concurrentConnections: 0,
  maxConcurrent: 0,
  statusCodes: {},
  healthChecks: { ok: 0, error: 0 },
  systemStatus: { ok: 0, error: 0 },
};

// Test scenarios
const scenarios = [
  {
    name: 'health_check',
    weight: 0.4,
    path: '/health',
    method: 'GET'
  },
  {
    name: 'system_status',
    weight: 0.3,
    path: '/api/system/status',
    method: 'GET'
  },
  {
    name: 'chess_engine_health',
    weight: 0.2,
    path: '/api/chess/health',
    method: 'GET'
  },
  {
    name: 'user_profile',
    weight: 0.1,
    path: '/api/users/profile',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer dummy-token-for-load-test'
    }
  }
];

// HTTP request function
function makeRequest(scenario, userId) {
  return new Promise((resolve) => {
    const requestModule = config.protocol === 'https' ? https : http;
    const startTime = performance.now();
    
    const options = {
      hostname: config.host,
      port: config.port,
      path: scenario.path,
      method: scenario.method,
      headers: {
        'User-Agent': `LoadTest-User-${userId}`,
        'Connection': 'keep-alive',
        ...scenario.headers
      },
      timeout: 10000 // 10 second timeout
    };

    stats.requests++;
    stats.concurrentConnections++;
    stats.maxConcurrent = Math.max(stats.maxConcurrent, stats.concurrentConnections);

    const req = requestModule.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = performance.now();
        const latency = endTime - startTime;
        
        stats.responses++;
        stats.concurrentConnections--;
        stats.latencies.push(latency);
        
        const statusCode = res.statusCode;
        stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;
        
        // Track specific endpoint success rates
        if (scenario.name === 'health_check') {
          if (statusCode === 200) {
            stats.healthChecks.ok++;
          } else {
            stats.healthChecks.error++;
          }
        }
        
        if (scenario.name === 'system_status') {
          if (statusCode === 200) {
            stats.systemStatus.ok++;
          } else {
            stats.systemStatus.error++;
          }
        }
        
        resolve({
          success: statusCode >= 200 && statusCode < 400,
          statusCode,
          latency,
          scenario: scenario.name,
          dataLength: data.length
        });
      });
    });

    req.on('error', (error) => {
      stats.errors++;
      stats.concurrentConnections--;
      resolve({
        success: false,
        error: error.message,
        scenario: scenario.name
      });
    });

    req.on('timeout', () => {
      stats.timeouts++;
      stats.concurrentConnections--;
      req.destroy();
      resolve({
        success: false,
        error: 'Request timeout',
        scenario: scenario.name
      });
    });

    req.setTimeout(10000);
    req.end();
  });
}

// Select random scenario based on weights
function selectScenario() {
  const random = Math.random();
  let cumulative = 0;
  
  for (const scenario of scenarios) {
    cumulative += scenario.weight;
    if (random <= cumulative) {
      return scenario;
    }
  }
  
  return scenarios[0]; // Fallback
}

// User simulation
async function simulateUser(userId) {
  const userStartTime = performance.now();
  const userStats = {
    requests: 0,
    successes: 0,
    errors: 0,
    totalLatency: 0
  };
  
  while (performance.now() - stats.startTime < config.duration * 1000) {
    const scenario = selectScenario();
    const result = await makeRequest(scenario, userId);
    
    userStats.requests++;
    if (result.success) {
      userStats.successes++;
      userStats.totalLatency += result.latency;
    } else {
      userStats.errors++;
    }
    
    // Random delay between requests (100ms to 2000ms)
    const delay = 100 + Math.random() * 1900;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  return userStats;
}

// Calculate statistics
function calculateStats() {
  if (stats.latencies.length === 0) return null;
  
  const sorted = stats.latencies.sort((a, b) => a - b);
  const duration = (stats.endTime - stats.startTime) / 1000;
  
  return {
    duration: duration.toFixed(2),
    totalRequests: stats.requests,
    totalResponses: stats.responses,
    requestsPerSecond: (stats.requests / duration).toFixed(2),
    responsesPerSecond: (stats.responses / duration).toFixed(2),
    successRate: ((stats.responses - stats.errors) / stats.requests * 100).toFixed(2),
    errorRate: (stats.errors / stats.requests * 100).toFixed(2),
    timeoutRate: (stats.timeouts / stats.requests * 100).toFixed(2),
    maxConcurrentConnections: stats.maxConcurrent,
    latency: {
      min: sorted[0].toFixed(2),
      max: sorted[sorted.length - 1].toFixed(2),
      avg: (stats.latencies.reduce((sum, lat) => sum + lat, 0) / stats.latencies.length).toFixed(2),
      p50: sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
      p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      p99: sorted[Math.floor(sorted.length * 0.99)].toFixed(2)
    },
    statusCodes: stats.statusCodes,
    endpoints: {
      healthCheck: `${stats.healthChecks.ok}/${stats.healthChecks.ok + stats.healthChecks.error} (${(stats.healthChecks.ok / (stats.healthChecks.ok + stats.healthChecks.error) * 100).toFixed(1)}%)`,
      systemStatus: `${stats.systemStatus.ok}/${stats.systemStatus.ok + stats.systemStatus.error} (${(stats.systemStatus.ok / (stats.systemStatus.ok + stats.systemStatus.error) * 100).toFixed(1)}%)`
    }
  };
}

// Progress reporter
function startProgressReporter() {
  const interval = setInterval(() => {
    if (stats.endTime) {
      clearInterval(interval);
      return;
    }
    
    const elapsed = (performance.now() - stats.startTime) / 1000;
    const progress = (elapsed / config.duration * 100).toFixed(1);
    
    console.log(`⏱️  Progress: ${progress}% | Requests: ${stats.requests} | Responses: ${stats.responses} | Errors: ${stats.errors} | Concurrent: ${stats.concurrentConnections}`);
  }, 2000);
}

// Main test function
async function runLoadTest() {
  console.log('\n📊 Starting load test...\n');
  
  stats.startTime = performance.now();
  startProgressReporter();
  
  // Create user promises with ramp-up
  const userPromises = [];
  const rampUpDelay = (config.rampUp * 1000) / config.concurrent;
  
  for (let i = 0; i < config.concurrent; i++) {
    const delay = i * rampUpDelay;
    userPromises.push(
      new Promise(resolve => {
        setTimeout(async () => {
          const userStats = await simulateUser(i + 1);
          resolve(userStats);
        }, delay);
      })
    );
  }
  
  // Wait for all users to complete
  const userResults = await Promise.all(userPromises);
  stats.endTime = performance.now();
  
  // Calculate and display results
  const results = calculateStats();
  
  console.log('\n📈 Load Test Results:');
  console.log('='.repeat(50));
  console.log(`Duration: ${results.duration}s`);
  console.log(`Total Requests: ${results.totalRequests}`);
  console.log(`Total Responses: ${results.totalResponses}`);
  console.log(`Requests/sec: ${results.requestsPerSecond}`);
  console.log(`Responses/sec: ${results.responsesPerSecond}`);
  console.log(`Success Rate: ${results.successRate}%`);
  console.log(`Error Rate: ${results.errorRate}%`);
  console.log(`Timeout Rate: ${results.timeoutRate}%`);
  console.log(`Max Concurrent: ${results.maxConcurrentConnections}`);
  
  console.log('\n⏱️ Latency Statistics:');
  console.log(`Min: ${results.latency.min}ms`);
  console.log(`Max: ${results.latency.max}ms`);
  console.log(`Avg: ${results.latency.avg}ms`);
  console.log(`P50: ${results.latency.p50}ms`);
  console.log(`P95: ${results.latency.p95}ms`);
  console.log(`P99: ${results.latency.p99}ms`);
  
  console.log('\n📡 Endpoint Success Rates:');
  console.log(`Health Check: ${results.endpoints.healthCheck}`);
  console.log(`System Status: ${results.endpoints.systemStatus}`);
  
  console.log('\n📊 Status Code Distribution:');
  Object.entries(results.statusCodes).forEach(([code, count]) => {
    console.log(`${code}: ${count} (${(count / results.totalRequests * 100).toFixed(1)}%)`);
  });
  
  // Performance assessment
  console.log('\n🎯 Performance Assessment:');
  const avgLatency = parseFloat(results.latency.avg);
  const successRate = parseFloat(results.successRate);
  const rps = parseFloat(results.responsesPerSecond);
  
  if (successRate >= 95 && avgLatency <= 500 && rps >= config.concurrent * 0.8) {
    console.log('✅ EXCELLENT - System handles load well');
  } else if (successRate >= 90 && avgLatency <= 1000 && rps >= config.concurrent * 0.6) {
    console.log('✅ GOOD - System performs adequately under load');
  } else if (successRate >= 80 && avgLatency <= 2000) {
    console.log('⚠️  FAIR - System shows signs of strain');
  } else {
    console.log('❌ POOR - System struggles under load');
  }
  
  console.log('\n🔧 Recommendations:');
  if (avgLatency > 1000) {
    console.log('- Consider database query optimization');
    console.log('- Implement Redis caching');
  }
  if (successRate < 95) {
    console.log('- Increase connection pool size');
    console.log('- Add request timeout handling');
  }
  if (rps < config.concurrent * 0.7) {
    console.log('- Consider horizontal scaling');
    console.log('- Optimize resource-intensive endpoints');
  }
}

// Run the test
runLoadTest().catch(console.error);