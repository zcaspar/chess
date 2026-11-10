// User profiles, stored in Postgres.
//
// This used to be three in-process Maps marked "development only", which meant
// every deploy or restart wiped every profile, preference and statistic, and
// the `UPDATE users ...` statements in the socket handler never matched a row.
// The Maps survive only as a non-production fallback for running the backend
// with no database at all.

import { pool, query } from '../config/database';
import { logger } from '../utils/logger';
import { DEFAULT_RATING, Rating, isProvisional, rateGame, sanitizeRating } from '../utils/glicko2';

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
  /** Online rating. Only the server changes it, when a rated game ends. */
  rating: RatingSummary;
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

/** A rating as shown to people: whole numbers, and whether it is settled yet. */
export interface RatingSummary {
  value: number;
  deviation: number;
  /** True until enough games have been played for the rating to mean much. */
  provisional: boolean;
  /** Rated games played. */
  games: number;
}

export interface RatingChange {
  before: number;
  after: number;
  /** after - before. */
  change: number;
  provisional: boolean;
}

export interface RatedGameOutcome {
  white: RatingChange;
  black: RatingChange;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  rating: number;
  provisional: boolean;
  games: number;
}

export interface RatingHistoryEntry {
  gameId: string;
  outcome: GameOutcome;
  opponentRating: number;
  ratingBefore: number;
  ratingAfter: number;
  createdAt: string;
}

/** Rated games needed before a player appears on the leaderboard. */
const LEADERBOARD_MIN_GAMES = 5;

const toSummary = (rating: Rating, games: number): RatingSummary => ({
  value: Math.round(rating.rating),
  deviation: Math.round(rating.deviation),
  provisional: isProvisional(rating),
  games,
});

const toChange = (before: Rating, after: Rating): RatingChange => ({
  before: Math.round(before.rating),
  after: Math.round(after.rating),
  change: Math.round(after.rating) - Math.round(before.rating),
  provisional: isProvisional(after),
});

const ratingOfRow = (row: any): Rating =>
  sanitizeRating({
    rating: row.rating === null || row.rating === undefined ? undefined : Number(row.rating),
    deviation:
      row.rating_deviation === null || row.rating_deviation === undefined
        ? undefined
        : Number(row.rating_deviation),
    volatility:
      row.rating_volatility === null || row.rating_volatility === undefined
        ? undefined
        : Number(row.rating_volatility),
  });

const outcomeFor = (result: 'white' | 'black' | 'draw', color: 'white' | 'black'): GameOutcome =>
  result === 'draw' ? 'draw' : result === color ? 'win' : 'loss';

