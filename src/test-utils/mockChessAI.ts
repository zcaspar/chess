import type { Move } from 'chess.js';
import type { ChessAI } from '../utils/chessAI';

/**
 * Build a complete test double for ChessAI.
 *
 * Tests used to hand-roll this object inline, so adding a method to the real
 * class left every copy stale — and because GameContext calls the AI inside a
 * try/catch, a missing method shows up as "the AI silently never moved" rather
 * than as a clear failure. Override only what a given test cares about.
 */
export const createMockChessAI = (
  overrides: Partial<Record<keyof ChessAI, unknown>> = {},
): ChessAI =>
  ({
    initializeLc0: jest.fn().mockResolvedValue(undefined),
    getBestMove: jest.fn().mockResolvedValue(null as Move | null),
    setDifficulty: jest.fn(),
    getEngineType: jest.fn().mockReturnValue('lc0'),
    getLastMoveSource: jest.fn().mockReturnValue('lc0'),
    ...overrides,
  } as unknown as ChessAI);
