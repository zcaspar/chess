import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { Chess, Move, Square } from 'chess.js';
import { ChessAI, DifficultyLevel } from '../utils/chessAI';
import { useAuth } from '../hooks/useAuth';

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
  gameId: string; // Unique identifier for each game
  statsUpdated: boolean; // Track if stats have been updated for this game
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
  gameMode: 'human-vs-human' | 'human-vs-ai';
  aiColor: 'w' | 'b' | null; // Which color the AI is playing
  aiDifficulty: DifficultyLevel;
}

interface GameContextType {
  gameState: GameState;
  makeMove: (from: Square, to: Square, promotion?: string) => boolean;
  undoMove: () => void;
  redoMove: () => void;
  resetGame: () => void;
  clearAllGameData: () => void;
  resign: (color: 'w' | 'b') => void;
  offerDraw: (color: 'w' | 'b') => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  setTimeControl: (minutes: number | null, increment?: number) => void;
  startClock: () => void;
  pauseClock: () => void;
  setPlayerName: (player: 'player1' | 'player2', name: string) => void;
  swapColors: () => void;
  getPlayerByColor: (color: 'w' | 'b') => string;
  setGameMode: (mode: 'human-vs-human' | 'human-vs-ai', aiColor?: 'w' | 'b') => Promise<void>;
  setAIDifficulty: (difficulty: DifficultyLevel) => Promise<void>;
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
  // Initialize state first
  const [gameState, setGameState] = useState<GameState>({
    game: new Chess(),
    history: [],
    currentMoveIndex: -1,
    gameResult: '',
    gameId: Math.random().toString(36).substr(2, 9),
    statsUpdated: false,
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
    gameMode: 'human-vs-human',
    aiColor: null,
    aiDifficulty: 'medium',
  });

  // Get auth context for user stats updates
  const authContext = useAuth();

  // Helper function to get player key by color
  const getPlayerKeyByColor = (color: 'w' | 'b', colorAssignment: ColorAssignment): 'player1' | 'player2' => {
    return color === 'w' ? colorAssignment.white : colorAssignment.black;
  };

  // Track completed games to prevent double counting
  const completedGamesRef = useRef<Set<string>>(new Set());

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const aiRef = useRef<ChessAI>(new ChessAI('medium', 1000));
  const isAiThinking = useRef<boolean>(false);
  const gameEndedRef = useRef<boolean>(false); // Track game end state to prevent race conditions

  // Helper function to update game stats based on result
  const updateGameStats = useCallback((result: string, currentStats: GameStats, colorAssignment: ColorAssignment, players: PlayerInfo, winningColor?: 'w' | 'b', statsAlreadyUpdated: boolean = false, gameId?: string): GameStats => {
    // Don't update stats if already updated for this game (prevents double counting)
    if (statsAlreadyUpdated) {
      console.log('🚫 Stats update blocked - already updated for this game');
      return currentStats;
    }
    
    // Additional check using gameId and completedGames set
    if (gameId && completedGamesRef.current.has(gameId)) {
      console.log('🚫 Stats update blocked - game already completed:', gameId);
      return currentStats;
    }
    
    console.log('📊 Updating stats for result:', result, 'winningColor:', winningColor, 'gameId:', gameId);
    
    // Mark this game as completed
    if (gameId) {
      completedGamesRef.current.add(gameId);
    }
    
    const newStats = { ...currentStats };
    
    if (result.includes('wins')) {
      let winner: 'player1' | 'player2' | null = null;
      
      // If we know the winning color, use that directly
      if (winningColor) {
        winner = getPlayerKeyByColor(winningColor, colorAssignment);
      } else {
        // Fallback to string matching
        if (result.includes(players.player1)) {
          winner = 'player1';
        } else if (result.includes(players.player2)) {
          winner = 'player2';
        }
      }
      
      if (winner) {
        const loser = winner === 'player1' ? 'player2' : 'player1';
        newStats[winner].wins += 1;
        newStats[loser].losses += 1;
      }
    } else if (result.includes('Draw')) {
      newStats.player1.draws += 1;
      newStats.player2.draws += 1;
    }
    
    return newStats;
  }, []);

