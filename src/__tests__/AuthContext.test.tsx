import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase-client';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';

// Mock Firebase auth
jest.mock('../config/firebase-client', () => ({
  auth: {},
}));

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInAnonymously: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
  updateProfile: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const mockFirebaseUser = {
  uid: 'test-uid-123',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
  emailVerified: true,
  getIdToken: jest.fn(() => Promise.resolve('test-token')),
};

const mockUserProfile = {
  id: 'profile-123',
  firebaseUid: 'test-uid-123',
  username: 'testuser',
  email: 'test@example.com',
  displayName: 'Test User',
  isGuest: false,
  preferences: {
    boardTheme: 'classic' as const,
    soundEnabled: true,
    showLegalMoves: true,
  },
  stats: {
    wins: 10,
    losses: 5,
    draws: 3,
    rating: 1200,
    gamesPlayed: 18,
    totalPlayTime: 360,
    winStreak: 2,
    bestWinStreak: 5,
  },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  lastLogin: '2024-01-01T00:00:00Z',
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.MockedFunction<typeof fetch>).mockClear();
    
    // Setup default auth state listener
    (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
      // Initially call with null (no user)
      callback(null);
      // Return unsubscribe function
      return jest.fn();
    });
  });

  describe('Initial State', () => {
    it('should initialize with no user', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isGuest).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Email Authentication', () => {
    it('should sign in with email and password', async () => {
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: mockFirebaseUser,
      });
      
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserProfile,
      } as Response);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signInWithEmail('test@example.com', 'password123');
      });

      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'test@example.com', 'password123');
      expect(result.current.profile).toEqual(mockUserProfile);
      expect(result.current.error).toBeNull();
    });

    it('should handle sign in errors', async () => {
      const errorMessage = 'Invalid credentials';
      const error = new Error(errorMessage);
      (signInWithEmailAndPassword as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.signInWithEmail('test@example.com', 'wrong-password');
        })
      ).rejects.toThrow(errorMessage);
    });

    it('should sign up with email, password, and username', async () => {
      const newUser = {
        ...mockFirebaseUser,
        getIdToken: jest.fn(() => Promise.resolve('test-token')),
      };

      (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: newUser,
      });
      
      (updateProfile as jest.Mock).mockResolvedValue(undefined);
      
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserProfile,
      } as Response);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signUpWithEmail('test@example.com', 'password123', 'testuser');
      });

      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(auth, 'test@example.com', 'password123');
      expect(updateProfile).toHaveBeenCalledWith(newUser, { displayName: 'testuser' });
      expect(fetch).toHaveBeenCalledWith(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/profile`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': expect.stringContaining('Bearer'),
          }),
          body: JSON.stringify({
            username: 'testuser',
            email: 'test@example.com',
            displayName: 'Test User',
            isGuest: false,
          }),
        })
      );
    });
  });

  describe('Google Authentication', () => {
    it('should sign in with Google', async () => {
      (signInWithPopup as jest.Mock).mockResolvedValue({
        user: mockFirebaseUser,
      });
      
      // First fetch to check if profile exists (returns null)
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
      } as Response);
      
      // Second fetch to create profile
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserProfile,
      } as Response);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      expect(signInWithPopup).toHaveBeenCalled();
      expect(result.current.error).toBeNull();
    });

    it('should use existing profile when signing in with Google', async () => {
      (signInWithPopup as jest.Mock).mockResolvedValue({
        user: mockFirebaseUser,
      });
      
      // First fetch returns existing profile
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserProfile,
      } as Response);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      expect(signInWithPopup).toHaveBeenCalled();
      // Should only call fetch once (to check for existing profile)
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Guest Authentication', () => {
    it('should create guest account', async () => {
      const guestUser = {
        ...mockFirebaseUser,
        isAnonymous: true,
        email: null,
        displayName: null,
      };

      (signInAnonymously as jest.Mock).mockResolvedValue({
        user: guestUser,
      });
      
      const guestProfile = {
        ...mockUserProfile,
        isGuest: true,
        username: 'Guest_abc123',
      };
      
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => guestProfile,
      } as Response);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.createGuestAccount();
      });

      expect(signInAnonymously).toHaveBeenCalledWith(auth);
      expect(fetch).toHaveBeenCalledWith(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/profile`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"isGuest":true'),
        })
      );
    });
  });

  describe('Sign Out', () => {
    it('should sign out user', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signOut();
      });

      expect(signOut).toHaveBeenCalledWith(auth);
      expect(result.current.user).toBeNull();
      expect(result.current.profile).toBeNull();
    });
  });

  describe('Profile Management', () => {
    it('should update profile', async () => {
      const authUser = {
        ...mockFirebaseUser,
        getIdToken: jest.fn(() => Promise.resolve('test-token')),
      };

      // Setup authenticated state
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        callback(authUser);
        return jest.fn();
      });
      
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserProfile,
        } as Response) // For initial load
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...mockUserProfile, displayName: 'Updated Name' }),
        } as Response); // For update

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeTruthy();
      });

      const updates = { displayName: 'Updated Name' };
      
      await act(async () => {
        await result.current.updateProfile(updates);
      });

      expect(fetch).toHaveBeenLastCalledWith(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/profile`,
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': expect.stringContaining('Bearer'),
          }),
          body: JSON.stringify(updates),
        })
      );
    });

    it('should update preferences', async () => {
      // Setup authenticated state with profile
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        callback(mockFirebaseUser);
        return jest.fn();
      });
      
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserProfile,
        } as Response) // For initial load
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...mockUserProfile,
            preferences: { ...mockUserProfile.preferences, soundEnabled: false },
          }),
        } as Response); // For update

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeTruthy();
      });

      await act(async () => {
        await result.current.updatePreferences({ soundEnabled: false });
      });

      expect(fetch).toHaveBeenLastCalledWith(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/profile`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            preferences: {
              ...mockUserProfile.preferences,
              soundEnabled: false,
            },
          }),
        })
      );
    });

    it('should update stats', async () => {
      // Setup authenticated state with profile
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        callback(mockFirebaseUser);
        return jest.fn();
      });
      
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserProfile,
        } as Response) // For initial load
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ...mockUserProfile,
            stats: { ...mockUserProfile.stats, wins: 11, gamesPlayed: 19 },
          }),
        } as Response); // For update

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeTruthy();
      });

      await act(async () => {
        await result.current.updateStats({ wins: 11, gamesPlayed: 19 });
      });

      expect(fetch).toHaveBeenLastCalledWith(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/profile`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            stats: {
              ...mockUserProfile.stats,
              wins: 11,
              gamesPlayed: 19,
            },
          }),
        })
      );
    });
  });

  describe('Guest Account Upgrade', () => {
    it('should upgrade guest account to full account', async () => {
      const guestUser = {
        ...mockFirebaseUser,
        uid: 'guest-uid',
        isAnonymous: true,
        email: null,
      };

      // Setup as guest user
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        callback(guestUser);
        return jest.fn();
      });
      
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...mockUserProfile, isGuest: true }),
        } as Response); // For initial guest profile load

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isGuest).toBe(true);
      });

      // Mock upgrade process
      (createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: mockFirebaseUser,
      });
      
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        } as Response) // For upgrade endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserProfile,
        } as Response); // For loading new profile

      await act(async () => {
        await result.current.upgradeGuestAccount('upgrade@example.com', 'password123');
      });

      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(auth, 'upgrade@example.com', 'password123');
      expect(fetch).toHaveBeenCalledWith(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/upgrade-guest`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            guestUid: 'guest-uid',
          }),
        })
      );
    });

    it('should throw error when trying to upgrade non-guest account', async () => {
      // Setup as regular user
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        callback(mockFirebaseUser);
        return jest.fn();
      });
      
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserProfile,
      } as Response);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.upgradeGuestAccount('upgrade@example.com', 'password123');
        });
      }).rejects.toThrow('Can only upgrade anonymous accounts');
    });
  });

  describe('Auth State Persistence', () => {
    it('should load user profile on auth state change', async () => {
      let authCallback: ((user: any) => void) | null = null;
      
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        authCallback = callback;
        callback(null); // Start with no user
        return jest.fn();
      });
      
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();

      // Mock profile fetch
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserProfile,
      } as Response);

      // Simulate user sign in
      await act(async () => {
        if (authCallback) {
          await authCallback(mockFirebaseUser);
        }
      });

      await waitFor(() => {
        expect(result.current.profile).toEqual(mockUserProfile);
      });

      expect(result.current.user).toBeTruthy();
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors during profile fetch', async () => {
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
        user: mockFirebaseUser,
      });
      
      (fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      // The error should be caught but not throw
      await act(async () => {
        await result.current.signInWithEmail('test@example.com', 'password123');
      });

      // Profile should be null due to fetch error
      expect(result.current.profile).toBeNull();
    });

    it('should handle profile update errors', async () => {
      const authUser = {
        ...mockFirebaseUser,
        getIdToken: jest.fn(() => Promise.resolve('test-token')),
      };

      // Setup authenticated state
      (onAuthStateChanged as jest.Mock).mockImplementation((auth, callback) => {
        callback(authUser);
        return jest.fn();
      });
      
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserProfile,
        } as Response) // For initial load
        .mockResolvedValueOnce({
          ok: false,
        } as Response); // For update (failure)

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.profile).toBeTruthy();
      });

      await expect(
        act(async () => {
          await result.current.updateProfile({ displayName: 'New Name' });
        })
      ).rejects.toThrow('Failed to update profile');
    });
  });
});