/**
 * Migration behaviour against a REAL Postgres.
 *
 * Skipped unless TEST_DATABASE_URL is set, because the rest of the suite must
 * never touch a live server. Run it against a throwaway database:
 *
 *   docker run -d --rm --name chess-pg-test \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_DB=chess -p 55432:5432 postgres:16-alpine
 *   TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/chess npx jest migration
 *
 * The mocked unit tests cannot cover any of this: they assert that the code
 * asks for the right thing, not that Postgres accepts it. Every statement in
 * db/*.sql is only ever proved correct by actually being executed.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  // config/database builds its pool at import time, so this must be set before
  // the require below rather than in a hook.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const describeOrSkip = TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('game_history migration (live Postgres)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pool, query } = require('../config/database');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GameHistoryModel } = require('../models/GameHistory');

  /** The pre-index table shape, as a legacy production database would have it. */
  const createLegacyTable = () =>
    query(`
      CREATE TABLE IF NOT EXISTS game_history (
        id SERIAL PRIMARY KEY,
        player_id VARCHAR(255) NOT NULL,
        game_id VARCHAR(255) NOT NULL,
        opponent_id VARCHAR(255),
        opponent_name VARCHAR(255) NOT NULL DEFAULT 'x',
        player_color VARCHAR(1) NOT NULL DEFAULT 'w',
        game_result VARCHAR(50) NOT NULL DEFAULT 'r',
        game_outcome VARCHAR(10),
        final_fen TEXT NOT NULL DEFAULT 'f',
        pgn TEXT NOT NULL DEFAULT 'p',
        move_count INTEGER NOT NULL DEFAULT 0,
        game_duration INTEGER,
        time_control JSONB,
        game_mode VARCHAR(20) NOT NULL DEFAULT 'human-vs-ai',
        ai_difficulty VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

  const uniqueIndexExists = async (): Promise<boolean> => {
    const r = await query(
      `SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'game_history_player_game_unique'`,
    );
    return r.rows.length > 0;
  };

  const countRows = async (): Promise<number> => {
    const r = await query('SELECT COUNT(*)::int AS n FROM game_history');
    return r.rows[0].n;
  };

  beforeAll(() => {
    process.env.LOG_LEVEL = 'silent';
  }, 30000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
  });

  beforeEach(async () => {
    await query('DROP TABLE IF EXISTS game_history CASCADE');
  });

  it('collapses duplicates so the unique index can be created', async () => {
    await createLegacyTable();
    // The three ways duplicates were produced in practice: an HTTP save plus a
    // socket save, a client retry, and a StrictMode double-fire.
    await query(`INSERT INTO game_history (player_id, game_id, pgn) VALUES
      ('p1','g1','FIRST'), ('p1','g1','SECOND'), ('p1','g1','THIRD'),
      ('p2','g9','FIRST'), ('p2','g9','SECOND'),
      ('p1','g2','ONLY')`);

    expect(await uniqueIndexExists()).toBe(false);

    await GameHistoryModel.initializeTables();

    expect(await countRows()).toBe(3);
    expect(await uniqueIndexExists()).toBe(true);
  });

  it('keeps the oldest row of each duplicated pair', async () => {
    await createLegacyTable();
    await query(`INSERT INTO game_history (player_id, game_id, pgn) VALUES
      ('p1','g1','FIRST'), ('p1','g1','SECOND')`);

    await GameHistoryModel.initializeTables();

    const kept = await query('SELECT pgn FROM game_history');
    expect(kept.rows).toHaveLength(1);
    expect(kept.rows[0].pgn).toBe('FIRST');
  });

  it('is idempotent across repeated boots', async () => {
    await createLegacyTable();
    await query(`INSERT INTO game_history (player_id, game_id) VALUES ('p1','g1'), ('p1','g1')`);

    await GameHistoryModel.initializeTables();
    const first = await countRows();

    // The second run is what used to fail on the non-idempotent CREATE TRIGGER
    // in head-to-head-schema.sql once db/*.sql actually began shipping.
    await GameHistoryModel.initializeTables();
    await GameHistoryModel.initializeTables();

    expect(await countRows()).toBe(first);
    expect(await uniqueIndexExists()).toBe(true);
  });

  it('saves the same game twice as exactly one row', async () => {
    const game = {
      playerId: 'p1',
      gameId: 'g-new',
      opponentName: 'Computer (medium)',
      playerColor: 'w' as const,
      gameResult: 'Checkmate! Player 1 wins!',
      gameOutcome: 'win' as const,
      finalFen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      pgn: '1. f3 e5 2. g4 Qh4#',
      moveCount: 4,
      gameMode: 'human-vs-ai' as const,
      timeControl: { initial: 300, increment: 5 },
    };

    await GameHistoryModel.initializeTables();

    const first = await GameHistoryModel.saveGame(game);
    const second = await GameHistoryModel.saveGame(game);

    const rows = await query(`SELECT COUNT(*)::int AS n FROM game_history WHERE game_id = 'g-new'`);
    expect(rows.rows[0].n).toBe(1);
    // DO UPDATE ... RETURNING must hand back the surviving row, not nothing —
    // a DO NOTHING variant would return undefined here and break the caller.
    expect(first.gameId).toBe('g-new');
    expect(second).toBeDefined();
    expect(second.gameOutcome).toBe('win');
  });

  it('builds the full schema, not the reduced inline fallback', async () => {
    await GameHistoryModel.initializeTables();

    const columns = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'game_history'`,
    );
    const names = columns.rows.map((r: { column_name: string }) => r.column_name);

    // Declared only in db/schema.sql, never in the inline fallback.
    expect(names).toContain('opponent_id');
    expect(await uniqueIndexExists()).toBe(true);

    // And the other indexes the fallback omits.
    const indexes = await query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'game_history'`,
    );
    const indexNames = indexes.rows.map((r: { indexname: string }) => r.indexname);
    expect(indexNames).toContain('idx_game_history_opponent_id');
    expect(indexNames).toContain('idx_game_history_player_created');
  });
});