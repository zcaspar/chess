import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Firebase configuration object
// TODO: Replace with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'development-key',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:123456789:web:abcdef123456'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Debug: Log the auth domain being used (remove in production)
console.log('🔥 Firebase Auth Domain:', firebaseConfig.authDomain);
console.log('🔥 Current URL:', window.location.href);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Connect to Firebase Auth emulator in development (always use emulator in dev)
if (process.env.NODE_ENV === 'development') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    console.log('🔥 Firebase Auth emulator connected');
  } catch (error) {
    console.log('Firebase Auth emulator already connected or connection failed:', error);
  }
}

export default app;