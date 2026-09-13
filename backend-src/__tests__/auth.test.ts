import express from 'express';
import request from 'supertest';

// The auth middleware verifies tokens through firebase-admin. Stub it so the
// tests control exactly what verifyIdToken throws.
const mockVerifyIdToken = jest.fn();

jest.mock('../config/firebase-admin', () => ({
  auth: { verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args) },
  firebaseAdmin: {},
  firestore: {},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyFirebaseToken, optionalAuth } = require('../middleware/auth');

const buildApp = (middleware: express.RequestHandler) => {
  const app = express();
  app.use(express.json());
  app.get('/protected', middleware, (req: any, res) => {
    res.json({ uid: req.user?.uid ?? null });
  });
  return app;
};

/**
 * Firebase Admin throws these messages when it has no usable credentials. The
 * middleware treats them as "developer machine without Firebase set up" and
 * mints a demo user instead of rejecting the request — which is only safe when
 * the deployment has explicitly opted in.
 */
const CONFIG_ERRORS = [
  'auth/invalid-project-id',
  'The default Firebase app does no-app exist.',
  'app/invalid-credential',
];

describe('verifyFirebaseToken', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(buildApp(verifyFirebaseToken)).get('/protected');

    expect(res.status).toBe(401);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects an Authorization header that is not a Bearer token', async () => {
    const res = await request(buildApp(verifyFirebaseToken))
      .get('/protected')
      .set('Authorization', 'Basic abc123');

    expect(res.status).toBe(401);
  });

  it('accepts a valid token and attaches the user', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'real-user',
      email: 'real@example.com',
      name: 'Real User',
    });

    const res = await request(buildApp(verifyFirebaseToken))
      .get('/protected')
      .set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(200);
    expect(res.body.uid).toBe('real-user');
  });

  it('rejects a plainly invalid token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Decoding Firebase ID token failed'));

    const res = await request(buildApp(verifyFirebaseToken))
      .get('/protected')
      .set('Authorization', 'Bearer garbage');

    expect(res.status).toBe(401);
  });

  describe('the Firebase-misconfiguration fallback', () => {
    it.each(CONFIG_ERRORS)(
      'rejects the request for "%s" when ALLOW_DEMO_AUTH is unset, even in development',
      async (message) => {
        process.env.NODE_ENV = 'development';
        delete process.env.ALLOW_DEMO_AUTH;
        mockVerifyIdToken.mockRejectedValue(new Error(message));

        const res = await request(buildApp(verifyFirebaseToken))
          .get('/protected')
          .set('Authorization', 'Bearer garbage');

        expect(res.status).toBe(401);
      },
    );

    it.each(CONFIG_ERRORS)(
      'rejects the request for "%s" when NODE_ENV is unset entirely',
      async (message) => {
        // This is the scenario that turns the fallback into a live bypass: a
        // deployment that forgets to set NODE_ENV=production is treated as
        // "not production" and mints a demo user for any garbage token.
        delete process.env.NODE_ENV;
        delete process.env.ALLOW_DEMO_AUTH;
        mockVerifyIdToken.mockRejectedValue(new Error(message));

        const res = await request(buildApp(verifyFirebaseToken))
          .get('/protected')
          .set('Authorization', 'Bearer garbage');

        expect(res.status).toBe(401);
      },
    );

    it('rejects the request in production regardless of ALLOW_DEMO_AUTH', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_DEMO_AUTH = 'true';
      mockVerifyIdToken.mockRejectedValue(new Error('app/invalid-credential'));

      const res = await request(buildApp(verifyFirebaseToken))
        .get('/protected')
        .set('Authorization', 'Bearer garbage');

      expect(res.status).toBe(401);
    });

    it('mints a demo user only when ALLOW_DEMO_AUTH is explicitly set', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEMO_AUTH = 'true';
      mockVerifyIdToken.mockRejectedValue(new Error('app/invalid-credential'));

      const res = await request(buildApp(verifyFirebaseToken))
        .get('/protected')
        .set('Authorization', 'Bearer garbage');

      expect(res.status).toBe(200);
      expect(res.body.uid).toMatch(/^demo-user-/);
    });
  });
});

describe('optionalAuth', () => {
  it('continues without a user when no token is supplied', async () => {
    const res = await request(buildApp(optionalAuth)).get('/protected');

    expect(res.status).toBe(200);
    expect(res.body.uid).toBeNull();
  });

  it('continues without a user when the token is invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Decoding Firebase ID token failed'));

    const res = await request(buildApp(optionalAuth))
      .get('/protected')
      .set('Authorization', 'Bearer garbage');

    expect(res.status).toBe(200);
    expect(res.body.uid).toBeNull();
  });

  it('attaches the user when the token is valid', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'real-user' });

    const res = await request(buildApp(optionalAuth))
      .get('/protected')
      .set('Authorization', 'Bearer good-token');

    expect(res.body.uid).toBe('real-user');
  });
});
