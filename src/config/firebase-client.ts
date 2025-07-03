import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Firebase configuration object
// TODO: Replace with your actual Firebase project configuration
const isDevelopmentConfig = 
  process.env.REACT_APP_FIREBASE_API_KEY === 'development' ||
  process.env.REACT_APP_FIREBASE_API_KEY === 'development-key' ||
  process.env.REACT_APP_USE_FIREBASE_EMULATOR === 'true' ||
  !process.env.REACT_APP_FIREBASE_API_KEY;

// Use demo project for development/invalid configs to avoid API key errors
const firebaseConfig = {
  apiKey: isDevelopmentConfig ? 'demo-chess-app' : process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: isDevelopmentConfig ? 'demo-chess-app.firebaseapp.com' : process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: isDevelopmentConfig ? 'demo-chess-app' : process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: isDevelopmentConfig ? 'demo-chess-app.appspot.com' : process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: isDevelopmentConfig ? '123456789' : process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: isDevelopmentConfig ? '1:123456789:web:demo-app' : process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Connect to Firebase Auth emulator when in development mode
if (isDevelopmentConfig) {
  try {
    // Only connect if not already connected
    if (!auth.config.emulator) {
      connectAuthEmulator(auth, 'http://localhost:9099');
      console.log('🔥 Firebase Auth emulator connected (development mode)');
      console.log('✅ Authentication will work with guest accounts and local development');
    }
  } catch (error) {
    console.log('Firebase Auth emulator connection failed, using fallback auth:', error);
    console.log('✅ Guest mode authentication will still work');
    // Continue without emulator - the app will work with guest mode
  }
}

// Export configuration info for debugging
export const firebaseConfigInfo = {
  isDevelopmentConfig,
  hasEmulator: !!auth.config?.emulator,
  apiKey: firebaseConfig.apiKey.substring(0, 10) + '...',
  projectId: firebaseConfig.projectId
};

export default app;