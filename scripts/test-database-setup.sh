#!/bin/bash

# Comprehensive test script for Railway PostgreSQL setup

BACKEND_URL="https://chess-production-c94f.up.railway.app"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Testing Railway PostgreSQL Setup"
echo "==================================="
echo "Backend URL: $BACKEND_URL"
echo ""

# Function to check status
check_status() {
    if [ "$1" == "true" ] || [ "$1" == "ok" ] || [ "$1" == "connected" ]; then
        echo -e "${GREEN}✅ $2${NC}"
        return 0
    else
        echo -e "${RED}❌ $2${NC}"
        return 1
    fi
}

# 1. Check server health
echo "1️⃣ Checking server health..."
HEALTH=$(curl -s "$BACKEND_URL/health")
if [ $? -eq 0 ]; then
    UPTIME=$(echo "$HEALTH" | jq -r '.uptime' 2>/dev/null || echo "unknown")
    ENV=$(echo "$HEALTH" | jq -r '.environment' 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✅ Server is running${NC}"
    echo "   - Environment: $ENV"
    echo "   - Uptime: ${UPTIME}s"
else
    echo -e "${RED}❌ Server is not responding${NC}"
    exit 1
fi

# 2. Check environment variables
echo -e "\n2️⃣ Checking environment variables..."
ENV_DATA=$(curl -s "$BACKEND_URL/debug/env")
if [ $? -eq 0 ]; then
    DB_URL=$(echo "$ENV_DATA" | jq -r '.database.DATABASE_URL' 2>/dev/null)
    PG_HOST=$(echo "$ENV_DATA" | jq -r '.database.PGHOST' 2>/dev/null)
    PG_USER=$(echo "$ENV_DATA" | jq -r '.database.PGUSER' 2>/dev/null)
    PG_PASS=$(echo "$ENV_DATA" | jq -r '.database.PGPASSWORD' 2>/dev/null)
    
    echo "Environment variables status:"
    if [ "$DB_URL" != "not set" ]; then
        echo -e "${GREEN}✅ DATABASE_URL is configured ($DB_URL)${NC}"
    else
        echo -e "${RED}❌ DATABASE_URL is not set${NC}"
    fi
    
    if [ "$PG_HOST" == "set" ]; then
        echo -e "${GREEN}✅ PGHOST is configured${NC}"
    else
        echo -e "${YELLOW}⚠️  PGHOST is not set (optional if DATABASE_URL is set)${NC}"
    fi
    
    if [ "$PG_USER" != "not set" ]; then
        echo -e "${GREEN}✅ PGUSER is configured: $PG_USER${NC}"
    else
        echo -e "${YELLOW}⚠️  PGUSER is not set (optional if DATABASE_URL is set)${NC}"
    fi
    
    if [ "$PG_PASS" == "set" ]; then
        echo -e "${GREEN}✅ PGPASSWORD is configured${NC}"
    else
        echo -e "${YELLOW}⚠️  PGPASSWORD is not set (optional if DATABASE_URL is set)${NC}"
    fi
else
    echo -e "${RED}❌ Could not check environment variables${NC}"
fi

# 3. Check database connection
echo -e "\n3️⃣ Testing database connection..."
DB_HEALTH=$(curl -s "$BACKEND_URL/health/db")
if [ $? -eq 0 ]; then
    DB_STATUS=$(echo "$DB_HEALTH" | jq -r '.database' 2>/dev/null || echo "unknown")
    if [ "$DB_STATUS" == "connected" ]; then
        echo -e "${GREEN}✅ Database is connected!${NC}"
    else
        echo -e "${RED}❌ Database is not connected${NC}"
        echo "   Status: $DB_STATUS"
    fi
else
    echo -e "${RED}❌ Could not check database connection${NC}"
fi

# 4. Check game history functionality
echo -e "\n4️⃣ Testing game history functionality..."
GH_DEBUG=$(curl -s "$BACKEND_URL/debug/game-history")
if [ $? -eq 0 ]; then
    GH_STATUS=$(echo "$GH_DEBUG" | jq -r '.status' 2>/dev/null || echo "unknown")
    if [ "$GH_STATUS" == "ok" ]; then
        echo -e "${GREEN}✅ Game history is fully functional!${NC}"
        TABLE_STATUS=$(echo "$GH_DEBUG" | jq -r '.steps.table_exists' 2>/dev/null)
        if [ "$TABLE_STATUS" == "ok" ]; then
            echo -e "${GREEN}   ✓ Game history table exists${NC}"
        elif [ "$TABLE_STATUS" == "created" ]; then
            echo -e "${GREEN}   ✓ Game history table was just created${NC}"
        fi
    else
        echo -e "${RED}❌ Game history is not working${NC}"
        STEP=$(echo "$GH_DEBUG" | jq -r '.step' 2>/dev/null)
        MESSAGE=$(echo "$GH_DEBUG" | jq -r '.message' 2>/dev/null)
        echo "   - Failed at step: $STEP"
        echo "   - Message: $MESSAGE"
        
        # Check error details
        ERROR_MSG=$(echo "$GH_DEBUG" | jq -r '.error.message' 2>/dev/null)
        ERROR_CODE=$(echo "$GH_DEBUG" | jq -r '.error.code' 2>/dev/null)
        if [ "$ERROR_MSG" != "null" ] && [ -n "$ERROR_MSG" ]; then
            echo "   - Error: $ERROR_MSG"
            [ "$ERROR_CODE" != "null" ] && echo "   - Error code: $ERROR_CODE"
        fi
    fi
else
    echo -e "${RED}❌ Could not check game history status${NC}"
fi

# 5. Test saving a game (requires auth token)
echo -e "\n5️⃣ Quick connectivity test..."
TEST_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/game-history" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer test-token" \
    -d '{"test": true}')

