import express from 'express';
import request from 'supertest';

jest.mock('../config/firebase-admin', () => ({
  auth: { verifyIdToken: jest.fn().mockResolvedValue({ uid: 'real-user' }) },
  firebaseAdmin: {},
  firestore: {},
}));

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * The limiter keeps its counters in module state, so each test needs a fresh
 * copy of the router to start from an empty bucket.
 */
const buildApp = () => {
  let app: express.Express;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const analysisRoutes = require('../routes/analysis').default;
    app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api/analysis', analysisRoutes);
  });
  return app!;
};

describe('LC0 proxy rate limiting', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ move: { uci: 'e2e4', san: 'e4' }, engine: 'lc0' }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const post = (app: express.Express, path: string) =>
    request(app).post(path).send({ fen: START_FEN });

  it('allows a normal run of moves without tripping', async () => {
    process.env.LC0_RATE_LIMIT_PER_MINUTE = '60';
    const app = buildApp();

    // A brisk blitz game asks for far fewer than this in a minute.
    for (let i = 0; i < 30; i += 1) {
      const res = await post(app, '/api/analysis/best-move');
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 once one address exceeds the limit', async () => {
    process.env.LC0_RATE_LIMIT_PER_MINUTE = '3';
    const app = buildApp();

    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await post(app, '/api/analysis/best-move')).status);
    }

    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  it('stops calling the engine service once the limit is hit', async () => {
    process.env.LC0_RATE_LIMIT_PER_MINUTE = '2';
    const app = buildApp();

    await post(app, '/api/analysis/best-move');
    await post(app, '/api/analysis/best-move');
    (global.fetch as jest.Mock).mockClear();

    const res = await post(app, '/api/analysis/best-move');

    expect(res.status).toBe(429);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('tells the client how to back off', async () => {
    process.env.LC0_RATE_LIMIT_PER_MINUTE = '1';
    const app = buildApp();

    await post(app, '/api/analysis/best-move');
    const res = await post(app, '/api/analysis/best-move');

    expect(res.status).toBe(429);
    expect(res.headers).toHaveProperty('ratelimit-reset');
    expect(res.body.message).toMatch(/wait a moment/i);
  });

  it('shares one budget across hint and best-move', async () => {
    // Both hit the same engine service, so a client cannot double its quota by
    // alternating between them.
    process.env.LC0_RATE_LIMIT_PER_MINUTE = '2';
    const app = buildApp();

    expect((await post(app, '/api/analysis/best-move')).status).toBe(200);
    expect((await post(app, '/api/analysis/hint')).status).toBe(200);
    expect((await post(app, '/api/analysis/hint')).status).toBe(429);
  });

  it('limits position analysis on its own, tighter budget', async () => {
    process.env.LC0_ANALYSIS_RATE_LIMIT_PER_MINUTE = '1';
    process.env.LC0_RATE_LIMIT_PER_MINUTE = '60';
    const app = buildApp();

    const analyse = () =>
      request(app)
        .post('/api/analysis/position')
        .set('Authorization', 'Bearer good-token')
        .send({ fen: START_FEN });

    expect((await analyse()).status).toBe(200);
    expect((await analyse()).status).toBe(429);

    // The move endpoint keeps its own, larger allowance.
    expect((await post(app, '/api/analysis/best-move')).status).toBe(200);
  });

  it('falls back to a sane default when the env var is nonsense', async () => {
    process.env.LC0_RATE_LIMIT_PER_MINUTE = 'not-a-number';
    const app = buildApp();

    // Default is 60/min, so a handful of requests must still be served.
    for (let i = 0; i < 5; i += 1) {
      expect((await post(app, '/api/analysis/best-move')).status).toBe(200);
    }
  });
});
