import express from 'express';
import { AuthenticatedRequest, verifyFirebaseToken, verifyToken } from '../middleware/auth';
import { UserModel, UserStats, UserUpdates } from '../models/User';
import { logger } from '../utils/logger';

const router = express.Router();

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;
const MAX_PREFERENCES_BYTES = 4096;

// Counters a client may report for games played on its own device (local and
// vs-computer games never touch the server, so they are self-reported by
// nature). `rating` is deliberately absent, and online results are scored by
// the server in GameSocketHandler.endGame, never through this route.
const CLIENT_STAT_COUNTERS: Array<keyof UserStats> = [
  'wins',
  'losses',
  'draws',
  'gamesPlayed',
  'totalPlayTime',
  'winStreak',
  'bestWinStreak',
];

const cleanString = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

/**
 * Reduce a PATCH body to the fields a user may change about their own
 * profile. The body used to be spread straight into the stored profile, so a
 * client could set its own rating, email, or any other field.
 * Returns a string describing the problem when the body is unacceptable.
 */
export const sanitizeProfileUpdates = (body: unknown): UserUpdates | string => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be an object';
  }
  const input = body as Record<string, unknown>;
  const updates: UserUpdates = {};

  if (input.username !== undefined) {
    if (typeof input.username !== 'string' || !USERNAME_PATTERN.test(input.username)) {
      return 'Username must be 3-30 letters, numbers or underscores';
    }
    updates.username = input.username;
  }

  const displayName = cleanString(input.displayName, 100);
  if (displayName) updates.displayName = displayName;

  const avatarUrl = cleanString(input.avatarUrl, 2048);
  if (avatarUrl) {
    if (!/^https:\/\//i.test(avatarUrl)) return 'avatarUrl must be an https URL';
    updates.avatarUrl = avatarUrl;
  }

  if (input.preferences !== undefined) {
    if (!input.preferences || typeof input.preferences !== 'object' || Array.isArray(input.preferences)) {
      return 'preferences must be an object';
    }
    if (JSON.stringify(input.preferences).length > MAX_PREFERENCES_BYTES) {
      return 'preferences is too large';
    }
    updates.preferences = input.preferences as UserUpdates['preferences'];
  }

  if (input.stats !== undefined) {
    if (!input.stats || typeof input.stats !== 'object' || Array.isArray(input.stats)) {
      return 'stats must be an object';
    }
    const rawStats = input.stats as Record<string, unknown>;
    const stats: Partial<UserStats> = {};
    for (const key of CLIENT_STAT_COUNTERS) {
      const value = rawStats[key];
      if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000_000) {
        return `stats.${key} must be a non-negative integer`;
      }
      (stats as Record<string, number>)[key] = value;
    }
    const favorite = cleanString(rawStats.favoriteTimeControl, 32);
    if (favorite) stats.favoriteTimeControl = favorite;
    updates.stats = stats;
  }

  return updates;
};

// GET /api/users/profile - Get current user profile
router.get('/profile', verifyFirebaseToken, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const profile = await UserModel.findByFirebaseUid(req.user.uid);
    if (!profile) {
      res.status(404).json({ error: 'User profile not found' });
      return;
    }

    // Update last login
    await UserModel.updateLastLogin(req.user.uid);

    res.json(profile);
  } catch (error) {
    logger.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/profile - Create user profile
router.post('/profile', verifyFirebaseToken, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { username, displayName, isGuest } = req.body || {};

    if (typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    // Check if user profile already exists
    const existingProfile = await UserModel.findByFirebaseUid(req.user.uid);
    if (existingProfile) {
      res.status(409).json({ error: 'User profile already exists' });
      return;
    }

    // Create new user profile
    const profile = await UserModel.create({
      firebaseUid: req.user.uid,
      username: username.trim().slice(0, 50),
      // The address comes from the verified token only; a client-supplied
      // email would let one account squat on someone else's address.
      email: req.user.email || '',
      displayName: cleanString(displayName, 100) || req.user.name,
      isGuest: isGuest === true,
    });

    res.status(201).json(profile);
  } catch (error) {
    logger.error('Error creating user profile:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Username already taken' || error.message === 'Email already in use') {
        res.status(409).json({ error: error.message });
        return;
      }
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/profile - Update user profile
router.patch('/profile', verifyFirebaseToken, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const updates = sanitizeProfileUpdates(req.body);
    if (typeof updates === 'string') {
      res.status(400).json({ error: updates });
      return;
    }

    const updatedProfile = await UserModel.update(req.user.uid, updates);
    res.json(updatedProfile);
  } catch (error) {
    logger.error('Error updating user profile:', error);
    
    if (error instanceof Error) {
      if (error.message === 'User not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message === 'Username already taken' || error.message === 'Email already in use') {
        res.status(409).json({ error: error.message });
        return;
      }
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/upgrade-guest - Upgrade guest account to permanent account
router.post('/upgrade-guest', verifyFirebaseToken, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Proof of ownership: the caller must present the guest account's own ID
    // token. This used to accept a bare `guestUid`, so any signed-in user could
    // take over (and delete) any guest profile whose UID they knew.
    const { guestToken } = req.body || {};

    if (typeof guestToken !== 'string' || !guestToken) {
      res.status(400).json({ error: 'Guest token is required' });
      return;
    }

    let guestUid: string;
    try {
      guestUid = (await verifyToken(guestToken)).uid;
    } catch {
      res.status(403).json({ error: 'Invalid guest token' });
      return;
    }

    if (guestUid === req.user.uid) {
      res.status(400).json({ error: 'Guest and permanent accounts must differ' });
      return;
    }

    // Find the guest account
    const guestProfile = await UserModel.findByFirebaseUid(guestUid);
    if (!guestProfile || !guestProfile.isGuest) {
      res.status(404).json({ error: 'Guest account not found' });
      return;
    }

    // Transfer guest data to new permanent account
    const permanentProfile = await UserModel.create({
      firebaseUid: req.user.uid,
      username: req.user.email?.split('@')[0] || `user_${Date.now()}`,
      email: req.user.email || '',
      displayName: req.user.name,
      isGuest: false,
    });

    // Copy stats from guest account
    await UserModel.update(req.user.uid, {
      stats: guestProfile.stats,
      preferences: guestProfile.preferences,
    });

    // Delete guest account
    await UserModel.delete(guestUid);

    const updatedProfile = await UserModel.findByFirebaseUid(req.user.uid);
    res.json(updatedProfile);
  } catch (error) {
    logger.error('Error upgrading guest account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/leaderboard - Top rated players (public: names and ratings only)
router.get('/leaderboard', async (req, res): Promise<void> => {
  try {
    const limit = Number(req.query.limit) || 50;
    res.json({ players: await UserModel.getLeaderboard(limit) });
  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/rating-history - The caller's own recent rated games
router.get('/rating-history', verifyFirebaseToken, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const limit = Number(req.query.limit) || 50;
    res.json({ history: await UserModel.getRatingHistory(req.user.uid, limit) });
  } catch (error) {
    logger.error('Error fetching rating history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/stats - Get user statistics (development endpoint)
router.get('/stats', async (req, res) => {
  try {
    const stats = await UserModel.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/profile - Delete user account
router.delete('/profile', verifyFirebaseToken, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const deleted = await UserModel.delete(req.user.uid);
    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// The unauthenticated `/analyze-position` and `/debug-analysis` test routes
// that lived here were removed: they proxied to the engine with no token, no
// rate limit and no FEN validation, bypassing everything /api/analysis enforces.

export default router;