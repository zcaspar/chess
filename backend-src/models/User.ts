// User profiles, stored in Postgres.
//
// This used to be three in-process Maps marked "development only", which meant
// every deploy or restart wiped every profile, preference and statistic, and
// the `UPDATE users ...` statements in the socket handler never matched a row.
// The Maps survive only as a non-production fallback for running the backend
// with no database at all.

import { query } from '../config/database';
import { logger } from '../utils/logger';

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
  [key: string]: unknown;
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

/** The only profile fields a caller may change after creation. */
export interface UserUpdates {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  preferences?: UserPreferences;
  stats?: Partial<UserStats>;
}

export type GameOutcome = 'win' | 'loss' | 'draw';

const DEFAULT_PREFERENCES: UserPreferences = {
  boardTheme: 'classic',
  pieceStyle: 'classic',
  soundEnabled: true,
  autoPromoteQueen: false,
  showLegalMoves: true,
  animationSpeed: 'normal',
};

const DEFAULT_STATS: UserStats = {
  wins: 0,
  losses: 0,
  draws: 0,
  rating: 1200,
  gamesPlayed: 0,
  totalPlayTime: 0,
  winStreak: 0,
  bestWinStreak: 0,
};

const USERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      firebase_uid VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE,
      display_name VARCHAR(100),
      avatar_url TEXT,
      is_guest BOOLEAN DEFAULT FALSE,
      preferences JSONB DEFAULT '{}',
      stats JSONB DEFAULT '{"wins": 0, "losses": 0, "draws": 0, "rating": 1200, "gamesPlayed": 0, "totalPlayTime": 0, "winStreak": 0, "bestWinStreak": 0}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

const toIso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value ?? new Date().toISOString());

const rowToProfile = (row: any): UserProfile => ({
  id: row.firebase_uid, // the API has always exposed the Firebase UID as the id
  firebaseUid: row.firebase_uid,
  username: row.username,
  email: row.email || '',
  displayName: row.display_name || undefined,
  avatarUrl: row.avatar_url || undefined,
  isGuest: !!row.is_guest,
  preferences: { ...DEFAULT_PREFERENCES, ...(row.preferences || {}) },
  stats: { ...DEFAULT_STATS, ...(row.stats || {}) },
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  lastLogin: toIso(row.last_login),
});

/** Apply one finished game to a stats object (shared by SQL-less fallback). */
const applyOutcome = (stats: UserStats, outcome: GameOutcome): UserStats => {
  const winStreak = outcome === 'win' ? stats.winStreak + 1 : 0;
  return {
    ...stats,
    gamesPlayed: stats.gamesPlayed + 1,
    wins: stats.wins + (outcome === 'win' ? 1 : 0),
    losses: stats.losses + (outcome === 'loss' ? 1 : 0),
    draws: stats.draws + (outcome === 'draw' ? 1 : 0),
    winStreak,
    bestWinStreak: Math.max(stats.bestWinStreak, winStreak),
  };
};

// --- Non-production fallback -------------------------------------------------

const memoryUsers: Map<string, UserProfile> = new Map();

type Backend = 'postgres' | 'memory';
let backendPromise: Promise<Backend> | null = null;

const resolveBackend = async (): Promise<Backend> => {
  try {
    await query(USERS_TABLE_SQL);
    // database/init.sql declared email NOT NULL, but guests have no email and
    // an empty string would collide on the UNIQUE constraint. Idempotent.
    await query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
    return 'postgres';
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      // Never fall back silently in production: that is exactly the
      // "profiles vanish on restart" behaviour this model replaces.
      throw error;
    }
    logger.warn('Users table unavailable; using in-memory profiles (non-production only):', error);
    return 'memory';
  }
};

const getBackend = (): Promise<Backend> => {
  if (!backendPromise) {
    backendPromise = resolveBackend().catch((error) => {
      backendPromise = null; // retry on the next call rather than caching the failure
      throw error;
    });
  }
  return backendPromise;
};

