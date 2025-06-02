import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile as updateFirebaseProfile,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { AuthContextType, AuthUser, UserProfile, UserPreferences, UserStats } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authentication methods
  const signInWithEmail = async (email: string, password: string): Promise<void> => {
    try {
      setError(null);
      setLoading(true);
      const result = await signInWithEmailAndPassword(auth, email, password);
      await loadUserProfile(result.user);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, password: string, username: string): Promise<void> => {
    try {
      setError(null);
      setLoading(true);
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update Firebase profile
      await updateFirebaseProfile(result.user, { displayName: username });
      
      // Create user profile in our backend
      await createUserProfile(result.user, username, false);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    try {
      setError(null);
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if user profile exists, create if not
      const existingProfile = await fetchUserProfile(result.user);
      if (!existingProfile) {
        await createUserProfile(result.user, result.user.displayName || 'User', false);
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const createGuestAccount = async (): Promise<void> => {
    try {
      setError(null);
      setLoading(true);
      const result = await signInAnonymously(auth);
      
      // Create temporary guest profile
      const guestUsername = `Guest_${Math.random().toString(36).substr(2, 6)}`;
      await createUserProfile(result.user, guestUsername, true);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      setError(null);
      await firebaseSignOut(auth);
      setUser(null);
      setProfile(null);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  // Profile management methods
  const updateProfile = async (updates: Partial<UserProfile>): Promise<void> => {
    if (!user || !profile) throw new Error('No authenticated user');
    
    try {
      setError(null);
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      const updatedProfile = await response.json();
      setProfile(updatedProfile);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const updatePreferences = async (preferences: Partial<UserPreferences>): Promise<void> => {
    if (!profile) return;
    
    const updatedPreferences = { ...profile.preferences, ...preferences };
    await updateProfile({ preferences: updatedPreferences });
  };

  const updateStats = async (stats: Partial<UserStats>): Promise<void> => {
    if (!profile) return;
    
    const updatedStats = { ...profile.stats, ...stats };
    await updateProfile({ stats: updatedStats });
  };

  const upgradeGuestAccount = async (email: string, password: string): Promise<void> => {
    if (!user || !user.isAnonymous) {
      throw new Error('Can only upgrade anonymous accounts');
    }

    try {
      setError(null);
      setLoading(true);
      
      // This would require additional Firebase setup for account linking
      // For now, we'll implement a simpler approach: create new account and transfer data
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Transfer guest data to new account (backend handles this)
      await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/upgrade-guest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await result.user.getIdToken()}`,
        },
        body: JSON.stringify({
          guestUid: user.uid,
        }),
      });

      await loadUserProfile(result.user);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Helper methods
  const createUserProfile = async (firebaseUser: FirebaseUser, username: string, isGuest: boolean): Promise<void> => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await firebaseUser.getIdToken()}`,
        },
        body: JSON.stringify({
          username,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || username,
          isGuest,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create user profile');
      }

      const profileData = await response.json();
      setProfile(profileData);
    } catch (err) {
      console.error('Error creating user profile:', err);
      throw err;
    }
  };

  const fetchUserProfile = async (firebaseUser: FirebaseUser): Promise<UserProfile | null> => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/profile`, {
        headers: {
          'Authorization': `Bearer ${await firebaseUser.getIdToken()}`,
        },
      });

      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (err) {
      console.error('Error fetching user profile:', err);
      return null;
    }
  };

  const loadUserProfile = async (firebaseUser: FirebaseUser): Promise<void> => {
    try {
      const profileData = await fetchUserProfile(firebaseUser);
      setProfile(profileData);
      setUser(Object.assign(firebaseUser, { profile: profileData || undefined }));
    } catch (err) {
      console.error('Error loading user profile:', err);
    }
  };

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await loadUserProfile(firebaseUser);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [loadUserProfile]);

  const value: AuthContextType = {
    user,
    profile,
    loading,
    error,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    createGuestAccount,
    signOut,
    updateProfile,
    updatePreferences,
    updateStats,
    upgradeGuestAccount,
    isAuthenticated: !!user && !user.isAnonymous,
    isGuest: !!user && user.isAnonymous,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};