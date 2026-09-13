import { Chess } from 'chess.js';
import { ChessAI } from './chessAI';

// The real ChessAI asks the LC0 backend first and only falls back to the local
// evaluator when that returns null. These tests are about the *fallback*, so the
// backend is stubbed to always return null (same pattern as Performance.test.tsx).
jest.mock('./backendAI', () => {
  const actual = jest.requireActual('./backendAI');
  return {
    ...actual,
    BackendAI: jest.fn().mockImplementation(() => ({
      getBestMove: jest.fn().mockResolvedValue(null),
      getEngineStatus: jest.fn().mockResolvedValue({ engines: {} }),
    })),
  };
});

/**
 * getBestMove adds `(Math.random() - 0.5) * randomness` to every candidate
 * score. Pinning Math.random to 0.5 makes that term exactly 0, so these tests
 * measure the evaluator itself rather than the dice.
 */
let randomSpy: jest.SpyInstance;

beforeEach(() => {
  randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  randomSpy.mockRestore();
});

describe('SimpleChessAI fallback evaluator', () => {
  // All positions below have fewer than 20 legal moves, so none of them are
  // lost to the `moves.slice(0, 20)` candidate cap.

  it('plays mate in one when it is available', async () => {
    // Black to move. Ra1 is mate: the white king on h1 is boxed in by its own
    // g2/h2 pawns. Any engine with a correct sign convention plays it.
    const game = new Chess('r6k/8/8/8/8/8/6PP/7K b - - 0 1');
    const ai = new ChessAI('medium');

    const move = await ai.getBestMove(game);

    expect(move).not.toBeNull();
    expect(move!.san).toBe('Ra1#');
  });

  it('plays mate in one for white as well as for black', async () => {
    // The same position with the colours swapped and the ranks flipped.
    // A colour-blind or sign-flipped evaluator will treat the two differently.
    const game = new Chess('7k/6pp/8/8/8/8/8/R6K w - - 0 1');
    const ai = new ChessAI('medium');

    const move = await ai.getBestMove(game);

    expect(move).not.toBeNull();
    expect(move!.san).toBe('Ra8#');
  });

  it('captures a hanging queen instead of playing a quiet move', async () => {
    // White to move: the black queen on e5 is undefended and can be taken by
    // the d4 pawn. An evaluator that maximises total material on the board
    // avoids captures entirely, because every capture lowers that total.
    const game = new Chess('4k3/8/8/4q3/3P4/8/8/6K1 w - - 0 1');
    const ai = new ChessAI('medium');

    const move = await ai.getBestMove(game);

    expect(move).not.toBeNull();
    expect(move!.san).toBe('dxe5');
  });

  it('does not walk into a capture that loses material', async () => {
    // White to move. Rxd7+ wins a pawn but the rook is immediately recaptured
    // by the king on c7, trading a rook (500) for a pawn (100).
    const game = new Chess('8/2kp4/8/8/8/8/8/3R2K1 w - - 0 1');
    const ai = new ChessAI('medium');

    const move = await ai.getBestMove(game);

    expect(move).not.toBeNull();
    // The rook must not step onto a square the black king attacks.
    const after = new Chess(game.fen());
    after.move({ from: move!.from, to: move!.to, promotion: move!.promotion });
    const blackKingSquare = 'c7';
    const kingMoves = after
      .moves({ verbose: true })
      .filter((m) => m.from === blackKingSquare);
    expect(kingMoves.some((m) => m.captured === 'r')).toBe(false);
  });

  it('promotes a pawn when promotion is the only progress available', async () => {
    // White to move, pawn on a7, nothing to capture. Queening is worth +800.
    const game = new Chess('8/P7/8/8/3k4/8/8/7K w - - 0 1');
    const ai = new ChessAI('medium');

    const move = await ai.getBestMove(game);

    expect(move).not.toBeNull();
    expect(move!.promotion).toBe('q');
    expect(move!.to).toBe('a8');
  });

  it('returns null when there are no legal moves', async () => {
    // Black is stalemated.
    const game = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    const ai = new ChessAI('medium');

    expect(await ai.getBestMove(game)).toBeNull();
  });

  it('picks mirrored moves in mirrored positions', async () => {
    // The same middlegame shape seen from each side. A correct evaluator makes
    // the mirror-image choice; a colour-blind one can diverge.
    const mirror = (square: string) =>
      `${square[0]}${9 - Number(square[1])}`;

    const whiteToMove = new Chess('4k3/8/8/4q3/3P4/8/8/6K1 w - - 0 1');
    const blackToMove = new Chess('6k1/8/8/3p4/4Q3/8/8/4K3 b - - 0 1');

    const ai = new ChessAI('medium');
    const whiteMove = await ai.getBestMove(whiteToMove);
    const blackMove = await ai.getBestMove(blackToMove);

    expect(whiteMove).not.toBeNull();
    expect(blackMove).not.toBeNull();
    expect(mirror(whiteMove!.from)).toBe(blackMove!.from);
    expect(mirror(whiteMove!.to)).toBe(blackMove!.to);
  });

  it('plays a legal move from the starting position at every difficulty', async () => {
    const difficulties = ['beginner', 'easy', 'medium', 'hard', 'expert'] as const;

    for (const difficulty of difficulties) {
      const game = new Chess();
      const ai = new ChessAI(difficulty);
      const move = await ai.getBestMove(game);

      expect(move).not.toBeNull();
      const legal = game
        .moves({ verbose: true })
        .some((m) => m.from === move!.from && m.to === move!.to);
      expect(legal).toBe(true);
    }
  });
});
