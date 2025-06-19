import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    // Configure for emulator in development
    if (process.env.NODE_ENV === 'development') {
      // Set emulator environment variables for Firebase Admin SDK
      process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
      
      admin.initializeApp({
        projectId: 'demo-project', // Use demo project for emulator
      });
      console.log('Firebase Admin SDK initialized for emulator');
    } else {
      // Production configuration
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'chess-app-dev',
        // In production, add serviceAccountKey configuration
      });
      console.log('Firebase Admin SDK initialized for production');
    }
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
  }
}

export const firebaseAdmin = admin;
export const auth = admin.auth();
export const firestore = admin.firestore();