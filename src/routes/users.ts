import express from 'express';
import { AuthenticatedRequest, verifyFirebaseToken } from '../middleware/auth';
import { UserModel } from '../models/User';

const router = express.Router();

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
    console.error('Error fetching user profile:', error);
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

    const { username, email, displayName, isGuest } = req.body;

    if (!username) {
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
      username,
      email: email || req.user.email || '',
      displayName: displayName || req.user.name,
      isGuest: isGuest || false,
    });

    res.status(201).json(profile);
  } catch (error) {
    console.error('Error creating user profile:', error);
    
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

    const updates = req.body;
    
    // Don't allow updating certain fields
    delete updates.id;
    delete updates.firebaseUid;
    delete updates.createdAt;
    delete updates.isGuest; // Prevent changing guest status via this endpoint

    const updatedProfile = await UserModel.update(req.user.uid, updates);
    res.json(updatedProfile);
  } catch (error) {
    console.error('Error updating user profile:', error);
    
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

    const { guestUid } = req.body;

    if (!guestUid) {
      res.status(400).json({ error: 'Guest UID is required' });
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
    console.error('Error upgrading guest account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/stats - Get user statistics (development endpoint)
router.get('/stats', (req, res) => {
  try {
    const stats = UserModel.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching user stats:', error);
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
    console.error('Error deleting user account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;