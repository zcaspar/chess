# Chess Backend Deployment Guide

## Railway Deployment

### Prerequisites
1. GitHub account with this repository
2. Railway account (https://railway.app)
3. Firebase project with Admin SDK credentials

### Environment Variables for Railway

Set these environment variables in Railway dashboard:

```bash
# Server Config
PORT=3005
NODE_ENV=production

# Firebase Admin SDK (from Firebase Console > Project Settings > Service Accounts)
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# CORS and Frontend URL (update after Vercel deployment)
CORS_ORIGIN=https://your-chess-app.vercel.app
FRONTEND_URL=https://your-chess-app.vercel.app

# Database (Railway PostgreSQL addon)
# These will be automatically set by Railway when you add PostgreSQL
# DB_HOST=containers-us-west-xxx.railway.app
# DB_PORT=5432
# DB_NAME=railway
# DB_USER=postgres
# DB_PASSWORD=auto_generated_password

# Security
JWT_SECRET=your_very_long_and_random_jwt_secret_here

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Deployment Steps

1. **Connect to Railway:**
   - Go to https://railway.app
   - Sign up/Login with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your chess repository
   - Choose the `chess-backend` folder

2. **Add PostgreSQL Database:**
   - In Railway dashboard, click "Add Service" → "Database" → "PostgreSQL"
   - This will automatically set database environment variables

3. **Configure Environment Variables:**
   - Go to your service → Variables tab
   - Add all the environment variables listed above
   - **Important**: Get Firebase credentials from Firebase Console

4. **Initialize Database:**
   - Once PostgreSQL is running, connect to it
   - Run the SQL from `database/init.sql` to create tables

5. **Deploy:**
   - Railway will automatically deploy when you push to GitHub
   - Check the deployment logs for any issues

### Getting Firebase Credentials

1. Go to Firebase Console → Your Project
2. Settings → Service Accounts
3. Click "Generate New Private Key"
4. Download the JSON file
5. Use the values from JSON:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (keep the \n characters)
   - `client_email` → `FIREBASE_CLIENT_EMAIL`

### Health Check

Once deployed, your backend will be available at:
`https://your-service-name.railway.app`

Test the health endpoint:
`https://your-service-name.railway.app/health`