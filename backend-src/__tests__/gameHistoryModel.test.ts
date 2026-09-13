const mockQuery = jest.fn();

jest.mock('../config/database', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
  query: (...a: unknown[]) => mockQuery(...a),
  testConnection: jest.fn().mockResolvedValue(true),
  getPoolStatus: jest.fn(),
  closePool: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GameHistoryModel } = require('../models/GameHistory');

const baseGame = {
  playerId: 'player-1',
  gameId: 'game-abc',
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

const rowFor = (game: typeof baseGame, id = 1) => ({
  id,
  player_id: game.playerId,
  game_id: game.gameId,
  opponent_id: null,
  opponent_name: game.opponentName,
  player_color: game.playerColor,
  game_result: game.gameResult,
  game_outcome: game.gameOutcome,
  final_fen: game.finalFen,
  pgn: game.pgn,
  move_count: game.moveCount,
  game_duration: null,
  time_control: game.timeControl,
  game_mode: game.gameMode,
  ai_difficulty: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

/**
 * Stand in for a Postgres that actually enforces uniqueness on
 * (player_id, game_id) — the index the duplicate-row bug needs.
 */
const postgresWithUniqueGameId = () => {
  const seen = new Map<string, any>();
  let nextId = 1;

  return jest.fn(async (sql: string, values: any[]) => {
    if (!/INSERT INTO game_history/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }

    const key = `${values[0]}::${values[1]}`;
    const existing = seen.get(key);

    if (existing) {
      if (/ON CONFLICT/i.test(sql)) {
        // DO NOTHING returns no rows; DO UPDATE returns the surviving row.
        return /DO UPDATE/i.test(sql) ? { rows: [existing], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      const duplicate: any = new Error(
        'duplicate key value violates unique constraint "game_history_player_game_unique"',
      );
      duplicate.code = '23505';
      throw duplicate;
    }

    const row = {
      ...rowFor(baseGame, nextId++),
      player_id: values[0],
      game_id: values[1],
    };
    seen.set(key, row);
    return { rows: [row], rowCount: 1 };
  });
};

describe('GameHistoryModel.saveGame', () => {
  it('saves a game and maps the row back to the domain shape', async () => {
    mockQuery.mockResolvedValue({ rows: [rowFor(baseGame)], rowCount: 1 });

    const saved = await GameHistoryModel.saveGame(baseGame);

    expect(saved).toMatchObject({
      playerId: 'player-1',
      gameId: 'game-abc',
      gameOutcome: 'win',
      moveCount: 4,
    });
    expect(saved.timeControl).toEqual({ initial: 300, increment: 5 });
  });

  it('is idempotent for the same (playerId, gameId)', async () => {
    // The client retries, StrictMode double-fires, or the socket and the HTTP
    // path both save: the same finished game must end up as one row, not two.
    const fakePg = postgresWithUniqueGameId();
    mockQuery.mockImplementation(fakePg as any);

    const first = await GameHistoryModel.saveGame(baseGame);
    const second = await GameHistoryModel.saveGame(baseGame);

    expect(first.gameId).toBe('game-abc');
    expect(second).toBeDefined();

    const inserts = fakePg.mock.calls.filter(([sql]) =>
      /INSERT INTO game_history/i.test(String(sql)),
    );
    expect(inserts).toHaveLength(2);
    // Every insert must tell Postgres what to do about a duplicate.
    inserts.forEach(([sql]) => {
      expect(String(sql)).toMatch(/ON CONFLICT/i);
    });
  });

  it('stores a different game for the same player as its own row', async () => {
    const fakePg = postgresWithUniqueGameId();
    mockQuery.mockImplementation(fakePg as any);

    const first = await GameHistoryModel.saveGame(baseGame);
    const second = await GameHistoryModel.saveGame({
      ...baseGame,
      gameId: 'game-def',
    });

    expect(first.id).not.toBe(second.id);
  });

  it('surfaces a genuine database failure rather than swallowing it', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated unexpectedly'));

    await expect(GameHistoryModel.saveGame(baseGame)).rejects.toThrow();
  });
});

describe('game_history schema', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');

  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'schema.sql'),
    'utf8',
  );

  it('declares a unique constraint on (player_id, game_id)', () => {
    // Without this the "save it once" rule lives only in client-side guards,
    // and any retry writes a duplicate row.
    expect(schema).toMatch(
      /UNIQUE\s*(INDEX[^;]*ON\s+game_history\s*)?\([^)]*player_id[^)]*game_id[^)]*\)/i,
    );
  });

  it('still indexes player_id for the history listing query', () => {
    expect(schema).toMatch(/idx_game_history_player_id/);
  });
});
