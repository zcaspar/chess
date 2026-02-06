import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { Chess, Square } from 'chess.js';
import { Puzzle, loadPuzzles, getRandomPuzzle, parseUCIMove } from '../utils/puzzleLoader';
import { soundManager } from '../utils/soundManager';

type PuzzlePhase = 'loading' | 'opponent-move' | 'player-turn' | 'correct' | 'incorrect' | 'complete' | 'failed';

interface PuzzleStats {
  solved: number;
  failed: number;
  streak: number;
  bestStreak: number;
  rating: number;
}

interface PuzzleState {
  phase: PuzzlePhase;
  puzzle: Puzzle | null;
  game: Chess;
  solutionMoves: string[]; // All UCI moves in the solution
  currentSolutionIndex: number; // Which move we're at in the solution
  hintsUsed: number;
  hintSquare: string | null; // Highlighted target square for hint
  lastMoveCorrect: boolean | null;
  stats: PuzzleStats;
}

interface PuzzleContextType {
  state: PuzzleState;
  loadNextPuzzle: () => Promise<void>;
  makeMove: (from: Square, to: Square, promotion?: string) => boolean;
  requestHint: () => void;
  showSolution: () => void;
  resetPuzzle: () => void;
  isLoaded: boolean;
}

const defaultStats: PuzzleStats = {
  solved: 0,
  failed: 0,
  streak: 0,
  bestStreak: 0,
  rating: 1200,
};

function loadStats(): PuzzleStats {
  try {
    const saved = localStorage.getItem('chess_puzzle_stats');
    if (saved) return { ...defaultStats, ...JSON.parse(saved) };
  } catch {}
  return { ...defaultStats };
}

function saveStats(stats: PuzzleStats) {
  try {
    localStorage.setItem('chess_puzzle_stats', JSON.stringify(stats));
  } catch {}
}

const PuzzleContext = createContext<PuzzleContextType | undefined>(undefined);

export const usePuzzle = () => {
  const ctx = useContext(PuzzleContext);
  if (!ctx) throw new Error('usePuzzle must be used within PuzzleProvider');
  return ctx;
};

