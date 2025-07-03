import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Firebase configuration object
// Real Firebase project configuration
const useEmulator = process.env.REACT_APP_USE_FIREBASE_EMULATOR === 'true';

// Use real Firebase config by default, fall back to demo only if credentials missing
const hasRealCredentials = 
  process.env.REACT_APP_FIREBASE_API_KEY && 
  process.env.REACT_APP_FIREBASE_API_KEY !== 'development' &&
  process.env.REACT_APP_FIREBASE_PROJECT_ID &&
  process.env.REACT_APP_FIREBASE_PROJECT_ID !== 'chess-app-dev';

const firebaseConfig = {
  apiKey: hasRealCredentials ? process.env.REACT_APP_FIREBASE_API_KEY! : 'demo-chess-app',
  authDomain: hasRealCredentials ? process.env.REACT_APP_FIREBASE_AUTH_DOMAIN! : 'demo-chess-app.firebaseapp.com',
  projectId: hasRealCredentials ? process.env.REACT_APP_FIREBASE_PROJECT_ID! : 'demo-chess-app',
  storageBucket: hasRealCredentials ? process.env.REACT_APP_FIREBASE_STORAGE_BUCKET! : 'demo-chess-app.appspot.com',
  messagingSenderId: hasRealCredentials ? process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID! : '123456789',
  appId: hasRealCredentials ? process.env.REACT_APP_FIREBASE_APP_ID! : '1:123456789:web:demo-app'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Connect to Firebase Auth emulator only when explicitly enabled
if (useEmulator) {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    console.log('🔥 Firebase Auth emulator connected (development mode)');
    console.log('✅ Authentication will work with guest accounts and local development');
  } catch (error) {
    console.log('Firebase Auth emulator connection failed, using fallback auth:', error);
    console.log('✅ Guest mode authentication will still work');
    // Continue without emulator - the app will work with guest mode
  }
} else if (hasRealCredentials) {
  console.log('🔥 Firebase initialized with production credentials');
  console.log('✅ Google authentication enabled');
} else {
  console.log('⚠️ Firebase using demo credentials - limited functionality');
}

// Export configuration info for debugging
export const firebaseConfigInfo = {
  hasRealCredentials,
  useEmulator,
  hasEmulator: useEmulator,
  apiKey: firebaseConfig.apiKey ? firebaseConfig.apiKey.substring(0, 10) + '...' : 'undefined',
  projectId: firebaseConfig.projectId
};

export default app;