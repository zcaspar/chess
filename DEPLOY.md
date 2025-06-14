# Chess Frontend Deployment Guide

## Vercel Deployment

### Prerequisites
1. GitHub account with this repository
2. Vercel account (https://vercel.com)
3. Backend deployed to Railway

### Environment Variables for Vercel

Set these in Vercel dashboard → Project Settings → Environment Variables:

```bash
# Firebase Configuration (from Firebase Console > Project Settings > Config)
REACT_APP_FIREBASE_API_KEY=your_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

# Backend URL (from Railway deployment)
REACT_APP_BACKEND_URL=https://your-railway-service.railway.app

# Frontend URL (will be your Vercel domain)
REACT_APP_FRONTEND_URL=https://your-chess-app.vercel.app

# Development flag
REACT_APP_USE_FIREBASE_EMULATOR=false
```

### Deployment Steps

1. **Connect to Vercel:**
   - Go to https://vercel.com
   - Sign up/Login with GitHub
   - Click "New Project"
   - Import your chess repository
   - Select the `chess-app` folder as root directory

2. **Configure Build Settings:**
   - Framework Preset: Create React App
   - Build Command: `npm run build`
   - Output Directory: `build`
   - Install Command: `npm install`

3. **Set Environment Variables:**
   - Go to Project Settings → Environment Variables
   - Add all variables listed above
   - Set for Production, Preview, and Development

4. **Deploy:**
   - Click "Deploy"
   - Vercel will automatically build and deploy
   - Your app will be available at `https://your-project-name.vercel.app`

### Getting Firebase Web Config

1. Go to Firebase Console → Your Project
2. Settings → General → Your apps
3. If no web app exists, click "Add app" → Web
4. Copy the config object values to environment variables

### Custom Domain (Optional)

1. In Vercel dashboard → Project → Settings → Domains
2. Add your custom domain
3. Update environment variables with new domain
4. Update Firebase authorized domains in Authentication → Settings

### Post-Deployment

1. **Update Backend CORS:**
   - Update `CORS_ORIGIN` and `FRONTEND_URL` in Railway
   - Redeploy backend if needed

2. **Update Firebase Settings:**
   - Add your Vercel domain to Firebase authorized domains
   - Authentication → Settings → Authorized domains

3. **Test Multiplayer:**
   - Create a game room
   - Share the room code with friends
   - Test real-time gameplay