export const PuzzleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [allPuzzles, setAllPuzzles] = useState<Puzzle[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [state, setState] = useState<PuzzleState>({
    phase: 'loading',
    puzzle: null,
    game: new Chess(),
    solutionMoves: [],
    currentSolutionIndex: 0,
    hintsUsed: 0,
    hintSquare: null,
    lastMoveCorrect: null,
    stats: loadStats(),
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load puzzles on mount
  useEffect(() => {
    loadPuzzles().then((puzzles) => {
      setAllPuzzles(puzzles);
      setIsLoaded(puzzles.length > 0);
    });
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const playOpponentMove = useCallback((game: Chess, moves: string[], index: number) => {
    // The opponent's move is at the given index
    if (index >= moves.length) {
      // All moves done - puzzle complete
      setState((prev) => {
        const newStats = {
          ...prev.stats,
          solved: prev.stats.solved + 1,
          streak: prev.stats.streak + 1,
          bestStreak: Math.max(prev.stats.bestStreak, prev.stats.streak + 1),
          rating: prev.stats.rating + 8,
        };
        saveStats(newStats);
        return { ...prev, phase: 'complete', stats: newStats };
      });
      soundManager.play('promote');
      return;
    }

    const uci = moves[index];
    const { from, to, promotion } = parseUCIMove(uci);

    timeoutRef.current = setTimeout(() => {
      try {
        game.move({ from, to, promotion } as any);
        soundManager.play('move');
        setState((prev) => ({
          ...prev,
          game: game,
          currentSolutionIndex: index + 1,
          phase: 'player-turn',
          hintSquare: null,
        }));
      } catch {
        // Invalid move in solution data
        setState((prev) => ({ ...prev, phase: 'complete' }));
      }
    }, 600);
  }, []);

  const loadNextPuzzle = useCallback(async () => {
    if (allPuzzles.length === 0) return;

    const puzzle = getRandomPuzzle(allPuzzles, state.stats.rating);
    if (!puzzle) return;

    const game = new Chess(puzzle.fen);
    const moves = puzzle.moves.split(/\s+/).filter(Boolean);

    setState((prev) => ({
      ...prev,
      phase: 'opponent-move',
      puzzle,
      game,
      solutionMoves: moves,
      currentSolutionIndex: 0,
      hintsUsed: 0,
      hintSquare: null,
      lastMoveCorrect: null,
    }));

    // Play the first move (opponent's move) automatically
    playOpponentMove(game, moves, 0);
  }, [allPuzzles, state.stats.rating, playOpponentMove]);

  const makeMove = useCallback((from: Square, to: Square, promotion?: string): boolean => {
    if (state.phase !== 'player-turn') return false;

    const expectedIndex = state.currentSolutionIndex;
    if (expectedIndex >= state.solutionMoves.length) return false;

    const expectedUCI = state.solutionMoves[expectedIndex];
    const expected = parseUCIMove(expectedUCI);

    // Check if the player's move matches the expected solution
    const isCorrect = from === expected.from && to === expected.to &&
      (!expected.promotion || promotion === expected.promotion);

    if (isCorrect) {
      try {
        state.game.move({ from, to, promotion } as any);
        soundManager.play(state.game.isCheck() ? 'check' : 'move');

        const nextIndex = expectedIndex + 1;

        // Check if puzzle is complete
        if (nextIndex >= state.solutionMoves.length) {
          const newStats = {
            ...state.stats,
            solved: state.stats.solved + 1,
            streak: state.stats.streak + 1,
            bestStreak: Math.max(state.stats.bestStreak, state.stats.streak + 1),
            rating: state.stats.rating + 8,
          };
          saveStats(newStats);
          setState((prev) => ({
            ...prev,
            currentSolutionIndex: nextIndex,
            phase: 'complete',
            lastMoveCorrect: true,
            stats: newStats,
          }));
          soundManager.play('promote');
        } else {
          // Play opponent's response
          setState((prev) => ({
            ...prev,
            currentSolutionIndex: nextIndex,
            phase: 'opponent-move',
            lastMoveCorrect: true,
            hintSquare: null,
          }));
          playOpponentMove(state.game, state.solutionMoves, nextIndex);
        }
        return true;
      } catch {
        return false;
      }
    } else {
      // Wrong move
      soundManager.play('game-end');
      setState((prev) => ({
        ...prev,
        phase: 'incorrect',
        lastMoveCorrect: false,
      }));

      // Allow retry after a brief pause
      timeoutRef.current = setTimeout(() => {
        setState((prev) => ({
          ...prev,
          phase: 'player-turn',
          lastMoveCorrect: null,
        }));
      }, 1000);
      return false;
    }
  }, [state.phase, state.currentSolutionIndex, state.solutionMoves, state.game, state.stats, playOpponentMove]);

  const requestHint = useCallback(() => {
    if (state.phase !== 'player-turn') return;
    const idx = state.currentSolutionIndex;
    if (idx >= state.solutionMoves.length) return;

    const { to } = parseUCIMove(state.solutionMoves[idx]);
    setState((prev) => ({
      ...prev,
      hintsUsed: prev.hintsUsed + 1,
      hintSquare: to,
    }));
  }, [state.phase, state.currentSolutionIndex, state.solutionMoves]);

  const showSolution = useCallback(() => {
    if (state.phase !== 'player-turn' && state.phase !== 'incorrect') return;

    // Mark as failed
    const newStats = {
      ...state.stats,
      failed: state.stats.failed + 1,
      streak: 0,
      rating: Math.max(400, state.stats.rating - 8),
    };
    saveStats(newStats);

    // Play through remaining moves
    const game = state.game;
    const remaining = state.solutionMoves.slice(state.currentSolutionIndex);

    for (const uci of remaining) {
      const { from, to, promotion } = parseUCIMove(uci);
      try {
        game.move({ from, to, promotion } as any);
      } catch {
        break;
      }
    }

    setState((prev) => ({
      ...prev,
      phase: 'failed',
      stats: newStats,
      currentSolutionIndex: prev.solutionMoves.length,
    }));
  }, [state.phase, state.game, state.solutionMoves, state.currentSolutionIndex, state.stats]);

  const resetPuzzle = useCallback(() => {
    if (!state.puzzle) return;
    const game = new Chess(state.puzzle.fen);
    const moves = state.solutionMoves;

    setState((prev) => ({
      ...prev,
      phase: 'opponent-move',
      game,
      currentSolutionIndex: 0,
      hintsUsed: 0,
      hintSquare: null,
      lastMoveCorrect: null,
    }));

    playOpponentMove(game, moves, 0);
  }, [state.puzzle, state.solutionMoves, playOpponentMove]);

  return (
    <PuzzleContext.Provider
      value={{
        state,
        loadNextPuzzle,
        makeMove,
        requestHint,
        showSolution,
        resetPuzzle,
        isLoaded,
      }}
    >
      {children}
    </PuzzleContext.Provider>
  );
};
