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
      // Try to use the same project ID from the frontend
      const projectId = 'chess-multiplayer-10fa8'; // Match frontend Firebase project
      
      admin.initializeApp({
        projectId: projectId,
        // Firebase Admin will automatically use Application Default Credentials
        // or service account key from environment variables if available
      });
      console.log('Firebase Admin SDK initialized for production with project:', projectId);
    }
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
  }
}

export const firebaseAdmin = admin;
export const auth = admin.auth();
export const firestore = admin.firestore();