// Ratings live in their own columns rather than in the `stats` JSON: they are
// read for every seat in every online game, sorted for the leaderboard, and
// must never be writable through the profile endpoint.
const RATING_SCHEMA_SQL = [
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION NOT NULL DEFAULT 1500',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_deviation DOUBLE PRECISION NOT NULL DEFAULT 350',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_volatility DOUBLE PRECISION NOT NULL DEFAULT 0.06',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS rated_games INTEGER NOT NULL DEFAULT 0',
  `CREATE TABLE IF NOT EXISTS rating_history (
      id SERIAL PRIMARY KEY,
      firebase_uid VARCHAR(255) NOT NULL,
      game_id VARCHAR(255) NOT NULL,
      opponent_uid VARCHAR(255) NOT NULL,
      opponent_rating DOUBLE PRECISION NOT NULL,
      outcome VARCHAR(10) NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
      rating_before DOUBLE PRECISION NOT NULL,
      rating_after DOUBLE PRECISION NOT NULL,
      deviation_after DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT rating_history_player_game_unique UNIQUE (firebase_uid, game_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_rating_history_player ON rating_history(firebase_uid, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC)',
];

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
  rating: DEFAULT_RATING.rating,
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
  // `stats.rating` is what older clients display; keep it equal to the real one.
  stats: { ...DEFAULT_STATS, ...(row.stats || {}), rating: Math.round(ratingOfRow(row).rating) },
  rating: toSummary(ratingOfRow(row), Number(row.rated_games) || 0),
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
const memoryRatings: Map<string, Rating> = new Map();
const memoryRatingHistory: Map<string, RatingHistoryEntry[]> = new Map();

type Backend = 'postgres' | 'memory';
let backendPromise: Promise<Backend> | null = null;

const resolveBackend = async (): Promise<Backend> => {
  try {
    await query(USERS_TABLE_SQL);
    // database/init.sql declared email NOT NULL, but guests have no email and
    // an empty string would collide on the UNIQUE constraint. Idempotent.
    await query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
    for (const statement of RATING_SCHEMA_SQL) {
      await query(statement);
    }
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
        stats: { ...DEFAULT_STATS, rating: DEFAULT_RATING.rating },
        rating: toSummary(DEFAULT_RATING, 0),
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
        stats: { ...user.stats, ...(updates.stats || {}), rating: user.rating.value },
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
      memoryRatings.delete(firebaseUid);
      memoryRatingHistory.delete(firebaseUid);
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

  /**
   * A player's rating, or null when they cannot play rated games: no profile
   * yet, or a guest account (which can be thrown away and recreated at will).
   */
  static async getRatingSummary(firebaseUid: string): Promise<RatingSummary | null> {
    const profile = await UserModel.findByFirebaseUid(firebaseUid);
    return profile && !profile.isGuest ? profile.rating : null;
  }

  /**
   * Rate one finished online game. Both ratings are read, recalculated and
   * written inside a single transaction with the rows locked, so two games
   * finishing at once cannot overwrite each other's result.
   *
   * Returns null — and changes nothing — when the game is not rated: a player
   * has no profile, is a guest, or the game was already rated.
   */
  static async applyRatedGame(game: {
    whiteUid: string;
    blackUid: string;
    result: 'white' | 'black' | 'draw';
    gameId: string;
  }): Promise<RatedGameOutcome | null> {
    const { whiteUid, blackUid, result, gameId } = game;
    if (!whiteUid || !blackUid || whiteUid === blackUid) return null;

    if ((await getBackend()) === 'memory') {
      const white = memoryUsers.get(whiteUid);
      const black = memoryUsers.get(blackUid);
      if (!white || !black || white.isGuest || black.isGuest) return null;
      if ((memoryRatingHistory.get(whiteUid) || []).some((entry) => entry.gameId === gameId)) return null;

      const whiteBefore = memoryRatings.get(whiteUid) || DEFAULT_RATING;
      const blackBefore = memoryRatings.get(blackUid) || DEFAULT_RATING;
      const after = rateGame(whiteBefore, blackBefore, result);
      const record = (
        profile: UserProfile,
        color: 'white' | 'black',
        before: Rating,
        next: Rating,
        opponent: Rating,
      ) => {
        const games = profile.rating.games + 1;
        memoryRatings.set(profile.firebaseUid, next);
        memoryUsers.set(profile.firebaseUid, {
          ...profile,
          rating: toSummary(next, games),
          stats: { ...profile.stats, rating: Math.round(next.rating) },
        });
        const history = memoryRatingHistory.get(profile.firebaseUid) || [];
        history.unshift({
          gameId,
          outcome: outcomeFor(result, color),
          opponentRating: Math.round(opponent.rating),
          ratingBefore: Math.round(before.rating),
          ratingAfter: Math.round(next.rating),
          createdAt: new Date().toISOString(),
        });
        memoryRatingHistory.set(profile.firebaseUid, history);
      };
      record(white, 'white', whiteBefore, after.white, blackBefore);
      // Re-read: the white update replaced the stored profile object.
      record(memoryUsers.get(blackUid) as UserProfile, 'black', blackBefore, after.black, whiteBefore);
      return { white: toChange(whiteBefore, after.white), black: toChange(blackBefore, after.black) };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock both rows, always in the same order, so two games sharing a
      // player cannot deadlock.
      const locked = await client.query(
        `SELECT firebase_uid, is_guest, rating, rating_deviation, rating_volatility
           FROM users
          WHERE firebase_uid = ANY($1::text[])
          ORDER BY firebase_uid
            FOR UPDATE`,
        [[whiteUid, blackUid]],
      );
      const whiteRow = locked.rows.find((row: any) => row.firebase_uid === whiteUid);
      const blackRow = locked.rows.find((row: any) => row.firebase_uid === blackUid);
      if (!whiteRow || !blackRow || whiteRow.is_guest || blackRow.is_guest) {
        await client.query('ROLLBACK');
        return null;
      }

      const already = await client.query('SELECT 1 FROM rating_history WHERE game_id = $1 LIMIT 1', [gameId]);
      if (already.rows.length > 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const whiteBefore = ratingOfRow(whiteRow);
      const blackBefore = ratingOfRow(blackRow);
      const after = rateGame(whiteBefore, blackBefore, result);

      const write = async (
        uid: string,
        opponentUid: string,
        color: 'white' | 'black',
        before: Rating,
        next: Rating,
        opponent: Rating,
      ) => {
        await client.query(
          `UPDATE users SET
             rating = $2,
             rating_deviation = $3,
             rating_volatility = $4,
             rated_games = rated_games + 1,
             stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{rating}', to_jsonb($5::int)),
             updated_at = CURRENT_TIMESTAMP
           WHERE firebase_uid = $1`,
          [uid, next.rating, next.deviation, next.volatility, Math.round(next.rating)],
        );
        await client.query(
          `INSERT INTO rating_history
             (firebase_uid, game_id, opponent_uid, opponent_rating, outcome, rating_before, rating_after, deviation_after)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [uid, gameId, opponentUid, opponent.rating, outcomeFor(result, color), before.rating, next.rating, next.deviation],
        );
      };
      await write(whiteUid, blackUid, 'white', whiteBefore, after.white, blackBefore);
      await write(blackUid, whiteUid, 'black', blackBefore, after.black, whiteBefore);

      await client.query('COMMIT');
      return { white: toChange(whiteBefore, after.white), black: toChange(blackBefore, after.black) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** The highest-rated players who have played enough games to be ranked. */
  static async getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
    const size = Math.max(1, Math.min(100, Math.floor(limit) || 50));

    if ((await getBackend()) === 'memory') {
      return Array.from(memoryUsers.values())
        .filter((user) => !user.isGuest && user.rating.games >= LEADERBOARD_MIN_GAMES)
        .sort((a, b) => b.rating.value - a.rating.value)
        .slice(0, size)
        .map((user, index) => ({
          rank: index + 1,
          name: user.displayName || user.username,
          rating: user.rating.value,
          provisional: user.rating.provisional,
          games: user.rating.games,
        }));
    }

    const result = await query(
      `SELECT username, display_name, rating, rating_deviation, rating_volatility, rated_games
         FROM users
        WHERE is_guest IS NOT TRUE AND rated_games >= $1
        ORDER BY rating DESC, rated_games DESC
        LIMIT $2`,
      [LEADERBOARD_MIN_GAMES, size],
    );
    // Names only: no email addresses and no account ids leave the server here.
    return result.rows.map((row: any, index: number) => ({
      rank: index + 1,
      name: row.display_name || row.username,
      rating: Math.round(ratingOfRow(row).rating),
      provisional: isProvisional(ratingOfRow(row)),
      games: Number(row.rated_games) || 0,
    }));
  }

  /** A player's most recent rated games, newest first. */
  static async getRatingHistory(firebaseUid: string, limit = 50): Promise<RatingHistoryEntry[]> {
    const size = Math.max(1, Math.min(200, Math.floor(limit) || 50));

    if ((await getBackend()) === 'memory') {
      return (memoryRatingHistory.get(firebaseUid) || []).slice(0, size);
    }

    const result = await query(
      `SELECT game_id, outcome, opponent_rating, rating_before, rating_after, created_at
         FROM rating_history
        WHERE firebase_uid = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [firebaseUid, size],
    );
    return result.rows.map((row: any) => ({
      gameId: row.game_id,
      outcome: row.outcome,
      opponentRating: Math.round(Number(row.opponent_rating)),
      ratingBefore: Math.round(Number(row.rating_before)),
      ratingAfter: Math.round(Number(row.rating_after)),
      createdAt: toIso(row.created_at),
    }));
  }

  /** Test helper: forget the cached backend choice and any in-memory users. */
  static resetForTests(): void {
    backendPromise = null;
    memoryUsers.clear();
    memoryRatings.clear();
    memoryRatingHistory.clear();
  }
}
