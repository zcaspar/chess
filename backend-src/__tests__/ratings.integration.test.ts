/**
 * Ratings against a REAL Postgres.
 *
 * Skipped unless TEST_DATABASE_URL is set (see migration.integration.test.ts
 * for how to start a throwaway server). Rating a game is a transaction with
 * row locks; only a real database can show that it holds under concurrency.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Its own schema: jest runs test files in parallel against the same server.
const SCHEMA = 'ratings_test';

if (TEST_DATABASE_URL) {
  const separator = TEST_DATABASE_URL.includes('?') ? '&' : '?';
  process.env.DATABASE_URL = `${TEST_DATABASE_URL}${separator}options=-c%20search_path%3D${SCHEMA}`;
}

const describeOrSkip = TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('ratings (live Postgres)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pool, query } = require('../config/database');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { UserModel } = require('../models/User');

  const addPlayer = (uid: string, isGuest = false) =>
    UserModel.create({ firebaseUid: uid, username: uid, email: isGuest ? '' : `${uid}@example.com`, isGuest });

  beforeAll(async () => {
    await query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  });

  beforeEach(async () => {
    await query('DROP TABLE IF EXISTS rating_history');
    await query('DROP TABLE IF EXISTS users CASCADE');
    UserModel.resetForTests();
  });

  afterAll(async () => {
    await query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pool.end();
  });

  it('starts everyone at a provisional 1500', async () => {
    const profile = await addPlayer('alice');

    expect(profile.rating).toEqual({ value: 1500, deviation: 350, provisional: true, games: 0 });
    expect(profile.stats.rating).toBe(1500);
    expect(await UserModel.getRatingSummary('alice')).toMatchObject({ value: 1500 });
  });

  it('adds the rating columns to a users table that predates them', async () => {
    await query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        display_name VARCHAR(100),
        avatar_url TEXT,
        is_guest BOOLEAN DEFAULT FALSE,
        preferences JSONB DEFAULT '{}',
        stats JSONB DEFAULT '{"rating": 1200}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`INSERT INTO users (firebase_uid, username) VALUES ('old', 'old')`);

    const profile = await UserModel.findByFirebaseUid('old');

    expect(profile.rating).toMatchObject({ value: 1500, games: 0 });
    expect(profile.stats.rating).toBe(1500); // the stale 1200 in the JSON is not shown
  });

  it('rates a game: winner up, loser down, both recorded', async () => {
    await addPlayer('alice');
    await addPlayer('bob');

    const outcome = await UserModel.applyRatedGame({
      whiteUid: 'alice',
      blackUid: 'bob',
      result: 'white',
      gameId: 'online-AAA111-1',
    });

    expect(outcome.white).toMatchObject({ before: 1500, provisional: true });
    expect(outcome.white.after).toBeGreaterThan(1600);
    expect(outcome.white.change).toBe(outcome.white.after - 1500);
    expect(outcome.black.after).toBeLessThan(1400);

    const alice = await UserModel.findByFirebaseUid('alice');
    expect(alice.rating).toMatchObject({ value: outcome.white.after, games: 1 });
    expect(alice.rating.deviation).toBeLessThan(350);
    expect(alice.stats.rating).toBe(outcome.white.after);

    expect(await UserModel.getRatingHistory('alice')).toEqual([
      expect.objectContaining({
        gameId: 'online-AAA111-1',
        outcome: 'win',
        opponentRating: 1500,
        ratingBefore: 1500,
        ratingAfter: outcome.white.after,
      }),
    ]);
    expect((await UserModel.getRatingHistory('bob'))[0]).toMatchObject({ outcome: 'loss' });
  });

  it('will not rate the same game twice', async () => {
    await addPlayer('alice');
    await addPlayer('bob');
    const game = { whiteUid: 'alice', blackUid: 'bob', result: 'white' as const, gameId: 'online-AAA111-1' };

    const first = await UserModel.applyRatedGame(game);
    const second = await UserModel.applyRatedGame(game);

    expect(second).toBeNull();
    expect((await UserModel.findByFirebaseUid('alice')).rating).toMatchObject({ value: first.white.after, games: 1 });
  });

  it.each([
    ['a guest', async () => { await addPlayer('alice'); await addPlayer('bob', true); }],
    ['someone with no profile', async () => { await addPlayer('alice'); }],
  ])('leaves a game against %s unrated', async (_label, setup) => {
    await setup();

    const outcome = await UserModel.applyRatedGame({
      whiteUid: 'alice',
      blackUid: 'bob',
      result: 'white',
      gameId: 'online-AAA111-1',
    });

    expect(outcome).toBeNull();
    expect((await UserModel.findByFirebaseUid('alice')).rating).toMatchObject({ value: 1500, games: 0 });
    expect(await UserModel.getRatingHistory('alice')).toEqual([]);
    expect(await UserModel.getRatingSummary('bob')).toBeNull();
  });

  it('does not lose an update when one player finishes many games at once', async () => {
    await addPlayer('alice');
    const opponents = Array.from({ length: 12 }, (_, i) => `opp${i}`);
    for (const uid of opponents) await addPlayer(uid);

    // Twelve games involving alice end at the same moment.
    const outcomes = await Promise.all(
      opponents.map((uid, i) =>
        UserModel.applyRatedGame({
          whiteUid: i % 2 === 0 ? 'alice' : uid,
          blackUid: i % 2 === 0 ? uid : 'alice',
          result: i % 2 === 0 ? 'white' : 'black', // alice wins every one
          gameId: `online-GAME${i}-1`,
        }),
      ),
    );

    expect(outcomes.every(Boolean)).toBe(true);
    const alice = await UserModel.findByFirebaseUid('alice');
    expect(alice.rating.games).toBe(12);

    // Every game started from where the previous one left off: the history
    // forms one unbroken chain ending at the stored rating.
    const history = (await UserModel.getRatingHistory('alice')).reverse();
    expect(history).toHaveLength(12);
    const starts = history.map((entry: any) => entry.ratingBefore).sort((a: number, b: number) => a - b);
    const ends = history.map((entry: any) => entry.ratingAfter).sort((a: number, b: number) => a - b);
    expect(starts[0]).toBe(1500);
    expect(ends.slice(0, -1)).toEqual(starts.slice(1));
    expect(ends[ends.length - 1]).toBe(alice.rating.value);
  });

  it('ranks established players and leaves out guests and newcomers', async () => {
    await addPlayer('champ');
    await addPlayer('mid');
    await addPlayer('newbie');
    await addPlayer('visitor', true);
    await query(`UPDATE users SET rating = 2100, rating_deviation = 60, rated_games = 40 WHERE firebase_uid = 'champ'`);
    await query(`UPDATE users SET rating = 1650, rating_deviation = 200, rated_games = 6, display_name = 'Mid Player' WHERE firebase_uid = 'mid'`);
    await query(`UPDATE users SET rating = 2500, rated_games = 2 WHERE firebase_uid = 'newbie'`);
    await query(`UPDATE users SET rating = 2600, rated_games = 99 WHERE firebase_uid = 'visitor'`);

    const board = await UserModel.getLeaderboard();

    expect(board).toEqual([
      { rank: 1, name: 'champ', rating: 2100, provisional: false, games: 40 },
      { rank: 2, name: 'Mid Player', rating: 1650, provisional: true, games: 6 },
    ]);
    expect(JSON.stringify(board)).not.toContain('@');
  });
});
