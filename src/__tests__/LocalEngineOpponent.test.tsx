import React from 'react';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { Chess, Square } from 'chess.js';
import { getEngine } from '../engine/stockfishEngine';
import { getLocalEngineHint, getLocalEngineMove } from '../engine/localOpponent';
import { SimpleChessAI } from '../utils/chessAI';
import { GameProvider, useGame } from '../contexts/GameContext';

/**
 * The engine in the browser as the computer opponent's backup and as the
 * source of hints. The engine itself is replaced by a stub here; its protocol
 * handling is covered in src/engine/engine.test.ts.
 */

jest.mock('../engine/stockfishEngine', () => ({
  ...jest.requireActual('../engine/stockfishEngine'),
  getEngine: jest.fn(),
}));

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, profile: null, updateStats: jest.fn() }),
}));

const mockGetEngine = getEngine as jest.Mock;
const START = new Chess().fen();

const stubEngine = (overrides: Partial<{ play: jest.Mock; analyse: jest.Mock }> = {}) => ({
  play: jest.fn().mockResolvedValue('g1f3'),
  analyse: jest.fn().mockResolvedValue({ fen: START, depth: 14, lines: [], bestMove: 'e2e4' }),
  ...overrides,
});

describe('local engine as an opponent', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    // The LC0 server is unreachable in every test here.
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('plays weaker at lower levels and stronger at higher ones', async () => {
    const engine = stubEngine();
    mockGetEngine.mockReturnValue(engine);

    await getLocalEngineMove(START, 'beginner');
    await getLocalEngineMove(START, 'medium');
    await getLocalEngineMove(START, 'expert');

    const [beginner, medium, expert] = engine.play.mock.calls.map(([, options]) => options);
    expect(beginner.skillLevel).toBeLessThan(medium.skillLevel);
    expect(medium.skillLevel).toBeLessThan(expert.skillLevel);
    expect(expert.skillLevel).toBe(20);
    expect(beginner.depth).toBeLessThan(medium.depth);
  });

  it('returns the engine move as a full, legal move', async () => {
    mockGetEngine.mockReturnValue(stubEngine());

    const move = await getLocalEngineMove(START, 'medium');

    expect(move).toMatchObject({ from: 'g1', to: 'f3', san: 'Nf3' });
  });

  it.each([
    ['an illegal move', 'e2e5'],
    ['no move', null],
  ])('returns nothing when the engine answers with %s', async (_label, answer) => {
    mockGetEngine.mockReturnValue(stubEngine({ play: jest.fn().mockResolvedValue(answer) }));

    expect(await getLocalEngineMove(START, 'medium')).toBeNull();
  });

  it('returns nothing when the engine cannot run or fails', async () => {
    mockGetEngine.mockReturnValue(null);
    expect(await getLocalEngineMove(START, 'medium')).toBeNull();
    expect(await getLocalEngineHint(START)).toBeNull();

    mockGetEngine.mockReturnValue(stubEngine({ play: jest.fn().mockRejectedValue(new Error('crashed')) }));
    expect(await getLocalEngineMove(START, 'medium')).toBeNull();
  });

  it('steps in for the computer when LC0 is unreachable', async () => {
    const engine = stubEngine();
    mockGetEngine.mockReturnValue(engine);
    const ai = new SimpleChessAI('hard');

    const move = await ai.getBestMove(new Chess());

    expect(move).toMatchObject({ san: 'Nf3' });
    expect(ai.getLastMoveSource()).toBe('stockfish');
    expect(engine.play).toHaveBeenCalledWith(START, expect.objectContaining({ skillLevel: 14 }));
  });

  it('still produces a legal move when there is no engine at all', async () => {
    mockGetEngine.mockReturnValue(null);
    const ai = new SimpleChessAI('easy');
    const game = new Chess();

    const move = await ai.getBestMove(game);

    expect(ai.getLastMoveSource()).toBe('fallback');
    expect(game.moves({ verbose: true }).map((m) => m.san)).toContain(move?.san);
  });
});

describe('hints', () => {
  const originalFetch = global.fetch;
  const wrapper = ({ children }: { children: React.ReactNode }) => <GameProvider>{children}</GameProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockRejectedValue(new Error('should not be called')) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('come from the engine in the browser, with no server request', async () => {
    const engine = stubEngine();
    mockGetEngine.mockReturnValue(engine);
    const { result } = renderHook(() => useGame(), { wrapper });

    let ok = false;
    await act(async () => {
      ok = await result.current.requestHint();
    });

    expect(ok).toBe(true);
    expect(result.current.gameState.currentHint).toMatchObject({ from: 'e2', to: 'e4' });
    expect(result.current.gameState.hintAvailable).toEqual({ white: false, black: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('are dropped if the position changed while the engine was thinking', async () => {
    let release: (value: unknown) => void = () => undefined;
    const engine = stubEngine({
      analyse: jest.fn(() => new Promise((resolve) => { release = resolve; })),
    });
    mockGetEngine.mockReturnValue(engine);
    const { result } = renderHook(() => useGame(), { wrapper });

    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.requestHint();
    });
    act(() => {
      result.current.makeMove('d2' as Square, 'd4' as Square);
    });
    let ok = true;
    await act(async () => {
      release({ fen: START, depth: 14, lines: [], bestMove: 'e2e4' });
      ok = await pending;
    });

    expect(ok).toBe(false);
    expect(result.current.gameState.currentHint).toBeNull();
  });

  it('fall back to the LC0 server in a browser with no engine', async () => {
    mockGetEngine.mockReturnValue(null);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, bestMove: { from: 'd2', to: 'd4' } }),
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useGame(), { wrapper });

    let ok = false;
    await act(async () => {
      ok = await result.current.requestHint();
    });

    expect(ok).toBe(true);
    expect(result.current.gameState.currentHint).toMatchObject({ from: 'd2', to: 'd4' });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toMatch(/\/api\/analysis\/hint$/);
  });
});
