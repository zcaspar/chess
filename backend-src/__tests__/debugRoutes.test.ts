import request from 'supertest';

// Nothing in this suite may reach a real database, cache or Firebase project.
const mockQuery = jest.fn();

jest.mock('../config/database', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
  query: (...args: unknown[]) => mockQuery(...args),
  testConnection: jest.fn().mockResolvedValue(true),
  getPoolStatus: jest.fn().mockReturnValue({
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0,
    maxConnections: 20,
  }),
  closePool: jest.fn(),
}));

jest.mock('../config/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(false),
  closeRedis: jest.fn(),
  RedisManager: {
    setAvailable: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ connected: false, latency: 0 }),
  },
}));

jest.mock('../config/firebase-admin', () => ({
  auth: { verifyIdToken: jest.fn().mockRejectedValue(new Error('no token')) },
  firebaseAdmin: {},
  firestore: {},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require('../app');

const DEBUG_ROUTES = [
  '/debug/env',
  '/debug/db-test',
  '/debug/test-game-history',
  '/debug/game-history',
];

describe('debug endpoints in production', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockQuery.mockResolvedValue({ rows: [{ exists: true, count: '0', test: 1 }] });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it.each(DEBUG_ROUTES)(
    'does not expose %s when NODE_ENV is production',
    async (route) => {
      process.env.NODE_ENV = 'production';
      const app = createApp();

      const res = await request(app).get(route);

      expect(res.status).toBe(404);
    },
  );

  it.each(DEBUG_ROUTES)(
    'does not expose %s when NODE_ENV is unset',
    async (route) => {
      // A deployment that forgets NODE_ENV must not silently open these up.
      delete process.env.NODE_ENV;
      const app = createApp();

      const res = await request(app).get(route);

      expect(res.status).toBe(404);
    },
  );

  it('never returns the value of PGPASSWORD from /debug/env', async () => {
    process.env.NODE_ENV = 'development';
    process.env.PGPASSWORD = 'super-secret-password';
    const app = createApp();

    const res = await request(app).get('/debug/env');

    expect(JSON.stringify(res.body)).not.toContain('super-secret-password');
  });

  it('never returns the value of DATABASE_URL from /debug/env', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL =
      'postgresql://chessuser:hunter2@db.internal:5432/railway';
    const app = createApp();

    const res = await request(app).get('/debug/env');

    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(JSON.stringify(res.body)).not.toContain('db.internal');
  });
});

describe('health endpoints', () => {
  beforeEach(() => {
    mockQuery.mockResolvedValue({ rows: [{ now: new Date().toISOString() }] });
  });

  it('/health stays available in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = createApp();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('/health does not leak environment configuration', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PGPASSWORD = 'super-secret-password';
    const app = createApp();

    const res = await request(app).get('/health');

    expect(JSON.stringify(res.body)).not.toContain('super-secret-password');
  });
});