const translateUniqueViolation = (error: any): Error => {
  if (error?.code === '23505') {
    const constraint = String(error.constraint || error.detail || '');
    if (constraint.includes('username')) return new Error('Username already taken');
    if (constraint.includes('email')) return new Error('Email already in use');
    return new Error('User already exists');
  }
  return error;
};

export class UserModel {
  static async findByFirebaseUid(firebaseUid: string): Promise<UserProfile | null> {
    if ((await getBackend()) === 'memory') {
      return memoryUsers.get(firebaseUid) || null;
    }
    const result = await query('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid]);
    return result.rows[0] ? rowToProfile(result.rows[0]) : null;
  }

  static async findByEmail(email: string): Promise<UserProfile | null> {
    if (!email) return null;
    if ((await getBackend()) === 'memory') {
      return Array.from(memoryUsers.values()).find((u) => u.email === email) || null;
    }
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] ? rowToProfile(result.rows[0]) : null;
  }

  static async findByUsername(username: string): Promise<UserProfile | null> {
    if ((await getBackend()) === 'memory') {
      return Array.from(memoryUsers.values()).find((u) => u.username === username) || null;
    }
    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] ? rowToProfile(result.rows[0]) : null;
  }

  static async create(userData: {
    firebaseUid: string;
    username: string;
    email: string;
    displayName?: string;
    isGuest?: boolean;
  }): Promise<UserProfile> {
    if ((await getBackend()) === 'memory') {
      if (memoryUsers.has(userData.firebaseUid)) throw new Error('User already exists');
      const all = Array.from(memoryUsers.values());
      if (userData.email && all.some((u) => u.email === userData.email)) {
        throw new Error('Email already in use');
      }
      if (all.some((u) => u.username === userData.username)) {
        throw new Error('Username already taken');
      }
      const now = new Date().toISOString();
      const user: UserProfile = {
        id: userData.firebaseUid,
        firebaseUid: userData.firebaseUid,
        username: userData.username,
        email: userData.email,
        displayName: userData.displayName,
        isGuest: userData.isGuest || false,
        preferences: { ...DEFAULT_PREFERENCES },
        stats: { ...DEFAULT_STATS },
        createdAt: now,
        updatedAt: now,
        lastLogin: now,
      };
      memoryUsers.set(user.firebaseUid, user);
      return user;
    }

    try {
      const result = await query(
        `INSERT INTO users (firebase_uid, username, email, display_name, is_guest, preferences, stats)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          userData.firebaseUid,
          userData.username,
          userData.email || null,
          userData.displayName || null,
          userData.isGuest || false,
          JSON.stringify(DEFAULT_PREFERENCES),
          JSON.stringify(DEFAULT_STATS),
        ]
      );
      return rowToProfile(result.rows[0]);
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }

  /**
   * Update the caller-editable profile fields. `preferences` and `stats` are
   * merged into the stored objects rather than replacing them.
   */
  static async update(firebaseUid: string, updates: UserUpdates): Promise<UserProfile> {
    if ((await getBackend()) === 'memory') {
      const user = memoryUsers.get(firebaseUid);
      if (!user) throw new Error('User not found');
      if (
        updates.username &&
        updates.username !== user.username &&
        Array.from(memoryUsers.values()).some((u) => u.username === updates.username)
      ) {
        throw new Error('Username already taken');
      }
      const updated: UserProfile = {
        ...user,
        username: updates.username ?? user.username,
        displayName: updates.displayName ?? user.displayName,
        avatarUrl: updates.avatarUrl ?? user.avatarUrl,
        preferences: { ...user.preferences, ...(updates.preferences || {}) },
        stats: { ...user.stats, ...(updates.stats || {}) },
        updatedAt: new Date().toISOString(),
      };
      memoryUsers.set(firebaseUid, updated);
      return updated;
    }

    try {
      const result = await query(
        `UPDATE users SET
           username     = COALESCE($2, username),
           display_name = COALESCE($3, display_name),
           avatar_url   = COALESCE($4, avatar_url),
           preferences  = COALESCE(preferences, '{}'::jsonb) || $5::jsonb,
           stats        = COALESCE(stats, '{}'::jsonb) || $6::jsonb,
           updated_at   = CURRENT_TIMESTAMP
         WHERE firebase_uid = $1
         RETURNING *`,
        [
          firebaseUid,
          updates.username ?? null,
          updates.displayName ?? null,
          updates.avatarUrl ?? null,
          JSON.stringify(updates.preferences || {}),
          JSON.stringify(updates.stats || {}),
        ]
      );
      if (!result.rows[0]) throw new Error('User not found');
      return rowToProfile(result.rows[0]);
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }

  /**
   * Score one finished game for a player. Called by the server when an online
   * game ends; a single atomic statement so concurrent games cannot lose an
   * update. Returns false when the player has no profile row.
   */
  static async recordGameResult(firebaseUid: string, outcome: GameOutcome): Promise<boolean> {
    if ((await getBackend()) === 'memory') {
      const user = memoryUsers.get(firebaseUid);
      if (!user) return false;
      memoryUsers.set(firebaseUid, { ...user, stats: applyOutcome(user.stats, outcome) });
      return true;
    }

    const win = outcome === 'win' ? 1 : 0;
    const loss = outcome === 'loss' ? 1 : 0;
    const draw = outcome === 'draw' ? 1 : 0;
    const result = await query(
      `UPDATE users SET
         stats = COALESCE(stats, '{}'::jsonb) || jsonb_build_object(
           'gamesPlayed', COALESCE((stats->>'gamesPlayed')::int, 0) + 1,
           'wins',        COALESCE((stats->>'wins')::int, 0) + $2::int,
           'losses',      COALESCE((stats->>'losses')::int, 0) + $3::int,
           'draws',       COALESCE((stats->>'draws')::int, 0) + $4::int,
           'winStreak',   CASE WHEN $2::int = 1 THEN COALESCE((stats->>'winStreak')::int, 0) + 1 ELSE 0 END,
           'bestWinStreak', GREATEST(
             COALESCE((stats->>'bestWinStreak')::int, 0),
             CASE WHEN $2::int = 1 THEN COALESCE((stats->>'winStreak')::int, 0) + 1 ELSE 0 END
           )
         ),
         updated_at = CURRENT_TIMESTAMP
       WHERE firebase_uid = $1`,
      [firebaseUid, win, loss, draw]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async updateLastLogin(firebaseUid: string): Promise<void> {
    if ((await getBackend()) === 'memory') {
      const user = memoryUsers.get(firebaseUid);
      if (user) memoryUsers.set(firebaseUid, { ...user, lastLogin: new Date().toISOString() });
      return;
    }
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE firebase_uid = $1', [firebaseUid]);
  }

  static async delete(firebaseUid: string): Promise<boolean> {
    if ((await getBackend()) === 'memory') {
      return memoryUsers.delete(firebaseUid);
    }
    const result = await query('DELETE FROM users WHERE firebase_uid = $1', [firebaseUid]);
    return (result.rowCount ?? 0) > 0;
  }

  static async getStats(): Promise<{ totalUsers: number; guestUsers: number; activeUsers: number }> {
    if ((await getBackend()) === 'memory') {
      const all = Array.from(memoryUsers.values());
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      return {
        totalUsers: all.length,
        guestUsers: all.filter((u) => u.isGuest).length,
        activeUsers: all.filter((u) => new Date(u.lastLogin).getTime() > dayAgo).length,
      };
    }
    const result = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_guest)::int AS guests,
              COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL '1 day')::int AS active
       FROM users`
    );
    const row = result.rows[0] || {};
    return { totalUsers: row.total || 0, guestUsers: row.guests || 0, activeUsers: row.active || 0 };
  }

  /** Test helper: forget the cached backend choice and any in-memory users. */
  static resetForTests(): void {
    backendPromise = null;
    memoryUsers.clear();
  }
}
