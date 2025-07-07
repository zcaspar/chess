#!/bin/bash

# Script to verify Railway PostgreSQL setup for Chess App

BACKEND_URL="https://chess-production-c94f.up.railway.app"

echo "🔍 Verifying Railway PostgreSQL Setup..."
echo "=================================="

# Check basic health
echo -e "\n1️⃣ Checking server health..."
HEALTH=$(curl -s "$BACKEND_URL/health")
if [ $? -eq 0 ]; then
    echo "✅ Server is running"
    echo "Response: $HEALTH" | jq '.environment, .uptime' 2>/dev/null || echo "$HEALTH"
else
    echo "❌ Server is not responding"
    exit 1
fi

# Check database connection
echo -e "\n2️⃣ Checking database connection..."
DB_HEALTH=$(curl -s "$BACKEND_URL/health/db")
if [ $? -eq 0 ]; then
    DB_STATUS=$(echo "$DB_HEALTH" | jq -r '.database' 2>/dev/null || echo "unknown")
    if [ "$DB_STATUS" = "connected" ]; then
        echo "✅ Database is connected!"
        echo "Response: $DB_HEALTH" | jq '.' 2>/dev/null || echo "$DB_HEALTH"
    else
        echo "❌ Database is not connected"
        echo "Response: $DB_HEALTH" | jq '.' 2>/dev/null || echo "$DB_HEALTH"
    fi
else
    echo "❌ Could not check database status"
fi

# Check game history functionality
echo -e "\n3️⃣ Checking game history functionality..."
GH_DEBUG=$(curl -s "$BACKEND_URL/debug/game-history")
if [ $? -eq 0 ]; then
    GH_STATUS=$(echo "$GH_DEBUG" | jq -r '.status' 2>/dev/null || echo "unknown")
    if [ "$GH_STATUS" = "ok" ]; then
        echo "✅ Game history is fully functional!"
        echo "Response: $GH_DEBUG" | jq '.' 2>/dev/null || echo "$GH_DEBUG"
    else
        echo "⚠️  Game history needs attention:"
        echo "Response: $GH_DEBUG" | jq '.' 2>/dev/null || echo "$GH_DEBUG"
    fi
else
    echo "❌ Could not check game history status"
fi

echo -e "\n=================================="
echo "📊 Summary:"
echo "- Server URL: $BACKEND_URL"
echo "- Database endpoint: $BACKEND_URL/health/db"
echo "- Debug endpoint: $BACKEND_URL/debug/game-history"
echo -e "\nNext steps:"
echo "1. If database is not connected, add PostgreSQL service in Railway"
echo "2. Connect the database to your app service via environment variables"
echo "3. Railway will automatically redeploy and initialize tables"
echo "4. Run this script again to verify setup is complete"