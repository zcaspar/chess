// In-memory user storage for development
// In production, this would be replaced with actual database queries

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
  boardTheme?: 'classic' | 'modern' | 'neon';
  pieceStyle?: 'classic' | 'modern' | 'cartoon';
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
  totalPlayTime: number;
  favoriteTimeControl?: string;
  winStreak: number;
  bestWinStreak: number;
}

// In-memory storage (development only)
const users: Map<string, UserProfile> = new Map();
const usersByEmail: Map<string, UserProfile> = new Map();
const usersByUsername: Map<string, UserProfile> = new Map();

export class UserModel {
  static async findByFirebaseUid(firebaseUid: string): Promise<UserProfile | null> {
    return users.get(firebaseUid) || null;
  }

  static async findByEmail(email: string): Promise<UserProfile | null> {
    return usersByEmail.get(email) || null;
  }

  static async findByUsername(username: string): Promise<UserProfile | null> {
    return usersByUsername.get(username) || null;
  }

  static async create(userData: {
    firebaseUid: string;
    username: string;
    email: string;
    displayName?: string;
    isGuest?: boolean;
  }): Promise<UserProfile> {
    // Check if user already exists
    if (users.has(userData.firebaseUid)) {
      throw new Error('User already exists');
    }

    if (usersByEmail.has(userData.email) && userData.email) {
      throw new Error('Email already in use');
    }

    if (usersByUsername.has(userData.username)) {
      throw new Error('Username already taken');
    }

    const now = new Date().toISOString();
    const user: UserProfile = {
      id: userData.firebaseUid, // Use Firebase UID as ID for simplicity
      firebaseUid: userData.firebaseUid,
      username: userData.username,
      email: userData.email,
      displayName: userData.displayName,
      isGuest: userData.isGuest || false,
      preferences: {
        boardTheme: 'classic',
        pieceStyle: 'classic',
        soundEnabled: true,
        autoPromoteQueen: false,
        showLegalMoves: true,
        animationSpeed: 'normal',
      },
      stats: {
        wins: 0,
        losses: 0,
        draws: 0,
        rating: 1200,
        gamesPlayed: 0,
        totalPlayTime: 0,
        winStreak: 0,
        bestWinStreak: 0,
      },
      createdAt: now,
      updatedAt: now,
      lastLogin: now,
    };

    // Store in maps
    users.set(userData.firebaseUid, user);
    if (userData.email) {
      usersByEmail.set(userData.email, user);
    }
    usersByUsername.set(userData.username, user);

    return user;
  }

  static async update(firebaseUid: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const user = users.get(firebaseUid);
    if (!user) {
      throw new Error('User not found');
    }

    // Handle username changes
    if (updates.username && updates.username !== user.username) {
      if (usersByUsername.has(updates.username)) {
        throw new Error('Username already taken');
      }
      usersByUsername.delete(user.username);
      usersByUsername.set(updates.username, user);
    }

    // Handle email changes
    if (updates.email && updates.email !== user.email) {
      if (usersByEmail.has(updates.email)) {
        throw new Error('Email already in use');
      }
      if (user.email) {
        usersByEmail.delete(user.email);
      }
      usersByEmail.set(updates.email, user);
    }

    const updatedUser: UserProfile = {
      ...user,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    users.set(firebaseUid, updatedUser);
    return updatedUser;
  }

  static async updateLastLogin(firebaseUid: string): Promise<void> {
    const user = users.get(firebaseUid);
    if (user) {
      user.lastLogin = new Date().toISOString();
      users.set(firebaseUid, user);
    }
  }

  static async delete(firebaseUid: string): Promise<boolean> {
    const user = users.get(firebaseUid);
    if (!user) {
      return false;
    }

    users.delete(firebaseUid);
    if (user.email) {
      usersByEmail.delete(user.email);
    }
    usersByUsername.delete(user.username);

    return true;
  }

  static async getAllUsers(): Promise<UserProfile[]> {
    return Array.from(users.values());
  }

  // Development helper methods
  static async clearAll(): Promise<void> {
    users.clear();
    usersByEmail.clear();
    usersByUsername.clear();
  }

  static getStats(): { totalUsers: number; guestUsers: number; activeUsers: number } {
    const allUsers = Array.from(users.values());
    return {
      totalUsers: allUsers.length,
      guestUsers: allUsers.filter(u => u.isGuest).length,
      activeUsers: allUsers.filter(u => {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return new Date(u.lastLogin) > dayAgo;
      }).length,
    };
  }
}