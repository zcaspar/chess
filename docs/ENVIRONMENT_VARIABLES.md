# Environment Variables Documentation

## Railway Backend Environment Variables

### Required Variables (Set Automatically by Railway)

When you add a PostgreSQL database to your Railway project, these variables are automatically set:

```bash
# PostgreSQL Connection (automatically provided by Railway)
DATABASE_URL=postgresql://username:password@host:port/database
PGDATABASE=railway
PGHOST=your-db-host.railway.app
PGPASSWORD=your-password
PGPORT=5432
PGUSER=postgres

# Server Configuration (already set)
PORT=3005
NODE_ENV=production
CORS_ORIGIN=https://chess-pu71.vercel.app
```

### Optional Variables

```bash
# Database Pool Configuration (defaults are usually fine)
DB_POOL_MAX=20              # Maximum connections in pool
DB_POOL_MIN=5               # Minimum connections in pool
DB_IDLE_TIMEOUT=30000       # Idle timeout in milliseconds
DB_CONNECTION_TIMEOUT=2000  # Connection timeout in milliseconds

# LC0 Server Configuration (already set)
LC0_SERVER_URL=https://web-production-4cc9.up.railway.app
```

## Vercel Frontend Environment Variables

These are already configured in your Vercel deployment:

```bash
# Backend API
REACT_APP_BACKEND_URL=https://chess-production-c94f.up.railway.app

# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=AIzaSyBAOzki5DmiL7Nt6iDYcPe34cPah0KrIhA
REACT_APP_FIREBASE_AUTH_DOMAIN=chess-multiplayer-10fa8.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=chess-multiplayer-10fa8
REACT_APP_FIREBASE_STORAGE_BUCKET=chess-multiplayer-10fa8.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=178242298678
REACT_APP_FIREBASE_APP_ID=1:178242298678:web:a6bc8d3716a47c815fc997
```

## Local Development

For local development with PostgreSQL, create a `.env` file in the root directory:

```bash
# Local PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chess_app
DB_USER=chess_user
DB_PASSWORD=chess_password

# Or use DATABASE_URL
DATABASE_URL=postgresql://chess_user:chess_password@localhost:5432/chess_app

# Development settings
NODE_ENV=development
PORT=3005
CORS_ORIGIN=http://localhost:3000
```

## Notes

1. **Railway PostgreSQL**: When you add PostgreSQL via Railway's dashboard, all database variables are automatically injected
2. **SSL Connection**: The app automatically enables SSL for production database connections
3. **Connection Pooling**: The app uses connection pooling for better performance
4. **Automatic Retry**: Database connections are retried automatically on failure