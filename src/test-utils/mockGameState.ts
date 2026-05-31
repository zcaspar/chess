import { Chess } from 'chess.js';
import type { GameState, GameContextType } from '../contexts/GameContext';

/**
 * Build a complete, type-safe GameState for use in tests.
 *
 * Tests historically hand-rolled partial gameState objects, which drifted out
 * of sync with the real shape (e.g. missing hintAvailable / nukeAvailable /
 * teleportAvailable) and caused runtime crashes like
 * "Cannot read properties of undefined (reading 'white')".
 *
 * Use this factory and override only the fields a given test cares about.
 */
export const createMockGameState = (overrides: Partial<GameState> = {}): GameState => ({
  game: new Chess(),
  history: [],
  currentMoveIndex: -1,
  gameResult: '',
  gameId: 'test-game-id',
  statsUpdated: false,
  drawOffer: { offered: false, by: null },
  timeControl: null,
  whiteTime: 0,
  blackTime: 0,
  activeColor: null,
  startTime: null,
  players: { player1: 'Player 1', player2: 'Player 2' },
  colorAssignment: { white: 'player1', black: 'player2' },
  gameStats: {
    player1: { wins: 0, draws: 0, losses: 0 },
    player2: { wins: 0, draws: 0, losses: 0 },
  },
  gameMode: 'human-vs-human',
  aiColor: null,
  aiDifficulty: 'medium',
  hintAvailable: { white: true, black: true },
  currentHint: null,
  nukeAvailable: { white: true, black: true },
  nukeModeActive: { white: false, black: false },
  teleportAvailable: { white: true, black: true },
  teleportModeActive: { white: false, black: false },
  ...overrides,
});

/**
 * Build a complete, type-safe GameContext value (state + all methods stubbed
 * with jest.fn()). Override individual methods or pass `gameState` overrides.
 */
export const createMockGameContext = (
  overrides: Partial<GameContextType> = {},
): GameContextType => {
  const { gameState: gameStateOverride, ...rest } = overrides;
  return {
    gameState: gameStateOverride ?? createMockGameState(),
    makeMove: jest.fn(() => true),
    undoMove: jest.fn(),
    redoMove: jest.fn(),
    resetGame: jest.fn(),
    clearAllGameData: jest.fn(),
    resign: jest.fn(),
    offerDraw: jest.fn(),
    acceptDraw: jest.fn(),
    declineDraw: jest.fn(),
    setTimeControl: jest.fn(),
    startClock: jest.fn(),
    pauseClock: jest.fn(),
    setPlayerName: jest.fn(),
    swapColors: jest.fn(),
    getPlayerByColor: jest.fn((color: 'w' | 'b') => (color === 'w' ? 'White' : 'Black')),
    setGameMode: jest.fn(async () => undefined),
    setAIDifficulty: jest.fn(async () => undefined),
    setAIvAIDifficulties: jest.fn(),
    pauseAIGame: jest.fn(),
    resumeAIGame: jest.fn(),
    canUndo: false,
    canRedo: false,
    requestHint: jest.fn(async () => false),
    clearHint: jest.fn(),
    canUseHint: true,
    activateNukeMode: jest.fn(),
    cancelNukeMode: jest.fn(),
    executeNuke: jest.fn(() => true),
    canUseNuke: jest.fn(() => true),
    activateTeleportMode: jest.fn(),
    cancelTeleportMode: jest.fn(),
    executeTeleport: jest.fn(() => true),
    canUseTeleport: jest.fn(() => true),
    ...rest,
  };
};
