// Mock Firebase for testing
export const auth = {
  currentUser: null,
  onAuthStateChanged: jest.fn((callback) => {
    callback(null);
    return jest.fn(); // unsubscribe function
  }),
  signInWithPopup: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
};

export const GoogleAuthProvider = jest.fn();

export const getAuth = jest.fn(() => auth);

export const initializeApp = jest.fn();

export default {
  auth,
  GoogleAuthProvider,
  getAuth,
  initializeApp,
};