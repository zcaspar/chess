import express from 'express';
import request from 'supertest';

const mockVerifyIdToken = jest.fn();

jest.mock('../config/firebase-admin', () => ({
  auth: { verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args) },
  firebaseAdmin: {},
  firestore: {},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const analysisRoutes = require('../routes/analysis').default;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/analysis', analysisRoutes);
  return app;
};

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const lc0Ok = () =>
  jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      move: { uci: 'e2e4', san: 'e4' },
      engine: 'lc0',
      responseTime: 42,
    }),
  });

describe('LC0 proxy endpoints', () => {
  let app: express.Express;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    app = buildApp();
    fetchMock = lc0Ok();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockVerifyIdToken.mockResolvedValue({ uid: 'real-user' });
  });

  describe('POST /api/analysis/hint', () => {
    it('serves a signed-out visitor', async () => {
      // Playing the computer and asking for a hint do not require signing in,
      // so this endpoint must answer an anonymous request. Requiring a token
      // here once broke the AI opponent for every visitor.
      const res = await request(app).post('/api/analysis/hint').send({ fen: START_FEN });

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('serves a request carrying an unusable token rather than rejecting it', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Decoding Firebase ID token failed'));

      const res = await request(app)
        .post('/api/analysis/hint')
        .set('Authorization', 'Bearer garbage')
        .send({ fen: START_FEN });

      expect(res.status).toBe(200);
    });

    it('still serves an authenticated request', async () => {
      const res = await request(app)
        .post('/api/analysis/hint')
        .set('Authorization', 'Bearer good-token')
        .send({ fen: START_FEN });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('rejects a request with no FEN', async () => {
      const res = await request(app)
        .post('/api/analysis/hint')
        .set('Authorization', 'Bearer good-token')
        .send({});

      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/analysis/best-move', () => {
    it('serves a signed-out visitor', async () => {
      // This is the endpoint the AI opponent calls for every one of its moves.
      // If it demands a token the board silently falls back to the weak local
      // evaluator, which looks like "the engine is broken" rather than an error.
      const res = await request(app)
        .post('/api/analysis/best-move')
        .send({ fen: START_FEN, difficulty: 'expert' });

      expect(res.status).toBe(200);
      expect(res.body.move).toMatchObject({ from: 'e2', to: 'e4' });
    });

    it('serves a request carrying an unusable token rather than rejecting it', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Decoding Firebase ID token failed'));

      const res = await request(app)
        .post('/api/analysis/best-move')
        .set('Authorization', 'Bearer garbage')
        .send({ fen: START_FEN });

      expect(res.status).toBe(200);
    });

    it('proxies an authenticated request and returns the move', async () => {
      const res = await request(app)
        .post('/api/analysis/best-move')
        .set('Authorization', 'Bearer good-token')
        .send({ fen: START_FEN, difficulty: 'medium' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.move).toMatchObject({ from: 'e2', to: 'e4' });
    });

    it('reports 503 when the LC0 service is down', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

      const res = await request(app)
        .post('/api/analysis/best-move')
        .set('Authorization', 'Bearer good-token')
        .send({ fen: START_FEN });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
    });

    it('rejects a request with no FEN', async () => {
      const res = await request(app)
        .post('/api/analysis/best-move')
        .set('Authorization', 'Bearer good-token')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/analysis/position', () => {
    it('already requires a token', async () => {
      const res = await request(app)
        .post('/api/analysis/position')
        .send({ fen: START_FEN });

      expect(res.status).toBe(401);
    });

    it('serves an authenticated request', async () => {
      const res = await request(app)
        .post('/api/analysis/position')
        .set('Authorization', 'Bearer good-token')
        .send({ fen: START_FEN });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