if echo "$TEST_RESPONSE" | grep -q "Invalid token"; then
    echo -e "${GREEN}✅ API endpoint is reachable (auth required)${NC}"
elif echo "$TEST_RESPONSE" | grep -q "temporarily unavailable"; then
    echo -e "${YELLOW}⚠️  API endpoint reachable but database not configured${NC}"
else
    echo -e "${YELLOW}⚠️  Unexpected API response${NC}"
fi

# Summary
echo -e "\n==================================="
echo "📊 SUMMARY:"
echo ""

# Determine overall status
if [ "$DB_URL" != "not set" ] && [ "$DB_STATUS" == "connected" ] && [ "$GH_STATUS" == "ok" ]; then
    echo -e "${GREEN}🎉 Everything is working! Game history is fully functional.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Play a game on https://chess-pu71.vercel.app"
    echo "2. Check the Game History tab to see your saved games"
    echo "3. Click Replay to step through past games"
elif [ "$DB_URL" != "not set" ] && [ "$DB_STATUS" != "connected" ]; then
    echo -e "${YELLOW}⚠️  Database URL is set but connection failed.${NC}"
    echo ""
    echo "Possible issues:"
    echo "1. DATABASE_URL format might be incorrect"
    echo "2. Database service might not be running"
    echo "3. Network/firewall issues"
    echo ""
    echo "Try:"
    echo "1. Verify DATABASE_URL starts with 'postgresql://'"
    echo "2. Check if PostgreSQL service is running in Railway"
    echo "3. Redeploy the application"
elif [ "$DB_URL" == "not set" ]; then
    echo -e "${RED}❌ Database environment variables are not configured.${NC}"
    echo ""
    echo "Required steps in Railway:"
    echo "1. Go to your app service Variables tab"
    echo "2. Add DATABASE_URL with your PostgreSQL connection string"
    echo "3. Save/Apply the variables"
    echo "4. Redeploy the application"
    echo "5. Run this test again"
else
    echo -e "${YELLOW}⚠️  Partial setup detected. Check the details above.${NC}"
fi

echo ""
echo "Run this script again after making changes to verify the setup."