import { BackendAI } from './backendAI';

/**
 * Regression coverage for the LC0 move-parsing bug: the LC0 server returns the
 * move primarily as a UCI string (move.uci), so requiring move.from/move.to
 * caused every move to be rejected -> silent fallback to the weak local AI
 * ("random moves"). getBestMove must derive from/to/promotion from uci.
 */
describe('BackendAI.getBestMove', () => {
  const ai = new BackendAI();

  const mockFetch = (body: unknown, ok = true, status = 200) => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      statusText: 'status',
      json: async () => body,
    });
  };

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('derives from/to/promotion from move.uci when from/to are absent', async () => {
    mockFetch({ move: { uci: 'e7e8q' }, responseTime: 10, engine: 'lc0' });
    const move = await ai.getBestMove('fen', 'expert');
    expect(move).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
  });

  it('parses a normal (non-promotion) uci move', async () => {
    mockFetch({ move: { uci: 'e2e4' } });
    const move = await ai.getBestMove('fen');
    expect(move).toMatchObject({ from: 'e2', to: 'e4' });
    expect((move as { promotion?: string })?.promotion).toBeUndefined();
  });

  it('uses explicit from/to when the server provides them', async () => {
    mockFetch({ move: { uci: 'g1f3', from: 'g1', to: 'f3' } });
    const move = await ai.getBestMove('fen');
    expect(move).toMatchObject({ from: 'g1', to: 'f3' });
  });

  it('returns null on a non-OK response (so caller falls back)', async () => {
    mockFetch({}, false, 502);
    expect(await ai.getBestMove('fen')).toBeNull();
  });

  it('returns null when the move payload has no usable data', async () => {
    mockFetch({ move: {} });
    expect(await ai.getBestMove('fen')).toBeNull();
  });

  it('returns null when the request rejects', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('network down'));
    expect(await ai.getBestMove('fen')).toBeNull();
  });
});