  // Function to save game to history
  const saveGameToHistory = useCallback(async (result: string, winningColor?: 'w' | 'b', finalFen?: string, pgn?: string) => {
    console.log('🎮 Attempting to save game to history:', { result, winningColor, hasUser: !!authContext?.user });
    
    if (!authContext?.user || !authContext?.profile) {
      console.log('❌ Cannot save game - no authenticated user');
      return; // No authenticated user
    }

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3005';
      
      // Determine game outcome for the current user
      let gameOutcome: 'win' | 'loss' | 'draw' = 'draw';
      
      if (result.includes('wins') && winningColor) {
        if (gameState.gameMode === 'human-vs-ai') {
          // For AI games, user wins if AI didn't win
          const userWon = (gameState.aiColor === 'w' && winningColor === 'b') || 
                          (gameState.aiColor === 'b' && winningColor === 'w');
          gameOutcome = userWon ? 'win' : 'loss';
        } else {
          // For human vs human, we'll mark it as a win for now
          // TODO: Could be enhanced to determine which player in the UI
          gameOutcome = 'win';
        }
      } else if (result.includes('Draw') || result.includes('draw')) {
        gameOutcome = 'draw';
      }
      
      // Determine player color (assume human is always white for now, AI is black)
      let playerColor: 'w' | 'b' = 'w';
      if (gameState.gameMode === 'human-vs-ai' && gameState.aiColor === 'w') {
        playerColor = 'b';
      }
      
      // Generate PGN if not provided
      let gamePgn = pgn;
      if (!gamePgn) {
        // Use the current game's PGN which should have the complete history
        gamePgn = gameState.game.pgn();
        
        // If that's still empty/short, try reconstructing from history
        if (!gamePgn || gamePgn.length < 20) {
          console.log('⚠️ Game PGN is short, reconstructing from history');
          const pgnGame = new Chess();
          gameState.history.forEach(move => {
            try {
              pgnGame.move(move);
            } catch (e) {
              console.log('⚠️ Error applying move to PGN reconstruction:', move, e);
            }
          });
          gamePgn = pgnGame.pgn();
        }
        
        console.log('📝 Generated PGN length:', gamePgn.length);
        console.log('📝 Generated PGN preview:', gamePgn.substring(0, 100));
        console.log('📝 History length used:', gameState.history.length);
        console.log('📝 Game history length:', gameState.game.history().length);
        console.log('📝 Final move count:', Math.max(gameState.history.length, gameState.game.history().length));
      }
      
      // Determine opponent info
      let opponentName = 'Unknown';
      let opponentId = undefined;
      
      if (gameState.gameMode === 'human-vs-ai') {
        opponentName = `Computer (${gameState.aiDifficulty})`;
      } else {
        // For human vs human, use the other player's name
        const opponentPlayerKey = playerColor === 'w' ? 'black' : 'white';
        const opponentKey = gameState.colorAssignment[opponentPlayerKey];
        opponentName = gameState.players[opponentKey];
      }
      
      const gameHistoryData = {
        gameId: gameState.gameId,
        opponentId,
        opponentName,
        playerColor,
        gameResult: result,
        gameOutcome,
        finalFen: finalFen || gameState.game.fen(),
        pgn: gamePgn,
        moveCount: Math.max(gameState.history.length, gameState.game.history().length),
        gameDuration: gameState.timeControl ? 
          Math.floor((gameState.timeControl.initial * 2 - gameState.whiteTime - gameState.blackTime) / 1000) : 
          undefined,
        timeControl: gameState.timeControl,
        gameMode: gameState.gameMode,
        aiDifficulty: gameState.gameMode === 'human-vs-ai' ? gameState.aiDifficulty : undefined
      };
      
      const token = await authContext.user.getIdToken();
      
      const response = await fetch(`${backendUrl}/api/game-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(gameHistoryData)
      });
      
      if (response.ok) {
        console.log('✅ Game saved to history successfully');
      } else {
        const errorText = await response.text();
        
        // Try to parse the error response for more details
        try {
          const errorData = JSON.parse(errorText);
          if (response.status === 503) {
            console.warn('⚠️ Game history feature temporarily unavailable:', errorData.message);
            // Don't log this as an error since it's expected when database is not configured
            return;
          }
          console.error('❌ Failed to save game to history:', errorData);
        } catch (parseError) {
          console.error('❌ Failed to save game to history:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText
          });
        }
      }
    } catch (error) {
      console.error('❌ Error saving game to history:', error);
    }
  }, [authContext, gameState]);

  // Function to update user statistics when game ends
  const updateUserStats = useCallback(async (result: string, winningColor?: 'w' | 'b') => {
    if (!authContext?.profile || !authContext?.updateStats) {
      return; // No authenticated user or auth not available
    }

    try {
      const { profile, updateStats } = authContext;
      const currentStats = profile.stats;
      
      let statUpdate: { wins?: number; losses?: number; draws?: number; gamesPlayed?: number; winStreak?: number; bestWinStreak?: number } = {
        gamesPlayed: currentStats.gamesPlayed + 1,
      };

      if (result.includes('Draw') || result.includes('draw')) {
        // Draw
        statUpdate.draws = currentStats.draws + 1;
        statUpdate.winStreak = 0; // Reset win streak on draw
      } else if (result.includes('wins')) {
        // For AI games, determine if user won or lost
        if (gameState.gameMode === 'human-vs-ai' && winningColor) {
          const userWon = (gameState.aiColor === 'w' && winningColor === 'b') || 
                          (gameState.aiColor === 'b' && winningColor === 'w');
          
          if (userWon) {
            statUpdate.wins = currentStats.wins + 1;
            statUpdate.winStreak = currentStats.winStreak + 1;
            statUpdate.bestWinStreak = Math.max(currentStats.bestWinStreak, currentStats.winStreak + 1);
          } else {
            statUpdate.losses = currentStats.losses + 1;
            statUpdate.winStreak = 0;
          }
        } else {
          // For human vs human, we can't determine user win/loss easily, so we'll track it as a game played
          // In the future, this could be enhanced with player identification
        }
      }

      await updateStats(statUpdate);
    } catch (error) {
      console.error('❌ Error updating user stats:', error);
    }
  }, [authContext, gameState.gameMode, gameState.aiColor]);

  // Clock ticker
  useEffect(() => {
    if (gameState.timeControl && gameState.activeColor && gameState.startTime && !gameState.gameResult) {
      intervalRef.current = setInterval(() => {
        setGameState(prev => {
          // Check if we should still be running the timer
          if (!prev.activeColor || prev.gameResult || !prev.startTime) {
            return prev;
          }
          
          // For AI turns, let the timer run normally
          // The AI computation time is separate from game time
          
          const elapsed = (Date.now() - prev.startTime) / 1000;
          const timeKey = prev.activeColor === 'w' ? 'whiteTime' : 'blackTime';
          const newTime = Math.max(0, prev[timeKey] - elapsed);
          
          // Check for time expiration
          if (newTime === 0) {
            const losingColor = prev.activeColor!;
            const winningColor = prev.activeColor === 'w' ? 'b' : 'w';
            const loserPlayerKey = getPlayerKeyByColor(losingColor, prev.colorAssignment);
            const winnerPlayerKey = getPlayerKeyByColor(winningColor, prev.colorAssignment);
            const loserName = prev.players[loserPlayerKey];
            const winnerName = prev.players[winnerPlayerKey];
            const result = `${winnerName} wins on time! ${loserName} ran out of time.`;
            console.log('⏰ TIME EXPIRED:', { losingColor, loserName, result });
            const updatedStats = updateGameStats(result, prev.gameStats, prev.colorAssignment, prev.players, winningColor, prev.statsUpdated, prev.gameId);
            
            // Clear the timer interval immediately when game ends
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            
            // Update user statistics for time expiration
            updateUserStats(result, winningColor);
            
            // Save game to history
            saveGameToHistory(result, winningColor);
            
            // Mark game as ended in ref to prevent race conditions
            gameEndedRef.current = true;
            
            return {
              ...prev,
              [timeKey]: 0,
              gameResult: result,
              activeColor: null,
              startTime: null,
              gameStats: updatedStats,
              statsUpdated: true,
            };
          }
          
          // Update the time and refresh startTime for next calculation
          return {
            ...prev,
            [timeKey]: newTime,
            startTime: Date.now(), // Reset startTime for next interval
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
  }, [gameState.activeColor, gameState.startTime, gameState.gameResult, gameState.timeControl, updateGameStats, updateUserStats, saveGameToHistory]);

  // AI move effect
  useEffect(() => {
    const currentTurn = gameState.game.turn();
    const shouldAIMove = 
      gameState.gameMode === 'human-vs-ai' &&
      gameState.aiColor !== null &&
      gameState.aiColor === currentTurn &&
      !gameState.gameResult &&
      !isAiThinking.current;

    console.log('🤖 AI effect triggered:', {
      gameMode: gameState.gameMode,
      aiColor: gameState.aiColor,
      currentTurn: currentTurn,
      gameResult: gameState.gameResult,
      isAiThinking: isAiThinking.current,
      shouldAIMove,
      gameId: gameState.gameId
    });

    if (shouldAIMove) {
      isAiThinking.current = true;
      console.log('🤖 AI starting to think for gameId:', gameState.gameId);
      
      const makeAIMove = async () => {
        try {
          // Double-check game hasn't ended before getting AI move (check both state and ref)
          if (gameState.gameResult || gameEndedRef.current) {
            console.log('🤖 AI cancelled - game already ended');
            isAiThinking.current = false;
            return;
          }
          
          const aiMove = await aiRef.current.getBestMove(gameState.game);
          console.log('🤖 AI found move:', aiMove, 'for gameId:', gameState.gameId);
          
          // Check again after AI thinking - game might have ended during thinking
          if (aiMove && !gameState.gameResult && !gameEndedRef.current) {
            // Validate the move is still legal on current board
            const testGame = new Chess(gameState.game.fen());
            const testMove = testGame.move({ from: aiMove.from as Square, to: aiMove.to as Square, promotion: aiMove.promotion });
            
            if (testMove) {
              console.log('🤖 Applying valid AI move:', aiMove.san || `${aiMove.from}-${aiMove.to}`);
              console.log('🤖 Board before AI move:', gameState.game.fen());
              // Use the makeMove function which properly updates the game state
              const moveResult = makeMove(aiMove.from as Square, aiMove.to as Square, aiMove.promotion);
              if (!moveResult) {
                console.log('🤖 AI move rejected - game has ended');
              } else {
                console.log('🤖 AI move applied successfully, board should update');
              }
            } else {
              console.log(`🤖 AI move ${aiMove.from}-${aiMove.to} is no longer valid on current board`);
            }
          } else {
            console.log('🤖 AI move cancelled - game ended or no move found');
          }
        } catch (error) {
          console.error('AI move error:', error);
        } finally {
          isAiThinking.current = false;
        }
      };

      makeAIMove();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps  
  }, [gameState.game.fen(), gameState.gameMode, gameState.aiColor, gameState.gameResult, gameState.gameId]);

  const setTimeControl = useCallback((minutes: number | null, increment: number = 0) => {
    if (minutes === null) {
      setGameState(prev => ({
        ...prev,
        timeControl: null,
        whiteTime: 0,
        blackTime: 0,
        activeColor: null,
        startTime: null,
      }));
    } else {
      const seconds = minutes * 60;
      setGameState(prev => ({
        ...prev,
        timeControl: { initial: seconds, increment },
        whiteTime: seconds,
        blackTime: seconds,
        activeColor: null,
        startTime: null,
      }));
    }
  }, []);

  const startClock = useCallback(() => {
    setGameState(prev => {
      if (prev.timeControl && !prev.activeColor) {
        return {
          ...prev,
          activeColor: 'w',
          startTime: Date.now(),
        };
      }
      return prev;
    });
  }, []);

  const pauseClock = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      activeColor: null,
      startTime: null,
    }));
  }, []);

  const makeMove = useCallback((from: Square, to: Square, promotion: string = 'q'): boolean => {
    console.log('🎯 makeMove called:', from, to, 'gameId:', gameState.gameId);
    
    // Prevent moves if game has already ended (check both state and ref)
    if (gameState.gameResult || gameEndedRef.current) {
      console.log('❌ Move blocked - game has ended:', gameState.gameResult || 'via ref');
      return false;
    }
    
    try {
      const gameCopy = new Chess(gameState.game.fen());
      const move = gameCopy.move({ from, to, promotion });
      
      if (!move) {
        console.log('❌ Move validation failed:', from, to);
        return false;
      }

      // If we're not at the end of history, remove future moves
      const newHistory = gameState.history.slice(0, gameState.currentMoveIndex + 1);
      newHistory.push(move);

      let result = '';
      let winningColor: 'w' | 'b' | undefined;
      if (gameCopy.isGameOver()) {
        if (gameCopy.isCheckmate()) {
          winningColor = gameCopy.turn() === 'w' ? 'b' : 'w';
          const winnerPlayerKey = getPlayerKeyByColor(winningColor, gameState.colorAssignment);
          const winnerName = gameState.players[winnerPlayerKey];
          result = `Checkmate! ${winnerName} wins!`;
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
        const updatedStats = result ? updateGameStats(result, prev.gameStats, prev.colorAssignment, prev.players, winningColor, prev.statsUpdated, prev.gameId) : prev.gameStats;
        
        if (result) {
          console.log('🏁 Game ended in makeMove:', result, 'gameId:', prev.gameId);
          // Mark game as ended in ref
          gameEndedRef.current = true;
          
          // Update user statistics for game completion
          updateUserStats(result, winningColor);
          
          // Save game to history
          saveGameToHistory(result, winningColor, gameCopy.fen(), gameCopy.pgn());
        }

        return {
          ...prev,
          game: gameCopy,
          history: newHistory,
          currentMoveIndex: newHistory.length - 1,
          gameResult: result,
          drawOffer: { offered: false, by: null }, // Clear draw offer on move
          whiteTime: newWhiteTime,
          blackTime: newBlackTime,
          activeColor: result ? null : (prev.timeControl && newHistory.length > 1 ? (gameCopy.turn() === 'w' ? 'w' : 'b') : null),
          startTime: result ? null : (prev.timeControl && newHistory.length > 1 ? Date.now() : null),
          gameStats: updatedStats,
          statsUpdated: result ? true : prev.statsUpdated,
        };
      });

      return true;
    } catch {
      return false;
    }
  }, [gameState, updateGameStats, updateUserStats, saveGameToHistory]);

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
    const gameMode = gameState.gameMode;
    const aiColor = gameState.aiColor;
    const aiDifficulty = gameState.aiDifficulty;
    
    // Reset AI thinking state and game ended ref
    isAiThinking.current = false;
    gameEndedRef.current = false;
    
    // Clear completed games tracking (keep only last few to prevent memory leaks)
    const completedArray = Array.from(completedGamesRef.current);
    if (completedArray.length > 10) {
      completedGamesRef.current = new Set(completedArray.slice(-5));
    }
    
    setGameState({
      game: new Chess(),
      history: [],
      currentMoveIndex: -1,
      gameResult: '',
      gameId: Math.random().toString(36).substr(2, 9),
      statsUpdated: false,
      drawOffer: { offered: false, by: null },
      timeControl: timeControl,
      whiteTime: timeControl ? timeControl.initial : 0,
      blackTime: timeControl ? timeControl.initial : 0,
      activeColor: null,
      startTime: null,
      players: players,
      colorAssignment: colorAssignment,
      gameStats: gameStats,
      gameMode: gameMode,
      aiColor: aiColor,
      aiDifficulty: aiDifficulty,
    });
  }, [gameState]);

  const clearAllGameData = useCallback(() => {
    // Reset AI thinking state and game ended ref
    isAiThinking.current = false;
    gameEndedRef.current = false;
    
    // Clear all completed games tracking
    completedGamesRef.current.clear();
    
    // Clear any active timers
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Reset to completely fresh state - no preserved settings
    setGameState({
      game: new Chess(),
      history: [],
      currentMoveIndex: -1,
      gameResult: '',
      gameId: Math.random().toString(36).substr(2, 9),
      statsUpdated: false,
      drawOffer: { offered: false, by: null },
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
      gameMode: 'human-vs-human',
      aiColor: null,
      aiDifficulty: 'medium',
    });
  }, []);

  const resign = useCallback((color: 'w' | 'b') => {
    const winningColor = color === 'w' ? 'b' : 'w';
    const winnerPlayerKey = getPlayerKeyByColor(winningColor, gameState.colorAssignment);
    const winnerName = gameState.players[winnerPlayerKey];
    const result = `${winnerName} wins by resignation!`;
    const updatedStats = updateGameStats(result, gameState.gameStats, gameState.colorAssignment, gameState.players, winningColor, gameState.statsUpdated, gameState.gameId);
    
    // Update user statistics for resignation
    updateUserStats(result, winningColor);
    
    // Save game to history
    saveGameToHistory(result, winningColor);
    
    // Mark game as ended in ref
    gameEndedRef.current = true;
    
    setGameState({
      ...gameState,
      gameResult: result,
      activeColor: null,
      startTime: null,
      gameStats: updatedStats,
      statsUpdated: true,
    });
  }, [gameState, updateGameStats, updateUserStats, saveGameToHistory]);

  const offerDraw = useCallback((color: 'w' | 'b') => {
    setGameState({
      ...gameState,
      drawOffer: { offered: true, by: color },
    });
  }, [gameState]);

  const acceptDraw = useCallback(() => {
    const result = 'Draw by agreement!';
    const updatedStats = updateGameStats(result, gameState.gameStats, gameState.colorAssignment, gameState.players, undefined, gameState.statsUpdated, gameState.gameId);
    
    // Update user statistics for draw
    updateUserStats(result);
    
    // Save game to history
    saveGameToHistory(result);
    
    // Mark game as ended in ref
    gameEndedRef.current = true;
    
    setGameState({
      ...gameState,
      gameResult: result,
      drawOffer: { offered: false, by: null },
      activeColor: null,
      startTime: null,
      gameStats: updatedStats,
      statsUpdated: true,
    });
  }, [gameState, updateGameStats, updateUserStats, saveGameToHistory]);

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

  const setGameMode = useCallback(async (mode: 'human-vs-human' | 'human-vs-ai', aiColor: 'w' | 'b' = 'b') => {
    console.log('🎮 Setting game mode:', mode, 'AI color:', mode === 'human-vs-ai' ? aiColor : 'N/A');
    setGameState(prev => {
      const newState = {
        ...prev,
        gameMode: mode,
        aiColor: mode === 'human-vs-ai' ? aiColor : null,
      };

      // Update player names when switching to AI mode
      if (mode === 'human-vs-ai') {
        const aiPlayerKey = (aiColor === 'w' && prev.colorAssignment.white === 'player1') || 
                            (aiColor === 'b' && prev.colorAssignment.black === 'player1') ? 'player1' : 'player2';
        newState.players = {
          ...prev.players,
          [aiPlayerKey]: 'Computer',
        };
      } else {
        // Reset to default names when switching back to human vs human
        newState.players = {
          player1: prev.players.player1 === 'Computer' ? 'Player 1' : prev.players.player1,
          player2: prev.players.player2 === 'Computer' ? 'Player 2' : prev.players.player2,
        };
      }

      return newState;
    });
    
    // Initialize LC0 engine when switching to AI mode
    if (mode === 'human-vs-ai') {
      try {
        console.log('Initializing LC0 engine...');
        await aiRef.current.initializeLc0();
        console.log('LC0 engine initialized successfully!');
      } catch (error) {
        console.error('Failed to initialize LC0 engine:', error);
        console.log('Falling back to built-in engine');
      }
    }
    
    // Reset AI thinking state
    isAiThinking.current = false;
  }, []);

  const setAIDifficulty = useCallback(async (difficulty: DifficultyLevel) => {
    setGameState(prev => ({
      ...prev,
      aiDifficulty: difficulty,
    }));
    
    // Update the AI engine with new difficulty
    aiRef.current.setDifficulty(difficulty);
    
    // Reinitialize LC0 engine if we're using it
    if (aiRef.current.getEngineType() === 'lc0' && gameState.gameMode === 'human-vs-ai') {
      try {
        console.log(`Reinitializing LC0 engine with ${difficulty} difficulty...`);
        await aiRef.current.initializeLc0();
        console.log('LC0 engine reinitialized successfully!');
      } catch (error) {
        console.error('Failed to reinitialize LC0 engine:', error);
      }
    }
  }, [gameState.gameMode]);


  // Socket event listeners for online multiplayer
  useEffect(() => {
    const handleSocketMoveMade = (event: CustomEvent) => {
      const data = event.detail;
      console.log('🌐 Socket move made received:', data);
      
      // Update game state with the move and timer information
      const updatedGame = new Chess(data.fen);
      const moveCount = updatedGame.history().length;
      
      setGameState(prev => ({
        ...prev,
        game: updatedGame,
        whiteTime: data.whiteTime,
        blackTime: data.blackTime,
        // Only start timer for next player if this is not the first move
        activeColor: moveCount > 1 ? data.turn : null,
        startTime: moveCount > 1 ? Date.now() : null,
      }));
    };

    const handleSocketGameEnded = (event: CustomEvent) => {
      const data = event.detail;
      console.log('🌐 Socket game ended received:', data);
      
      // Update game state to show game result
      setGameState(prev => ({
        ...prev,
        gameResult: `${data.result} (${data.reason})`,
        activeColor: null,
      }));
      
      // Stop the timer
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // Mark game as ended to prevent further moves
      gameEndedRef.current = true;
    };

    const handleSocketDrawOffered = () => {
      console.log('🌐 Socket draw offered received');
      
      // Update draw offer state
      setGameState(prev => ({
        ...prev,
        drawOffer: {
          offered: true,
          by: prev.game.turn() === 'w' ? 'b' : 'w', // The other player offered
        },
      }));
    };

    const handleSocketTimerUpdate = (event: CustomEvent) => {
      const data = event.detail;
      console.log('🌐 Socket timer update received:', data);
      
      // Update game state with timer information
      setGameState(prev => ({
        ...prev,
        whiteTime: data.whiteTime,
        blackTime: data.blackTime,
        // Only set activeColor if moves have been made (timer should be running)
        activeColor: prev.history.length > 0 ? data.turn : null,
        startTime: prev.history.length > 0 && data.turn ? Date.now() : null,
      }));
    };

    const handleSocketGameRestored = (event: CustomEvent) => {
      const data = event.detail;
      console.log('🌐 Socket game restored received:', data);
      
      // Game was restored from previous session, display message
      console.log(data.message);
    };

    const handleSocketRoomJoined = (event: CustomEvent) => {
      const data = event.detail;
      console.log('🌐 Socket room joined received:', data);
      
      // Sync GameContext time control with room's time control
      if (data.timeControl) {
        console.log('🔄 Syncing GameContext time control with room:', data.timeControl);
        
        setGameState(prev => ({
          ...prev,
          timeControl: data.timeControl,
          whiteTime: data.whiteTime || data.timeControl.initial,
          blackTime: data.blackTime || data.timeControl.initial,
          activeColor: data.gameState.turn,
        }));
      }
    };

    // Add event listeners
    window.addEventListener('socketMoveMade', handleSocketMoveMade as EventListener);
    window.addEventListener('socketGameEnded', handleSocketGameEnded as EventListener);
    window.addEventListener('socketDrawOffered', handleSocketDrawOffered);
    window.addEventListener('socketTimerUpdate', handleSocketTimerUpdate as EventListener);
    window.addEventListener('socketGameRestored', handleSocketGameRestored as EventListener);
    window.addEventListener('socketRoomJoined', handleSocketRoomJoined as EventListener);

    return () => {
      // Clean up event listeners
      window.removeEventListener('socketMoveMade', handleSocketMoveMade as EventListener);
      window.removeEventListener('socketGameEnded', handleSocketGameEnded as EventListener);
      window.removeEventListener('socketDrawOffered', handleSocketDrawOffered);
      window.removeEventListener('socketTimerUpdate', handleSocketTimerUpdate as EventListener);
      window.removeEventListener('socketGameRestored', handleSocketGameRestored as EventListener);
      window.removeEventListener('socketRoomJoined', handleSocketRoomJoined as EventListener);
    };
  }, []);

  const canUndo = gameState.currentMoveIndex >= 0;
  const canRedo = gameState.currentMoveIndex < gameState.history.length - 1;

  const value: GameContextType = {
    gameState,
    makeMove,
    undoMove,
    redoMove,
    resetGame,
    clearAllGameData,
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
    setGameMode,
    setAIDifficulty,
    canUndo,
    canRedo,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};