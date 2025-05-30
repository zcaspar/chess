import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { Chess, Move, Square } from 'chess.js';

interface TimeControl {
  initial: number; // Initial time in seconds
  increment: number; // Increment per move in seconds
}

interface PlayerInfo {
  player1: string;
  player2: string;
}

interface ColorAssignment {
  white: 'player1' | 'player2';
  black: 'player1' | 'player2';
}

interface GameStats {
  player1: { wins: number; draws: number; losses: number };
  player2: { wins: number; draws: number; losses: number };
}

interface GameState {
  game: Chess;
  history: Move[];
  currentMoveIndex: number;
  gameResult: string;
  drawOffer: {
    offered: boolean;
    by: 'w' | 'b' | null;
  };
  timeControl: TimeControl | null;
  whiteTime: number; // Time in seconds
  blackTime: number; // Time in seconds
  activeColor: 'w' | 'b' | null;
  startTime: number | null;
  players: PlayerInfo;
  colorAssignment: ColorAssignment;
  gameStats: GameStats;
}

interface GameContextType {
  gameState: GameState;
  makeMove: (from: Square, to: Square, promotion?: string) => boolean;
  undoMove: () => void;
  redoMove: () => void;
  resetGame: () => void;
  resign: (color: 'w' | 'b') => void;
  offerDraw: (color: 'w' | 'b') => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  setTimeControl: (minutes: number, increment?: number) => void;
  startClock: () => void;
  pauseClock: () => void;
  setPlayerName: (player: 'player1' | 'player2', name: string) => void;
  swapColors: () => void;
  getPlayerByColor: (color: 'w' | 'b') => string;
  canUndo: boolean;
  canRedo: boolean;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};

interface GameProviderProps {
  children: ReactNode;
}

