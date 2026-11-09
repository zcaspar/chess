import express from 'express';
import request from 'supertest';

const mockVerifyIdToken = jest.fn();

jest.mock('../config/firebase-admin', () => ({
  auth: { verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args) },
  firebaseAdmin: {},
  firestore: {},
}));

// An in-memory stand-in for the `users` table: enough SQL-shape awareness to
// prove the model reads and writes Postgres rather than process memory.
type Row = Record<string, any>;
let rows: Row[] = [];
const mockQuery = jest.fn(async (sql: string, params: any[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (text.startsWith('CREATE TABLE') || text.startsWith('ALTER TABLE')) {
    return { rows: [], rowCount: 0 };
  }
  if (text.startsWith('SELECT * FROM users WHERE firebase_uid')) {
    return { rows: rows.filter((r) => r.firebase_uid === params[0]) };
  }
  if (text.startsWith('INSERT INTO users')) {
    if (rows.some((r) => r.username === params[1])) {
      throw Object.assign(new Error('duplicate'), { code: '23505', constraint: 'users_username_key' });
    }
    const row: Row = {
      firebase_uid: params[0],
      username: params[1],
      email: params[2],
      display_name: params[3],
      is_guest: params[4],
      preferences: JSON.parse(params[5]),
      stats: JSON.parse(params[6]),
      created_at: new Date(),
      updated_at: new Date(),
      last_login: new Date(),
    };
    rows.push(row);
    return { rows: [row], rowCount: 1 };
  }
  if (text.startsWith('UPDATE users SET username')) {
    const row = rows.find((r) => r.firebase_uid === params[0]);
    if (!row) return { rows: [], rowCount: 0 };
    row.username = params[1] ?? row.username;
    row.display_name = params[2] ?? row.display_name;
    row.avatar_url = params[3] ?? row.avatar_url;
    row.preferences = { ...row.preferences, ...JSON.parse(params[4]) };
    row.stats = { ...row.stats, ...JSON.parse(params[5]) };
    return { rows: [row], rowCount: 1 };
  }
  if (text.startsWith('UPDATE users SET last_login')) {
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith('DELETE FROM users')) {
    const before = rows.length;
    rows = rows.filter((r) => r.firebase_uid !== params[0]);
    return { rows: [], rowCount: before - rows.length };
  }
  throw new Error(`Unexpected SQL in test: ${text.slice(0, 80)}`);
});

jest.mock('../config/database', () => ({
  pool: { query: (...a: any[]) => (mockQuery as any)(...a) },
  query: (...a: any[]) => (mockQuery as any)(...a),
  testConnection: jest.fn().mockResolvedValue(true),
  getPoolStatus: jest.fn(),
  closePool: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const userRoutes = require('../routes/users').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sanitizeProfileUpdates } = require('../routes/users');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { UserModel } = require('../models/User');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  return app;
};

const asUser = (uid: string, extra: Record<string, unknown> = {}) => {
  mockVerifyIdToken.mockImplementation(async (token: string) => {
    if (token === 'guest-token') return { uid: 'guest-uid' };
    if (token === 'bad-token') throw new Error('invalid');
    return { uid, email: `${uid}@example.com`, ...extra };
  });
};

const auth = { Authorization: 'Bearer good-token' };

describe('user profiles', () => {
  beforeEach(() => {
    rows = [];
    mockQuery.mockClear();
    mockVerifyIdToken.mockReset();
    UserModel.resetForTests();
  });

  it('stores a new profile in the database, not in process memory', async () => {
    asUser('alice');
    const app = buildApp();

    const created = await request(app).post('/api/users/profile').set(auth).send({ username: 'alice' });
    expect(created.status).toBe(201);
    expect(rows).toHaveLength(1);

    // A "restart": everything the process held in memory is gone.
    UserModel.resetForTests();
    const fetched = await request(app).get('/api/users/profile').set(auth);

    expect(fetched.status).toBe(200);
    expect(fetched.body).toMatchObject({ id: 'alice', username: 'alice', stats: { rating: 1200, wins: 0 } });
  });

  it('takes the email from the verified token, never from the request body', async () => {
    asUser('alice');

    await request(buildApp())
      .post('/api/users/profile')
      .set(auth)
      .send({ username: 'alice', email: 'victim@example.com' });

    expect(rows[0].email).toBe('alice@example.com');
  });

  it('reports a taken username as a conflict', async () => {
    asUser('alice');
    await request(buildApp()).post('/api/users/profile').set(auth).send({ username: 'sam' });
    asUser('bob');

    const res = await request(buildApp()).post('/api/users/profile').set(auth).send({ username: 'sam' });

    expect(res.status).toBe(409);
  });

  describe('PATCH /profile', () => {
    beforeEach(async () => {
      asUser('alice');
      await request(buildApp()).post('/api/users/profile').set(auth).send({ username: 'alice' });
    });

    it('does not let a client set its own rating, email or guest flag', async () => {
      const res = await request(buildApp())
        .patch('/api/users/profile')
        .set(auth)
        .send({
          email: 'victim@example.com',
          isGuest: true,
          firebaseUid: 'someone-else',
          stats: { rating: 3000, wins: 3 },
        });

      expect(res.status).toBe(200);
      expect(rows[0].email).toBe('alice@example.com');
      expect(rows[0].is_guest).toBe(false);
      expect(rows[0].firebase_uid).toBe('alice');
      expect(rows[0].stats.rating).toBe(1200);
      expect(rows[0].stats.wins).toBe(3);
    });

    it('merges preferences instead of replacing them', async () => {
      await request(buildApp())
        .patch('/api/users/profile')
        .set(auth)
        .send({ preferences: { boardOrientation: 'black' } });

      expect(rows[0].preferences).toMatchObject({ boardOrientation: 'black', boardTheme: 'classic' });
    });

    it.each([
      [{ stats: { wins: -1 } }],
      [{ stats: { wins: 1.5 } }],
      [{ stats: { gamesPlayed: '10' } }],
      [{ stats: 'lots' }],
      [{ username: 'a' }],
      [{ username: 'has spaces' }],
      [{ avatarUrl: 'javascript:alert(1)' }],
      [{ preferences: { blob: 'x'.repeat(5000) } }],
    ])('rejects %j', async (body) => {
      const res = await request(buildApp()).patch('/api/users/profile').set(auth).send(body);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /upgrade-guest', () => {
    const seedGuest = async () => {
      asUser('guest-uid');
      await request(buildApp())
        .post('/api/users/profile')
        .set(auth)
        .send({ username: 'guest_1', isGuest: true });
    };

    it('refuses to take over a guest account from its UID alone', async () => {
      await seedGuest();
      asUser('mallory');

      const res = await request(buildApp())
        .post('/api/users/upgrade-guest')
        .set(auth)
        .send({ guestUid: 'guest-uid' });

      expect(res.status).toBe(400);
      expect(rows.map((r) => r.firebase_uid)).toEqual(['guest-uid']);
    });

    it('refuses an invalid guest token', async () => {
      await seedGuest();
      asUser('mallory');

      const res = await request(buildApp())
        .post('/api/users/upgrade-guest')
        .set(auth)
        .send({ guestToken: 'bad-token' });

      expect(res.status).toBe(403);
      expect(rows.map((r) => r.firebase_uid)).toEqual(['guest-uid']);
    });

    it('moves the guest profile to the new account when the guest token is presented', async () => {
      await seedGuest();
      rows[0].stats.wins = 4;
      asUser('alice');

      const res = await request(buildApp())
        .post('/api/users/upgrade-guest')
        .set(auth)
        .send({ guestToken: 'guest-token' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 'alice', isGuest: false, stats: { wins: 4 } });
      expect(rows.map((r) => r.firebase_uid)).toEqual(['alice']);
    });
  });

  it('no longer exposes the unauthenticated engine proxy', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);

    const res = await request(buildApp())
      .post('/api/users/analyze-position')
      .send({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' });

    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sanitizeProfileUpdates keeps only editable fields', () => {
    expect(
      sanitizeProfileUpdates({ displayName: '  Alice  ', id: 'x', createdAt: 'y', stats: { rating: 9, draws: 2 } }),
    ).toEqual({ displayName: 'Alice', stats: { draws: 2 } });
    expect(sanitizeProfileUpdates(null)).toEqual(expect.any(String));
  });
});
