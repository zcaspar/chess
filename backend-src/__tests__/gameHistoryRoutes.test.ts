import express from 'express';
import request from 'supertest';

const mockVerifyIdToken = jest.fn();

jest.mock('../config/firebase-admin', () => ({
  auth: { verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args) },
  firebaseAdmin: {},
  firestore: {},
}));

const mockGetRecentGames = jest.fn();
const mockInitializeTables = jest.fn();
const mockSaveGame = jest.fn();
const mockGetPlayerHistory = jest.fn();

jest.mock('../models/GameHistory', () => ({
  GameHistoryModel: {
    getRecentGames: (...a: unknown[]) => mockGetRecentGames(...a),
    initializeTables: (...a: unknown[]) => mockInitializeTables(...a),
    saveGame: (...a: unknown[]) => mockSaveGame(...a),
    getPlayerHistory: (...a: unknown[]) => mockGetPlayerHistory(...a),
    getPlayerStats: jest.fn().mockResolvedValue({}),
    getGameById: jest.fn().mockResolvedValue(null),
    deleteGame: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn().mockResolvedValue({ rows: [] }),
  testConnection: jest.fn().mockResolvedValue(true),
  getPoolStatus: jest.fn().mockReturnValue({
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0,
    maxConnections: 20,
  }),
  closePool: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const gameHistoryRoutes = require('../routes/gameHistory').default;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/game-history', gameHistoryRoutes);
  return app;
};

describe('GET /api/game-history/admin/recent', () => {
  const originalEnv = { ...process.env };
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
    mockGetRecentGames.mockResolvedValue([]);
    mockVerifyIdToken.mockResolvedValue({ uid: 'ordinary-user' });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/game-history/admin/recent');

    expect(res.status).toBe(401);
  });

  it('refuses an ordinary authenticated user when ADMIN_UIDS is unset', async () => {
    // The guard is `if (ADMIN_UIDS.length > 0 && !ADMIN_UIDS.includes(uid))`,
    // so an empty allow-list currently means "everyone is an admin".
    delete process.env.ADMIN_UIDS;

    const res = await request(app)
      .get('/api/game-history/admin/recent')
      .set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(403);
    expect(mockGetRecentGames).not.toHaveBeenCalled();
  });

  it('refuses an ordinary authenticated user when ADMIN_UIDS is empty', async () => {
    process.env.ADMIN_UIDS = '';

    const res = await request(app)
      .get('/api/game-history/admin/recent')
      .set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(403);
  });

  it('refuses a user who is not in ADMIN_UIDS', async () => {
    process.env.ADMIN_UIDS = 'admin-1,admin-2';

    const res = await request(app)
      .get('/api/game-history/admin/recent')
      .set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(403);
  });

  it('allows a uid listed in ADMIN_UIDS', async () => {
    process.env.ADMIN_UIDS = 'admin-1,ordinary-user';

    const res = await request(app)
      .get('/api/game-history/admin/recent')
      .set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockGetRecentGames).toHaveBeenCalled();
  });

  it('caps the requested limit', async () => {
    process.env.ADMIN_UIDS = 'ordinary-user';

    const res = await request(app)
      .get('/api/game-history/admin/recent?limit=500')
      .set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(400);
  });
});

describe('POST /api/game-history/init-tables', () => {
  const originalEnv = { ...process.env };
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
    mockInitializeTables.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is refused in production', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request(app).post('/api/game-history/init-tables');

    expect(res.status).toBe(403);
    expect(mockInitializeTables).not.toHaveBeenCalled();
  });

  it('is refused when NODE_ENV is unset', async () => {
    // Schema mutation must not be reachable unauthenticated just because a
    // deployment forgot to set NODE_ENV.
    delete process.env.NODE_ENV;

    const res = await request(app).post('/api/game-history/init-tables');

    expect(res.status).not.toBe(200);
    expect(mockInitializeTables).not.toHaveBeenCalled();
  });

  it('requires authentication even in development', async () => {
    process.env.NODE_ENV = 'development';

    const res = await request(app).post('/api/game-history/init-tables');

    expect(res.status).toBe(401);
    expect(mockInitializeTables).not.toHaveBeenCalled();
  });
});

describe('POST /api/game-history', () => {
  let app: express.Express;

  const validGame = {
    gameId: 'game-1',
    opponentName: 'Computer (medium)',
    playerColor: 'w',
    gameResult: 'Checkmate! Player 1 wins!',
    gameOutcome: 'win',
    finalFen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    pgn: '1. f3 e5 2. g4 Qh4#',
    moveCount: 4,
    gameMode: 'human-vs-ai',
  };

  beforeEach(() => {
    app = buildApp();
    mockVerifyIdToken.mockResolvedValue({ uid: 'real-user' });
    mockSaveGame.mockResolvedValue({ id: 1, ...validGame });
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/game-history').send(validGame);

    expect(res.status).toBe(401);
    expect(mockSaveGame).not.toHaveBeenCalled();
  });

  it('saves the game against the authenticated uid, not a client-supplied one', async () => {
    const res = await request(app)
      .post('/api/game-history')
      .set('Authorization', 'Bearer good-token')
      .send({ ...validGame, playerId: 'someone-elses-uid' });

    expect(res.status).toBeLessThan(400);
    expect(mockSaveGame).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'real-user' }),
    );
  });
});