export const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  // Helper function to get player key by color
  const getPlayerKeyByColor = (color: 'w' | 'b', colorAssignment: ColorAssignment): 'player1' | 'player2' => {
    return color === 'w' ? colorAssignment.white : colorAssignment.black;
  };

  // Helper function to update game stats based on result
  const updateGameStats = (result: string, currentStats: GameStats, colorAssignment: ColorAssignment): GameStats => {
    const newStats = { ...currentStats };
    
    if (result.includes('wins')) {
      if (result.includes('White wins')) {
        const winner = colorAssignment.white;
        const loser = colorAssignment.black;
        newStats[winner].wins += 1;
        newStats[loser].losses += 1;
      } else if (result.includes('Black wins')) {
        const winner = colorAssignment.black;
        const loser = colorAssignment.white;
        newStats[winner].wins += 1;
        newStats[loser].losses += 1;
      }
    } else if (result.includes('Draw')) {
      newStats.player1.draws += 1;
      newStats.player2.draws += 1;
    }
    
    return newStats;
  };

  const [gameState, setGameState] = useState<GameState>({
    game: new Chess(),
    history: [],
    currentMoveIndex: -1,
    gameResult: '',
    drawOffer: {
      offered: false,
      by: null,
    },
    timeControl: null,
    whiteTime: 0,
    blackTime: 0,
    activeColor: null,
    startTime: null,
    players: {
      player1: 'Player 1',
      player2: 'Player 2',
    },
    colorAssignment: {
      white: 'player1',
      black: 'player2',
    },
    gameStats: {
      player1: { wins: 0, draws: 0, losses: 0 },
      player2: { wins: 0, draws: 0, losses: 0 },
    },
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clock ticker
  useEffect(() => {
    if (gameState.timeControl && gameState.activeColor && gameState.startTime && !gameState.gameResult) {
      intervalRef.current = setInterval(() => {
        setGameState(prev => {
          const elapsed = (Date.now() - prev.startTime!) / 1000;
          const timeKey = prev.activeColor === 'w' ? 'whiteTime' : 'blackTime';
          const newTime = Math.max(0, prev[timeKey] - elapsed);
          
          // Check for time expiration
          if (newTime === 0) {
            const loser = prev.activeColor === 'w' ? 'White' : 'Black';
            const winner = prev.activeColor === 'w' ? 'Black' : 'White';
            const result = `${winner} wins on time! ${loser} ran out of time.`;
            const updatedStats = updateGameStats(result, prev.gameStats, prev.colorAssignment);
            return {
              ...prev,
              [timeKey]: 0,
              gameResult: result,
              activeColor: null,
              startTime: null,
              gameStats: updatedStats,
            };
          }
          
          return {
            ...prev,
            [timeKey]: newTime,
            startTime: Date.now(),
          };
        });
      }, 100); // Update every 100ms for smooth display
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [gameState.activeColor, gameState.startTime, gameState.gameResult]);

  const setTimeControl = useCallback((minutes: number, increment: number = 0) => {
    const seconds = minutes * 60;
    setGameState(prev => ({
      ...prev,
      timeControl: { initial: seconds, increment },
      whiteTime: seconds,
      blackTime: seconds,
      activeColor: null,
      startTime: null,
    }));
  }, []);

  const startClock = useCallback(() => {
    if (gameState.timeControl && !gameState.activeColor) {
      setGameState(prev => ({
        ...prev,
        activeColor: 'w',
        startTime: Date.now(),
      }));
    }
  }, [gameState.timeControl, gameState.activeColor]);

  const pauseClock = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      activeColor: null,
      startTime: null,
    }));
  }, []);

  const makeMove = useCallback((from: Square, to: Square, promotion: string = 'q'): boolean => {
    try {
      const gameCopy = new Chess(gameState.game.fen());
      const move = gameCopy.move({ from, to, promotion });
      
      if (!move) return false;

      // Start clock on first move if time control is set
      const shouldStartClock = gameState.timeControl && !gameState.activeColor && gameState.currentMoveIndex === -1;

      // If we're not at the end of history, remove future moves
      const newHistory = gameState.history.slice(0, gameState.currentMoveIndex + 1);
      newHistory.push(move);

      let result = '';
      if (gameCopy.isGameOver()) {
        if (gameCopy.isCheckmate()) {
          result = `Checkmate! ${gameCopy.turn() === 'w' ? 'Black' : 'White'} wins!`;
        } else if (gameCopy.isDraw()) {
          if (gameCopy.isStalemate()) {
            result = 'Draw by stalemate!';
          } else if (gameCopy.isThreefoldRepetition()) {
            result = 'Draw by threefold repetition!';
          } else if (gameCopy.isInsufficientMaterial()) {
            result = 'Draw by insufficient material!';
          } else {
            result = 'Draw by fifty-move rule!';
          }
        }
      }

      setGameState(prev => {
        // Handle time increment
        let newWhiteTime = prev.whiteTime;
        let newBlackTime = prev.blackTime;
        
        if (prev.timeControl && prev.activeColor) {
          const increment = prev.timeControl.increment;
          if (prev.activeColor === 'w') {
            newWhiteTime = prev.whiteTime + increment;
          } else {
            newBlackTime = prev.blackTime + increment;
          }
        }

        // Update game stats if game ended
        const updatedStats = result ? updateGameStats(result, prev.gameStats, prev.colorAssignment) : prev.gameStats;

        return {
          ...prev,
          game: gameCopy,
          history: newHistory,
          currentMoveIndex: newHistory.length - 1,
          gameResult: result,
          drawOffer: { offered: false, by: null }, // Clear draw offer on move
          whiteTime: newWhiteTime,
          blackTime: newBlackTime,
          activeColor: result ? null : (prev.timeControl ? (shouldStartClock ? 'w' : (prev.activeColor === 'w' ? 'b' : 'w')) : null),
          startTime: result ? null : (prev.timeControl && (shouldStartClock || prev.activeColor) ? Date.now() : null),
          gameStats: updatedStats,
        };
      });

      return true;
    } catch {
      return false;
    }
  }, [gameState]);

  const undoMove = useCallback(() => {
    if (gameState.currentMoveIndex < 0) return;

    const newIndex = gameState.currentMoveIndex - 1;
    const newGame = new Chess();
    
    // Replay moves up to newIndex
    for (let i = 0; i <= newIndex; i++) {
      const move = gameState.history[i];
      newGame.move({ from: move.from, to: move.to, promotion: move.promotion });
    }

    setGameState({
      ...gameState,
      game: newGame,
      currentMoveIndex: newIndex,
      gameResult: '', // Clear game result when undoing
      activeColor: null, // Pause clock when undoing
      startTime: null,
    });
  }, [gameState]);

  const redoMove = useCallback(() => {
    if (gameState.currentMoveIndex >= gameState.history.length - 1) return;

    const newIndex = gameState.currentMoveIndex + 1;
    const move = gameState.history[newIndex];
    const gameCopy = new Chess(gameState.game.fen());
    gameCopy.move({ from: move.from, to: move.to, promotion: move.promotion });

    setGameState({
      ...gameState,
      game: gameCopy,
      currentMoveIndex: newIndex,
    });
  }, [gameState]);

  const resetGame = useCallback(() => {
    const timeControl = gameState.timeControl;
    const players = gameState.players;
    const colorAssignment = gameState.colorAssignment;
    const gameStats = gameState.gameStats; // Keep existing stats - they've already been updated
    
    setGameState({
      game: new Chess(),
      history: [],
      currentMoveIndex: -1,
      gameResult: '',
      drawOffer: { offered: false, by: null },
      timeControl: timeControl,
      whiteTime: timeControl ? timeControl.initial : 0,
      blackTime: timeControl ? timeControl.initial : 0,
      activeColor: null,
      startTime: null,
      players: players,
      colorAssignment: colorAssignment,
      gameStats: gameStats,
    });
  }, [gameState]);

  const resign = useCallback((color: 'w' | 'b') => {
    const winner = color === 'w' ? 'Black' : 'White';
    const result = `${winner} wins by resignation!`;
    const updatedStats = updateGameStats(result, gameState.gameStats, gameState.colorAssignment);
    
    setGameState({
      ...gameState,
      gameResult: result,
      activeColor: null,
      startTime: null,
      gameStats: updatedStats,
    });
  }, [gameState]);

  const offerDraw = useCallback((color: 'w' | 'b') => {
    setGameState({
      ...gameState,
      drawOffer: { offered: true, by: color },
    });
  }, [gameState]);

  const acceptDraw = useCallback(() => {
    const result = 'Draw by agreement!';
    const updatedStats = updateGameStats(result, gameState.gameStats, gameState.colorAssignment);
    
    setGameState({
      ...gameState,
      gameResult: result,
      drawOffer: { offered: false, by: null },
      activeColor: null,
      startTime: null,
      gameStats: updatedStats,
    });
  }, [gameState]);

  const declineDraw = useCallback(() => {
    setGameState({
      ...gameState,
      drawOffer: { offered: false, by: null },
    });
  }, [gameState]);

  const setPlayerName = useCallback((player: 'player1' | 'player2', name: string) => {
    setGameState(prev => ({
      ...prev,
      players: {
        ...prev.players,
        [player]: name || (player === 'player1' ? 'Player 1' : 'Player 2'),
      },
    }));
  }, []);

  const swapColors = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      colorAssignment: {
        white: prev.colorAssignment.black,
        black: prev.colorAssignment.white,
      },
    }));
  }, []);

  const getPlayerByColor = useCallback((color: 'w' | 'b'): string => {
    const playerKey = getPlayerKeyByColor(color, gameState.colorAssignment);
    return gameState.players[playerKey];
  }, [gameState.colorAssignment, gameState.players]);

  const canUndo = gameState.currentMoveIndex >= 0;
  const canRedo = gameState.currentMoveIndex < gameState.history.length - 1;

  const value: GameContextType = {
    gameState,
    makeMove,
    undoMove,
    redoMove,
    resetGame,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    setTimeControl,
    startClock,
    pauseClock,
    setPlayerName,
    swapColors,
    getPlayerByColor,
    canUndo,
    canRedo,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};