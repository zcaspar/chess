#!/bin/bash

# Load Test Runner for Chess App Backend
# Usage: ./run-load-test.sh [concurrent-users] [duration] [host]

# Default values
CONCURRENT_USERS=${1:-20}
TEST_DURATION=${2:-30}
TEST_HOST=${3:-"localhost"}
TEST_PORT=${4:-3005}
TEST_PROTOCOL=${5:-"http"}

echo "🚀 Chess App Load Test Runner"
echo "================================"
echo "Host: $TEST_PROTOCOL://$TEST_HOST:$TEST_PORT"
echo "Concurrent Users: $CONCURRENT_USERS"
echo "Duration: $TEST_DURATION seconds"
echo "Ramp Up: 5 seconds"
echo ""

# Check if server is running
echo "🔍 Checking if server is accessible..."
if curl -f -s "$TEST_PROTOCOL://$TEST_HOST:$TEST_PORT/health" > /dev/null; then
    echo "✅ Server is responding"
else
    echo "❌ Server is not accessible at $TEST_PROTOCOL://$TEST_HOST:$TEST_PORT"
    echo "Please start the server first"
    exit 1
fi

# Get baseline system status
echo "📊 Getting baseline system status..."
BASELINE=$(curl -s "$TEST_PROTOCOL://$TEST_HOST:$TEST_PORT/api/system/status" | jq -r '.memory.heapUsed, .database.pool.utilizationPercent, .redis.connected' 2>/dev/null)
echo "Memory (MB): $(echo $BASELINE | cut -d' ' -f1)"
echo "DB Pool Utilization: $(echo $BASELINE | cut -d' ' -f2)%"
echo "Redis Connected: $(echo $BASELINE | cut -d' ' -f3)"
echo ""

# Run the load test
echo "🎯 Starting load test..."
CONCURRENT_USERS=$CONCURRENT_USERS \
TEST_DURATION=$TEST_DURATION \
TEST_HOST=$TEST_HOST \
TEST_PORT=$TEST_PORT \
TEST_PROTOCOL=$TEST_PROTOCOL \
RAMP_UP=5 \
node $(dirname "$0")/load-test.js

# Get post-test system status
echo ""
echo "📊 Post-test system status..."
POSTTEST=$(curl -s "$TEST_PROTOCOL://$TEST_HOST:$TEST_PORT/api/system/status" | jq -r '.memory.heapUsed, .database.pool.utilizationPercent, .redis.connected' 2>/dev/null)
echo "Memory (MB): $(echo $POSTTEST | cut -d' ' -f1)"
echo "DB Pool Utilization: $(echo $POSTTEST | cut -d' ' -f2)%"
echo "Redis Connected: $(echo $POSTTEST | cut -d' ' -f3)"

echo ""
echo "✅ Load test completed!"
echo ""
echo "💡 Test different loads:"
echo "  Light:  ./run-load-test.sh 10 30"
echo "  Medium: ./run-load-test.sh 50 60"
echo "  Heavy:  ./run-load-test.sh 100 60"
echo ""
echo "🌐 Test against production:"
echo "  ./run-load-test.sh 20 30 chess-production-c94f.up.railway.app 443 https"