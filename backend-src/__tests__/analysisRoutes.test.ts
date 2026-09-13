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
    it('requires a token', async () => {
      // /hint proxies straight to the LC0 GPU service. Without auth anyone on
      // the internet can burn that capacity.
      const res = await request(app).post('/api/analysis/hint').send({ fen: START_FEN });

      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an invalid token', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Decoding Firebase ID token failed'));

      const res = await request(app)
        .post('/api/analysis/hint')
        .set('Authorization', 'Bearer garbage')
        .send({ fen: START_FEN });

      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
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
    it('requires a token', async () => {
      const res = await request(app)
        .post('/api/analysis/best-move')
        .send({ fen: START_FEN, difficulty: 'expert' });

      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an invalid token', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Decoding Firebase ID token failed'));

      const res = await request(app)
        .post('/api/analysis/best-move')
        .set('Authorization', 'Bearer garbage')
        .send({ fen: START_FEN });

      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
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
