/**
 * UserModel against a REAL Postgres.
 *
 * Skipped unless TEST_DATABASE_URL is set (see migration.integration.test.ts
 * for how to start a throwaway server). The mocked route tests prove the model
 * asks the database for the right thing; only this proves Postgres accepts the
 * SQL — in particular the JSONB arithmetic in recordGameResult.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Its own schema: jest runs test files in parallel, and the migration
// integration test creates and drops tables in `public` on the same server.
const SCHEMA = 'usermodel_test';

if (TEST_DATABASE_URL) {
  const separator = TEST_DATABASE_URL.includes('?') ? '&' : '?';
  process.env.DATABASE_URL = `${TEST_DATABASE_URL}${separator}options=-c%20search_path%3D${SCHEMA}`;
}

const describeOrSkip = TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('UserModel (live Postgres)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pool, query } = require('../config/database');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { UserModel } = require('../models/User');

  beforeAll(async () => {
    await query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  });

  beforeEach(async () => {
    await query('DROP TABLE IF EXISTS users CASCADE');
    UserModel.resetForTests();
  });

  afterAll(async () => {
    await query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pool.end();
  });

  it('creates the table on first use and round-trips a profile', async () => {
    const created = await UserModel.create({ firebaseUid: 'u1', username: 'alice', email: 'a@example.com' });
    expect(created).toMatchObject({ id: 'u1', username: 'alice', isGuest: false, stats: { rating: 1500 } });

    UserModel.resetForTests(); // nothing may depend on process memory
    const found = await UserModel.findByFirebaseUid('u1');
    expect(found).toMatchObject({ username: 'alice', email: 'a@example.com' });
    expect(await UserModel.findByFirebaseUid('nobody')).toBeNull();
  });

  it('allows any number of guests with no email', async () => {
    await UserModel.create({ firebaseUid: 'g1', username: 'guest_1', email: '', isGuest: true });
    await UserModel.create({ firebaseUid: 'g2', username: 'guest_2', email: '', isGuest: true });

    expect((await UserModel.getStats()).guestUsers).toBe(2);
  });

  it('relaxes a legacy NOT NULL email column', async () => {
    await query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(128) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        display_name VARCHAR(100),
        avatar_url TEXT,
        is_guest BOOLEAN DEFAULT FALSE,
        preferences JSONB DEFAULT '{}',
        stats JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await expect(
      UserModel.create({ firebaseUid: 'g1', username: 'guest_1', email: '', isGuest: true }),
    ).resolves.toMatchObject({ email: '' });
  });

  it('maps unique violations to the messages the routes expect', async () => {
    await UserModel.create({ firebaseUid: 'u1', username: 'alice', email: 'a@example.com' });

    await expect(
      UserModel.create({ firebaseUid: 'u2', username: 'alice', email: 'b@example.com' }),
    ).rejects.toThrow('Username already taken');
    await expect(
      UserModel.create({ firebaseUid: 'u3', username: 'carol', email: 'a@example.com' }),
    ).rejects.toThrow('Email already in use');
    await expect(
      UserModel.create({ firebaseUid: 'u1', username: 'dave', email: 'd@example.com' }),
    ).rejects.toThrow('User already exists');
  });

  it('merges preferences and stats on update', async () => {
    await UserModel.create({ firebaseUid: 'u1', username: 'alice', email: 'a@example.com' });

    const updated = await UserModel.update('u1', {
      displayName: 'Alice',
      preferences: { boardOrientation: 'black' },
      stats: { wins: 2 },
    });

    expect(updated).toMatchObject({
      username: 'alice',
      displayName: 'Alice',
      preferences: { boardOrientation: 'black', boardTheme: 'classic' },
      stats: { wins: 2, rating: 1500, losses: 0 },
    });
    await expect(UserModel.update('nobody', { displayName: 'x' })).rejects.toThrow('User not found');
  });

  it('scores games: counters, win streak and best streak', async () => {
    await UserModel.create({ firebaseUid: 'u1', username: 'alice', email: 'a@example.com' });

    for (const outcome of ['win', 'win', 'draw', 'win', 'loss']) {
      expect(await UserModel.recordGameResult('u1', outcome)).toBe(true);
    }

    expect((await UserModel.findByFirebaseUid('u1')).stats).toMatchObject({
      gamesPlayed: 5,
      wins: 3,
      draws: 1,
      losses: 1,
      winStreak: 0,
      bestWinStreak: 2,
      rating: 1500,
    });
    expect(await UserModel.recordGameResult('nobody', 'win')).toBe(false);
  });

  it('does not lose results recorded at the same moment', async () => {
    await UserModel.create({ firebaseUid: 'u1', username: 'alice', email: 'a@example.com' });

    await Promise.all(Array.from({ length: 20 }, () => UserModel.recordGameResult('u1', 'win')));

    expect((await UserModel.findByFirebaseUid('u1')).stats).toMatchObject({ gamesPlayed: 20, wins: 20 });
  });

  it('deletes a profile', async () => {
    await UserModel.create({ firebaseUid: 'u1', username: 'alice', email: 'a@example.com' });

    expect(await UserModel.delete('u1')).toBe(true);
    expect(await UserModel.delete('u1')).toBe(false);
  });
});
