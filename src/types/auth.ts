// Remove Firebase client SDK dependency for backend compilation
export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export interface UserProfile {
  id: string;
  firebaseUid: string;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  isGuest: boolean;
  preferences: UserPreferences;
  stats: UserStats;
  createdAt: string;
  updatedAt: string;
  lastLogin: string;
}

export interface UserPreferences {
  boardTheme?: 'classic' | 'wood' | 'neon' | 'ice';
  pieceStyle?: 'classic' | 'modern' | 'fantasy' | 'minimal' | 'lego';
  boardOrientation?: 'white' | 'black';
  soundEnabled?: boolean;
  autoPromoteQueen?: boolean;
  showLegalMoves?: boolean;
  animationSpeed?: 'slow' | 'normal' | 'fast';
}

export interface UserStats {
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  gamesPlayed: number;
  totalPlayTime: number; // in minutes
  favoriteTimeControl?: string;
  winStreak: number;
  bestWinStreak: number;
}

export interface AuthUser extends FirebaseUser {
  profile?: UserProfile;
}

export interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  
  // Authentication methods
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  createGuestAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  
  // Profile methods
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updatePreferences: (preferences: Partial<UserPreferences>) => Promise<void>;
  updateStats: (stats: Partial<UserStats>) => Promise<void>;
  
  // Utility methods
  isAuthenticated: boolean;
  isGuest: boolean;
  upgradeGuestAccount: (email: string, password: string) => Promise<void>;
}