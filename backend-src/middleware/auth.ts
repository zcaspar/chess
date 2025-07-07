import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase-admin';

interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
  };
}

// Export token verification for Socket.io
export const verifyToken = async (token: string) => {
  const decodedToken = await auth.verifyIdToken(token);
  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    name: decodedToken.name,
    picture: decodedToken.picture,
  };
};

export const verifyFirebaseToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    
    try {
      const decodedToken = await auth.verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture,
      };
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      
      // Check if this is a Firebase Admin configuration issue
      const errorMessage = (error as Error)?.message || '';
      if (errorMessage.includes('auth/invalid-project-id') || 
          errorMessage.includes('no-app') ||
          errorMessage.includes('app/invalid-credential')) {
        console.warn('Firebase Admin not properly configured, using mock auth for development');
        // Create a mock user for development/demo purposes
        req.user = {
          uid: 'demo-user-' + Date.now(),
          email: 'demo@chess-app.com',
          name: 'Demo User',
        };
        next();
        return;
      }
      
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      
      try {
        const decodedToken = await auth.verifyIdToken(token);
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name,
          picture: decodedToken.picture,
        };
      } catch (error) {
        // Token is invalid, but continue without authentication
        console.warn('Invalid token in optional auth:', error);
      }
    }
    
    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next(); // Continue without authentication
  }
};

// Alias for backward compatibility
export const authenticateToken = verifyFirebaseToken;

export type { AuthenticatedRequest };