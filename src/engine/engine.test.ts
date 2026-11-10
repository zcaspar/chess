import { Chess } from 'chess.js';
import { parseBestMove, parseInfoLine, splitUciMove } from './uci';
import {
  Evaluation,
  classifyMove,
  formatEvaluation,
  moveAccuracy,
  toEvaluation,
  winPercent,
  winPercentFor,
} from './evaluation';
import { PositionJudge, pvToSan, reviewGame, terminalVerdict } from './gameAnalysis';
import { EngineAbortError, EngineTransport, StockfishEngine } from './stockfishEngine';

// Real output captured from Stockfish 19 Lite.
const INFO_CP =
  'info depth 12 seldepth 15 multipv 1 score cp 36 nodes 43640 nps 872800 hashfull 16 time 50 pv d8e7 d2d3 c6d4 h5d1';
const INFO_SECOND =
  'info depth 12 seldepth 19 multipv 2 score cp 32 nodes 43640 nps 872800 hashfull 16 time 50 pv g7g6 h5f3 g8f6';

describe('UCI parsing', () => {
  it('reads depth, rank, score and variation from an info line', () => {
    expect(parseInfoLine(INFO_CP)).toEqual({
      depth: 12,
      multipv: 1,
      score: { type: 'cp', value: 36 },
      pv: ['d8e7', 'd2d3', 'c6d4', 'h5d1'],
    });
    expect(parseInfoLine(INFO_SECOND)?.multipv).toBe(2);
  });

  it('reads mate scores, including being mated', () => {
    expect(parseInfoLine('info depth 5 score mate 3 pv h5f7 e8e7 f7e6')?.score).toEqual({ type: 'mate', value: 3 });
    expect(parseInfoLine('info depth 5 score mate -2 pv e8e7 f7e6')?.score).toEqual({ type: 'mate', value: -2 });
  });

  it('flags a score that is only a bound', () => {
    expect(parseInfoLine('info depth 9 score cp 50 lowerbound pv e2e4')?.bound).toBe('lower');
    expect(parseInfoLine('info depth 9 score cp 50 upperbound pv e2e4')?.bound).toBe('upper');
  });

  it('ignores lines that carry no analysis', () => {
    expect(parseInfoLine('info string NNUE evaluation using nn-61e7af4bb97d.nnue')).toBeNull();
    expect(parseInfoLine('info depth 10 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfoLine('readyok')).toBeNull();
    expect(parseInfoLine('info depth 0 score mate 0')).toBeNull(); // no variation
  });

  it('reads the best move, and "none" for a finished position', () => {
    expect(parseBestMove('bestmove d8e7 ponder d2d3')).toEqual({ bestMove: 'd8e7' });
    expect(parseBestMove('bestmove (none)')).toEqual({ bestMove: null });
    expect(parseBestMove('info depth 1')).toBeNull();
  });

  it('splits UCI moves, with and without a promotion', () => {
    expect(splitUciMove('e2e4')).toEqual({ from: 'e2', to: 'e4' });
    expect(splitUciMove('b7a8n')).toEqual({ from: 'b7', to: 'a8', promotion: 'n' });
    expect(splitUciMove('(none)')).toBeNull();
  });
});

describe('evaluations', () => {
  it('turns a side-to-move score into a White-relative one', () => {
    expect(toEvaluation({ type: 'cp', value: 120 }, 'w')).toEqual({ type: 'cp', cp: 120 });
    expect(toEvaluation({ type: 'cp', value: 120 }, 'b')).toEqual({ type: 'cp', cp: -120 });
    expect(toEvaluation({ type: 'mate', value: 3 }, 'b')).toEqual({ type: 'mate', in: 3, winner: 'b' });
    expect(toEvaluation({ type: 'mate', value: -3 }, 'b')).toEqual({ type: 'mate', in: 3, winner: 'w' });
    // "mate 0": the side to move is already mated.
    expect(toEvaluation({ type: 'mate', value: 0 }, 'w')).toEqual({ type: 'mate', in: 0, winner: 'b' });
  });

  it('maps evaluations to winning chances', () => {
    expect(winPercent({ type: 'cp', cp: 0 })).toBe(50);
    expect(winPercent({ type: 'cp', cp: 100 })).toBeCloseTo(59.1, 1);
    expect(winPercent({ type: 'cp', cp: -100 })).toBeCloseTo(40.9, 1);
    expect(winPercent({ type: 'cp', cp: 5000 })).toBe(winPercent({ type: 'cp', cp: 1000 }));
    expect(winPercent({ type: 'mate', in: 4, winner: 'w' })).toBe(100);
    expect(winPercent({ type: 'mate', in: 4, winner: 'b' })).toBe(0);
    expect(winPercentFor({ type: 'cp', cp: 100 }, 'b')).toBeCloseTo(40.9, 1);
  });

  it('formats evaluations the way players read them', () => {
    expect(formatEvaluation({ type: 'cp', cp: 134 })).toBe('+1.3');
    expect(formatEvaluation({ type: 'cp', cp: -40 })).toBe('-0.4');
    expect(formatEvaluation({ type: 'cp', cp: 3 })).toBe('0.0');
    expect(formatEvaluation({ type: 'mate', in: 5, winner: 'w' })).toBe('M5');
    expect(formatEvaluation({ type: 'mate', in: 3, winner: 'b' })).toBe('-M3');
    expect(formatEvaluation({ type: 'mate', in: 0, winner: 'b' })).toBe('-#');
  });

  it('labels moves by the winning chances they cost', () => {
    expect(classifyMove(0, true)).toBe('best');
    expect(classifyMove(2, false)).toBe('good');
    expect(classifyMove(5, false)).toBe('inaccuracy');
    expect(classifyMove(10, false)).toBe('mistake');
    expect(classifyMove(15, false)).toBe('blunder');
    expect(classifyMove(60, false)).toBe('blunder');
  });

  it('scores a costless move 100 and falls as the cost grows', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
    expect(moveAccuracy(10)).toBeLessThan(moveAccuracy(5));
    expect(moveAccuracy(100)).toBeGreaterThanOrEqual(0);
    expect(moveAccuracy(100)).toBeLessThan(5);
  });
});

describe('game review', () => {
  const movesOf = (...sans: string[]) => {
    const game = new Chess();
    sans.forEach((san) => game.move(san));
    return game.history({ verbose: true });
  };

  /** A judge that looks each position up by how many plies have been played. */
  const scripted = (verdicts: Array<{ cp?: number; mate?: Evaluation; best: string | null }>): PositionJudge => {
    let index = 0;
    return async () => {
      const verdict = verdicts[index];
      index += 1;
      return {
        evaluation: verdict.mate ?? { type: 'cp', cp: verdict.cp ?? 0 },
        bestMove: verdict.best,
      };
    };
  };

  it('judges each move by the difference between the positions either side of it', async () => {
    const moves = movesOf('e4', 'e5', 'Qh5', 'Ke7');
    const review = await reviewGame(
      moves,
      scripted([
        { cp: 30, best: 'e2e4' }, // start: e4 is the engine move
        { cp: 30, best: 'e7e5' }, // after 1.e4
        { cp: 30, best: 'g1f3' }, // after 1...e5: engine wants Nf3, game played Qh5
        { cp: 0, best: 'b8c6' }, // after 2.Qh5: engine wants Nc6, game played Ke7
        { mate: { type: 'mate', in: 1, winner: 'w' }, best: 'h5e5' }, // after 2...Ke7
      ]),
    );

    expect(review.plies.map((ply) => ply.quality)).toEqual(['best', 'best', 'good', 'blunder']);
    expect(review.plies[2]).toMatchObject({ color: 'w', playedBest: false, bestMoveSan: 'Nf3' });
    expect(review.plies[2].winDrop).toBeCloseTo(2.8, 1); // 0.3 pawns of advantage given back
    expect(review.plies[3]).toMatchObject({ color: 'b', bestMoveSan: 'Nc6', bestMoveUci: 'b8c6' });
    expect(review.plies[3].winDrop).toBe(50); // from equal to getting mated
    expect(review.evaluations).toHaveLength(5);

    expect(review.white).toMatchObject({ moves: 2, best: 1, blunders: 0 });
    expect(review.black).toMatchObject({ moves: 2, best: 1, blunders: 1 });
    expect(review.white.accuracy!).toBeGreaterThan(90);
    expect(review.black.accuracy!).toBeLessThan(60);
  });

  it('never calls the engine\'s own move a mistake, even if the next search disagrees', async () => {
    const review = await reviewGame(
      movesOf('e4'),
      scripted([
        { cp: 80, best: 'e2e4' },
        { cp: -40, best: 'e7e5' }, // the deeper look is gloomier, but e4 was the engine's pick
      ]),
    );

    expect(review.plies[0]).toMatchObject({ quality: 'best', winDrop: 0, accuracy: expect.any(Number) });
    expect(review.plies[0].accuracy).toBeCloseTo(100, 0);
  });

  it('reports progress for every position and gives an empty side no accuracy', async () => {
    const progress: Array<[number, number]> = [];
    const review = await reviewGame(
      movesOf('e4'),
      scripted([{ cp: 20, best: 'e2e4' }, { cp: 20, best: 'e7e5' }]),
      { onProgress: (done, total) => progress.push([done, total]) },
    );

    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(review.black).toMatchObject({ moves: 0, accuracy: null });
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    const judge: PositionJudge = async () => {
      controller.abort();
      return { evaluation: { type: 'cp', cp: 0 }, bestMove: null };
    };

    await expect(reviewGame(movesOf('e4', 'e5'), judge, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('rejects a move list that cannot be played, before using the engine', async () => {
    const judge = jest.fn();

    await expect(
      reviewGame([{ from: 'e2', to: 'e5', san: 'e5' }], judge as unknown as PositionJudge),
    ).rejects.toThrow();
    expect(judge).not.toHaveBeenCalled();
  });

  it('knows finished positions without asking the engine', () => {
    const mated = new Chess();
    ['f3', 'e5', 'g4', 'Qh4#'].forEach((san) => mated.move(san));

    expect(terminalVerdict(mated.fen())).toEqual({
      evaluation: { type: 'mate', in: 0, winner: 'b' },
      bestMove: null,
    });
    expect(terminalVerdict('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')?.evaluation).toEqual({ type: 'cp', cp: 0 }); // stalemate
    expect(terminalVerdict(new Chess().fen())).toBeNull();
  });

  it('writes a variation in standard notation', () => {
    expect(pvToSan(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3', 'b8c6'])).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(pvToSan(new Chess().fen(), ['e2e4', 'e2e4'])).toEqual(['e4']); // stops at an illegal move
  });
});

describe('StockfishEngine', () => {
  /** A scripted engine: answers the UCI handshake and plays back search output. */
  const makeTransport = (searchOutput: (fen: string) => string[]) => {
    let listener: (line: string) => void = () => undefined;
    let errorListener: (error: unknown) => void = () => undefined;
    const sent: string[] = [];
    let position = '';
    let pendingBestMove: string | null = null;
    const emit = (line: string) => listener(line);
    const transport: EngineTransport = {
      send: (command) => {
        sent.push(command);
        if (command === 'uci') emit('uciok');
        else if (command === 'isready') emit('readyok');
        else if (command.startsWith('position fen ')) position = command.slice('position fen '.length);
        else if (command.startsWith('go')) {
          const lines = searchOutput(position);
          pendingBestMove = lines[lines.length - 1];
          lines.slice(0, -1).forEach(emit);
          // The final line (bestmove) is released by `finish` or `stop`.
        } else if (command === 'stop' && pendingBestMove) {
          const line = pendingBestMove;
          pendingBestMove = null;
          emit(line);
        }
      },
      onMessage: (callback) => {
        listener = callback;
      },
      onError: (callback) => {
        errorListener = callback;
      },
      terminate: jest.fn(),
    };
    return {
      transport,
      sent,
      /** Let the current search end normally. */
      finish: () => {
        if (pendingBestMove) {
          const line = pendingBestMove;
          pendingBestMove = null;
          emit(line);
        }
      },
      crash: (message: string) => errorListener(message),
    };
  };

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const BLACK_TO_MOVE = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';

  it('returns ranked lines, scored from White\'s point of view', async () => {
    const fake = makeTransport(() => [INFO_CP, INFO_SECOND, 'bestmove d8e7 ponder d2d3']);
    const engine = new StockfishEngine(fake.transport);

    const pending = engine.analyse(BLACK_TO_MOVE, { depth: 12, multiPv: 2 });
    await flush();
    fake.finish();
    const result = await pending;

    expect(result.bestMove).toBe('d8e7');
    expect(result.depth).toBe(12);
    // Black is to move and the engine says +0.36 for Black: that is -0.36 for White.
    expect(result.lines.map((line) => line.evaluation)).toEqual([
      { type: 'cp', cp: -36 },
      { type: 'cp', cp: -32 },
    ]);
    expect(fake.sent).toEqual(
      expect.arrayContaining(['uci', 'setoption name MultiPV value 2', `position fen ${BLACK_TO_MOVE}`, 'go depth 12']),
    );
  });

  it('reports progress while it searches', async () => {
    const fake = makeTransport(() => [
      'info depth 1 multipv 1 score cp 10 pv e2e4',
      'info depth 2 multipv 1 score cp 25 pv d2d4',
      'bestmove d2d4',
    ]);
    const engine = new StockfishEngine(fake.transport);
    const depths: number[] = [];

    const pending = engine.analyse(new Chess().fen(), { onUpdate: (partial) => depths.push(partial.depth) });
    await flush();
    fake.finish();
    await pending;

    expect(depths).toEqual([1, 2]);
  });

  it('runs one search at a time, in the order asked', async () => {
    const fake = makeTransport((fen) => [`info depth 1 multipv 1 score cp 1 pv e2e4`, `bestmove ${fen.includes(' b ') ? 'e7e5' : 'e2e4'}`]);
    const engine = new StockfishEngine(fake.transport);

    const first = engine.analyse(new Chess().fen());
    const second = engine.analyse(BLACK_TO_MOVE);
    await flush();
    expect(fake.sent.filter((command) => command.startsWith('go'))).toHaveLength(1);

    fake.finish();
    expect((await first).bestMove).toBe('e2e4');
    await flush();
    fake.finish();
    expect((await second).bestMove).toBe('e7e5');
  });

  it('stops a cancelled search and stays usable afterwards', async () => {
    const fake = makeTransport(() => ['info depth 1 multipv 1 score cp 1 pv e2e4', 'bestmove e2e4']);
    const engine = new StockfishEngine(fake.transport);
    const controller = new AbortController();

    const cancelled = engine.analyse(new Chess().fen(), { signal: controller.signal });
    await flush();
    controller.abort();

    await expect(cancelled).rejects.toBeInstanceOf(EngineAbortError);
    expect(fake.sent).toContain('stop');

    const next = engine.analyse(new Chess().fen());
    await flush();
    fake.finish();
    expect((await next).bestMove).toBe('e2e4');
  });

  it('does not start a search that was cancelled while it waited its turn', async () => {
    const fake = makeTransport(() => ['info depth 1 multipv 1 score cp 1 pv e2e4', 'bestmove e2e4']);
    const engine = new StockfishEngine(fake.transport);
    const controller = new AbortController();

    const first = engine.analyse(new Chess().fen());
    const queued = engine.analyse(BLACK_TO_MOVE, { signal: controller.signal });
    controller.abort();
    await flush();
    fake.finish();
    await first;

    await expect(queued).rejects.toBeInstanceOf(EngineAbortError);
    expect(fake.sent.filter((command) => command.startsWith('go'))).toHaveLength(1);
  });

  it('plays at a requested strength', async () => {
    const fake = makeTransport(() => ['info depth 3 multipv 1 score cp 1 pv g1f3', 'bestmove g1f3']);
    const engine = new StockfishEngine(fake.transport);

    const pending = engine.play(new Chess().fen(), { skillLevel: 3, depth: 3 });
    await flush();
    fake.finish();

    expect(await pending).toBe('g1f3');
    expect(fake.sent).toEqual(expect.arrayContaining(['setoption name Skill Level value 3', 'go depth 3']));
  });

  it('fails the request, and reports itself broken, when the engine crashes', async () => {
    const fake = makeTransport(() => ['info depth 1 multipv 1 score cp 1 pv e2e4', 'bestmove e2e4']);
    const engine = new StockfishEngine(fake.transport);

    const pending = engine.analyse(new Chess().fen());
    await flush();
    fake.crash('out of memory');

    await expect(pending).rejects.toThrow(/out of memory/);
    expect(engine.isBroken).toBe(true);
    await expect(engine.analyse(new Chess().fen())).rejects.toThrow();
  });
});
