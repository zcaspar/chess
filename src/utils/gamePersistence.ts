import { Chess, Move, Square } from 'chess.js';
import type { GameState } from '../contexts/GameContext';
import { logger } from './logger';

/**
 * Keeps the game in progress across a page reload.
 *
 * Nothing about a local or vs-computer game used to be stored anywhere, so a
 * refresh — or a phone discarding a background tab — threw the game and its
 * clocks away. Online games are not stored here: the server holds those and
 * hands the position back when the client rejoins its room.
 */

const STORAGE_KEY = 'chess_game_in_progress_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface SavedMove {
  from: string;
  to: string;
  promotion?: string;
}

interface SavedGame {
  version: 1;
  savedAt: number;
  moves: SavedMove[];
  /** Position at `currentMoveIndex`; used to check the replay on restore. */
  fen: string;
  currentMoveIndex: number;
  gameId: string;
  gameMode: GameState['gameMode'];
  aiColor: GameState['aiColor'];
  aiDifficulty: GameState['aiDifficulty'];
  timeControl: GameState['timeControl'];
  whiteTime: number;
  blackTime: number;
  activeColor: GameState['activeColor'];
  clockRunning: boolean;
  players: GameState['players'];
  colorAssignment: GameState['colorAssignment'];
  gameStats: GameState['gameStats'];
  hintAvailable: GameState['hintAvailable'];
  nukeAvailable: GameState['nukeAvailable'];
  teleportAvailable: GameState['teleportAvailable'];
}

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // storage can be blocked outright (private mode, policy)
  }
};

export const clearSavedGame = (): void => {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing useful to do */
  }
};

/** A game worth bringing back: started, unfinished, and played on this device. */
const isWorthSaving = (state: GameState): boolean =>
  state.history.length > 0 &&
  !state.gameResult &&
  !state.onlineGameRoom &&
  state.gameMode !== 'ai-vs-ai';

/** Store the game in progress, or forget the stored one if there is none. */
export const persistGame = (state: GameState): void => {
  if (!isWorthSaving(state)) {
    clearSavedGame();
    return;
  }

  const saved: SavedGame = {
    version: 1,
    savedAt: Date.now(),
    moves: state.history.map((move) => ({ from: move.from, to: move.to, promotion: move.promotion })),
    fen: state.game.fen(),
    currentMoveIndex: state.currentMoveIndex,
    gameId: state.gameId,
    gameMode: state.gameMode,
    aiColor: state.aiColor,
    aiDifficulty: state.aiDifficulty,
    timeControl: state.timeControl,
    whiteTime: state.whiteTime,
    blackTime: state.blackTime,
    activeColor: state.activeColor,
    clockRunning: state.startTime !== null,
    players: state.players,
    colorAssignment: state.colorAssignment,
    gameStats: state.gameStats,
    hintAvailable: state.hintAvailable,
    nukeAvailable: state.nukeAvailable,
    teleportAvailable: state.teleportAvailable,
  };

  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch (error) {
    logger.warn('Could not save the game in progress:', error);
  }
};

/**
 * The stored game as a partial GameState, or null when there is none or it
 * cannot be trusted. The moves are replayed from the starting position rather
 * than believed, so a corrupt or hand-edited entry is dropped instead of
 * putting an impossible position on the board.
 */
export const loadSavedGame = (): Partial<GameState> | null => {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const saved = JSON.parse(raw) as SavedGame;
    if (
      !saved ||
      saved.version !== 1 ||
      !Array.isArray(saved.moves) ||
      saved.moves.length === 0 ||
      typeof saved.savedAt !== 'number' ||
      Date.now() - saved.savedAt > MAX_AGE_MS ||
      (saved.gameMode !== 'human-vs-human' && saved.gameMode !== 'human-vs-ai')
    ) {
      clearSavedGame();
      return null;
    }

    const index = Math.min(Math.max(saved.currentMoveIndex, -1), saved.moves.length - 1);
    const full = new Chess();
    let positionFen = full.fen();
    saved.moves.forEach((move, i) => {
      full.move({ from: move.from as Square, to: move.to as Square, promotion: move.promotion });
      if (i === index) positionFen = full.fen();
    });
    const history: Move[] = full.history({ verbose: true });

    // Variant moves (nuke / teleport) are not chess moves and do not replay;
    // such a game fails here and is simply not restored.
    if (positionFen !== saved.fen) {
      clearSavedGame();
      return null;
    }

    const hasClock = !!saved.timeControl;
    const activeColor = hasClock && (saved.activeColor === 'w' || saved.activeColor === 'b') ? saved.activeColor : null;

    return {
      game: new Chess(positionFen),
      history,
      currentMoveIndex: index,
      gameResult: '',
      gameId: saved.gameId,
      statsUpdated: false,
      gameMode: saved.gameMode,
      aiColor: saved.aiColor,
      aiDifficulty: saved.aiDifficulty,
      timeControl: saved.timeControl,
      whiteTime: hasClock ? saved.whiteTime : 0,
      blackTime: hasClock ? saved.blackTime : 0,
      // Time spent while the page was closed is not charged; the clock picks
      // up from where it stood at the last move.
      activeColor,
      startTime: activeColor && saved.clockRunning ? Date.now() : null,
      players: saved.players,
      colorAssignment: saved.colorAssignment,
      gameStats: saved.gameStats,
      hintAvailable: saved.hintAvailable,
      nukeAvailable: saved.nukeAvailable,
      teleportAvailable: saved.teleportAvailable,
    };
  } catch (error) {
    logger.warn('Discarding a saved game that could not be restored:', error);
    clearSavedGame();
    return null;
  }
};
