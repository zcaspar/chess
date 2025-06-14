# Chess App Deployment - Next Steps

## Current Status ✅

### Completed:
1. ✅ Fixed chess timeout bug - game now properly ends when time runs out
2. ✅ Implemented complete multiplayer system with Socket.io
3. ✅ Created Firebase project and generated admin credentials
4. ✅ Successfully deployed backend to Railway at: https://eloquent-solace-production.up.railway.app (or similar)
5. ✅ Backend health check returning OK
6. ✅ PostgreSQL database connected and initialized

### Repository Structure:
- Main repo at `/home/caspar/Documents/Coding/Chess/chess-app`
- Backend code merged into main repository (no longer separate)
- Client firebase config moved to `client-files/` directory to avoid build issues

## Next Steps 📋

### 1. Deploy Frontend to Vercel
The user needs to:
1. Go to https://vercel.com and login with GitHub
2. Import the chess repository
3. Configure with these settings:
   - Framework: Vite
   - Root Directory: `./` (leave empty)
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Add environment variables (see below)

### 2. Environment Variables for Vercel
```bash
VITE_API_URL=https://[railway-backend-url].railway.app
VITE_SOCKET_URL=https://[railway-backend-url].railway.app
VITE_FIREBASE_API_KEY=[from Firebase console]
VITE_FIREBASE_AUTH_DOMAIN=[project-id].firebaseapp.com
VITE_FIREBASE_PROJECT_ID=[project-id]
VITE_FIREBASE_STORAGE_BUCKET=[project-id].appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=[sender-id]
VITE_FIREBASE_APP_ID=[app-id]
```

### 3. Update Backend CORS Settings
Once frontend is deployed to Vercel:
1. Go to Railway backend service → Variables
2. Update these variables:
   ```
   CORS_ORIGIN=https://[your-app].vercel.app
   FRONTEND_URL=https://[your-app].vercel.app
   ```
3. Railway will auto-redeploy

### 4. Initialize Database Tables
If not already done, run the SQL from `database/init.sql` in the PostgreSQL database.

### 5. Test Complete System
1. Visit the Vercel frontend URL
2. Create an account or sign in with Google
3. Create a game room and get the 6-character code
4. Share with a friend to test multiplayer
5. Verify moves sync in real-time

## Known Issues & Fixes

### Firebase Client File
- Moved to `client-files/firebase.client.ts` to prevent backend build errors
- Frontend needs this moved back to proper location before frontend deployment

### Database Connection
- Backend expects `DATABASE_URL` environment variable
- Railway PostgreSQL provides this automatically when services are linked

### Build Warnings
- "punycode module deprecated" - can be ignored, it's from a dependency
- "Lc0 engines not available" - expected in production, AI features limited

## File Locations
- Backend entry: `src/server.ts`
- Socket handler: `src/sockets/gameSocket.ts`
- Database config: `src/config/database.ts`
- Firebase admin: `src/config/firebase.ts`
- Frontend entry: `src/main.tsx`
- Game context: `src/contexts/GameContext.tsx`
- Socket context: `src/contexts/SocketContext.tsx`

## Commands for Testing
```bash
# Test backend health
curl https://[railway-url].railway.app/health

# Run frontend locally (after setting .env)
npm run dev

# Check Railway logs
railway logs
```

## Final Checklist
- [ ] Frontend deployed to Vercel
- [ ] Environment variables set in Vercel
- [ ] CORS updated in Railway backend
- [ ] Database tables initialized
- [ ] Multiplayer tested end-to-end
- [ ] Share game links with friends!

## Notes for Next Session
- User has Railway Hobby plan active
- Multiple Railway services were created during debugging - only PostgreSQL and backend needed
- Repository is public on GitHub
- Firebase project exists and admin credentials are in Railway variables