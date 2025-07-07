# Railway PostgreSQL Setup Guide for Chess App

This guide will help you add PostgreSQL to your Railway deployment to enable game history persistence.

## Step 1: Add PostgreSQL to Railway

1. Go to your Railway project dashboard at https://railway.app
2. Click on your project (chess-production-c94f)
3. Click "New Service" or the "+" button
4. Select "Database" → "Add PostgreSQL"
5. Railway will automatically provision a PostgreSQL database

## Step 2: Connect Database to Your App

1. In your Railway project, click on your main app service (chess-production-c94f)
2. Go to the "Variables" tab
3. Click "Add Variable Reference"
4. Select your PostgreSQL service
5. Railway will automatically add these environment variables:
   - `DATABASE_URL` (full connection string)
   - `PGDATABASE`
   - `PGHOST`
   - `PGPASSWORD`
   - `PGPORT`
   - `PGUSER`

## Step 3: Configure Database Connection

The app is already configured to use these environment variables automatically. The database configuration in `backend-src/config/database.ts` supports both:
- Individual PostgreSQL variables (PGHOST, PGUSER, etc.)
- DATABASE_URL connection string

## Step 4: Deploy and Initialize

1. Once you've added the PostgreSQL service and connected it, Railway will automatically redeploy your app
2. The app will automatically create the required tables on startup
3. Check the deployment logs to confirm table creation

## Step 5: Verify Setup

After deployment, you can verify the setup by:

1. Checking the health endpoint:
   ```bash
   curl https://chess-production-c94f.up.railway.app/health/db
   ```

2. Checking the debug endpoint:
   ```bash
   curl https://chess-production-c94f.up.railway.app/debug/game-history
   ```

Both should return successful responses indicating the database is connected.

## Troubleshooting

If tables aren't created automatically:

1. Check Railway logs for any error messages
2. The app will retry table creation 3 times with 5-second delays
3. Tables are also created on-demand when first game is saved

## Database Schema

The game_history table will be automatically created with:
- Game metadata (players, result, outcome)
- Full PGN for replay functionality  
- Time controls and duration
- Timestamps and indexes for efficient queries

## Expected Result

Once setup is complete:
- Games will automatically save when they end
- Game History tab will show past games
- Replay functionality will be available
- All database errors will be resolved