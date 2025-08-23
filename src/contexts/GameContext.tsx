import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { Chess, Move, Square } from 'chess.js';
import { ChessAI, DifficultyLevel } from '../utils/chessAI';
import { useAuth } from '../hooks/useAuth';
import { isFeatureEnabled } from '../config/gameFeatures';

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
  gameMode: 'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai';
  aiColor: 'w' | 'b' | null; // Which color the AI is playing (for human-vs-ai)
  aiDifficulty: DifficultyLevel;
  // AI vs AI specific settings
  whiteAiDifficulty?: DifficultyLevel;
  blackAiDifficulty?: DifficultyLevel;
  // Hint system
  hintUsed: boolean;
  currentHint: { from: Square; to: Square; promotion?: string } | null;
  aiGamePaused?: boolean;
  // Nuclear chess system
  nukeAvailable: {
    white: boolean;
    black: boolean;
  };
  nukeModeActive: {
    white: boolean;
    black: boolean;
  };
  // Teleportation system
  teleportAvailable: {
    white: boolean;
    black: boolean;
  };
  teleportModeActive: {
    white: boolean;
    black: boolean;
  };
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
  setGameMode: (mode: 'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai', aiColor?: 'w' | 'b') => Promise<void>;
  setAIDifficulty: (difficulty: DifficultyLevel) => Promise<void>;
  setAIvAIDifficulties: (whiteDifficulty: DifficultyLevel, blackDifficulty: DifficultyLevel) => void;
  pauseAIGame: () => void;
  resumeAIGame: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // Hint system
  requestHint: () => Promise<boolean>;
  clearHint: () => void;
  canUseHint: boolean;
  // Nuclear chess system
  activateNukeMode: (color: 'w' | 'b') => void;
  cancelNukeMode: () => void;
  executeNuke: (targetSquare: Square) => boolean;
  canUseNuke: (color: 'w' | 'b') => boolean;
  // Teleportation system
  activateTeleportMode: (color: 'w' | 'b') => void;
  cancelTeleportMode: () => void;
  executeTeleport: (pieceSquare: Square) => boolean;
  canUseTeleport: (color: 'w' | 'b') => boolean;
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
    // Hint system defaults
    hintUsed: false,
    currentHint: null,
    // Nuclear chess defaults
    nukeAvailable: {
      white: true,
      black: true,
    },
    nukeModeActive: {
      white: false,
      black: false,
    },
    // Teleportation defaults
    teleportAvailable: {
      white: true,
      black: true,
    },
    teleportModeActive: {
      white: false,
      black: false,
    },
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
      
      // Get move counts from different sources for validation
      const gameHistoryMoves = gameState.game.history();
      const stateHistoryMoves = gameState.history;
      const expectedMoveCount = Math.max(gameHistoryMoves.length, stateHistoryMoves.length);
      
      if (!gamePgn) {
        console.log('🔧 Generating PGN for game save...');
        console.log('📊 Move count analysis:', {
          gameHistoryLength: gameHistoryMoves.length,
          stateHistoryLength: stateHistoryMoves.length,
          expectedMoveCount,
          gamePosition: gameState.game.fen()
        });
        
        // Always reconstruct PGN from move history to ensure completeness
        // The current game object may not have full history if created from FEN
        console.log('🔄 Reconstructing PGN from complete move history...');
        
        try {
          const pgnGame = new Chess();
          let successfulMoves = 0;
          
          // Always use gameState.history which should have the complete game history
          const movesToUse = gameState.history;
          
          console.log('🔄 Reconstructing from gameState.history:', {
            totalMoves: movesToUse.length,
            firstMove: movesToUse[0]?.san || 'none',
            lastMove: movesToUse[movesToUse.length - 1]?.san || 'none'
          });
          
          movesToUse.forEach((move, index) => {
            try {
              // Apply move using the detailed move object
              const result = pgnGame.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion
              });
              if (result) {
                successfulMoves++;
              } else {
                console.log(`❌ Failed to apply move ${index + 1}:`, move);
              }
            } catch (e) {
              console.log(`❌ Error applying move ${index + 1}:`, move, e);
            }
          });
          
          // Generate clean PGN - get just the moves without headers
          const rawPgn = pgnGame.pgn();
          
          // Extract just the moves part (everything after the headers)
          const lines = rawPgn.split('\n');
          const moveLines = lines.filter(line => 
            line.trim() && 
            !line.startsWith('[') && 
            !line.endsWith(']')
          );
          
          // Create clean PGN with minimal headers
          gamePgn = moveLines.length > 0 ? moveLines.join(' ').trim() : rawPgn;
          
          console.log('✅ PGN reconstruction complete:', {
            originalMoveCount: movesToUse.length,
            successfulMoves,
            pgnLength: gamePgn.length,
            pgnPreview: gamePgn.substring(0, 150)
          });
          
          // Fallback: if reconstruction failed, try using game.pgn()
          if (!gamePgn || successfulMoves < movesToUse.length) {
            console.log('⚠️ Some moves failed to reconstruct, trying game.pgn() as fallback...');
            const fallbackPgn = gameState.game.pgn();
            if (fallbackPgn && fallbackPgn.length > (gamePgn?.length || 0)) {
              gamePgn = fallbackPgn;
              console.log('📝 Using game.pgn() fallback');
            }
          }
          
        } catch (error) {
          console.error('❌ PGN reconstruction failed:', error);
          // Last resort: use game.pgn()
          gamePgn = gameState.game.pgn();
          console.log('📝 Using game.pgn() as last resort');
        }
      }
      
      // Final validation (moved outside the if block)
      const finalMoveCount = gamePgn ? (gamePgn.match(/\d+\./g) || []).length : 0;
      const isValid = gamePgn && gamePgn.length > 10; // Reduced from 20 to be less strict
      
      console.log('🎯 Final PGN validation:', {
        isValid,
        length: gamePgn?.length || 0,
        estimatedMoveCount: finalMoveCount,
        expectedMoveCount,
        discrepancy: Math.abs(finalMoveCount - expectedMoveCount),
        preview: gamePgn?.substring(0, 150) || 'empty'
      });
      
      if (!isValid) {
        console.error('⚠️ WARNING: PGN appears invalid or incomplete!');
        console.error('⚠️ This game may not replay correctly in the future');
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
        moveCount: Math.max(gameState.history.length, gameState.game.history().length, finalMoveCount),
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

  // AI move effect (handles both human-vs-ai and ai-vs-ai)
  useEffect(() => {
    const currentTurn = gameState.game.turn();
    const shouldAIMove = 
      ((gameState.gameMode === 'human-vs-ai' &&
        gameState.aiColor !== null &&
        gameState.aiColor === currentTurn) ||
       (gameState.gameMode === 'ai-vs-ai' &&
        !gameState.aiGamePaused)) &&
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
          
          // Determine which difficulty to use for AI vs AI
          let difficultyToUse = gameState.aiDifficulty;
          if (gameState.gameMode === 'ai-vs-ai') {
            difficultyToUse = currentTurn === 'w' ? 
              (gameState.whiteAiDifficulty || 'medium') : 
              (gameState.blackAiDifficulty || 'medium');
            
            // Update the AI engine with the correct difficulty
            await aiRef.current.setDifficulty(difficultyToUse);
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
              // Add delay for AI vs AI games to make them watchable
              if (gameState.gameMode === 'ai-vs-ai') {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
              }
              
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
          
          // Save game to history with the full PGN
          // Reconstruct the full game from all moves to ensure complete PGN
          const fullGameForPgn = new Chess();
          newHistory.forEach((move) => {
            fullGameForPgn.move({
              from: move.from,
              to: move.to,
              promotion: move.promotion
            });
          });
          saveGameToHistory(result, winningColor, gameCopy.fen(), fullGameForPgn.pgn());
        }

        // Check if this move matches the current hint and clear it
        const clearHintMove = prev.currentHint && 
                             prev.currentHint.from === from && 
                             prev.currentHint.to === to;
                             
        if (prev.currentHint) {
          console.log('🎯 Move made with hint active:', {
            hintMove: `${prev.currentHint.from}-${prev.currentHint.to}`,
            actualMove: `${from}-${to}`,
            matches: clearHintMove,
            willClear: clearHintMove ? 'YES' : 'NO'
          });
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
          // Clear hint if the suggested move was made
          currentHint: clearHintMove ? null : prev.currentHint,
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
      // Reset hint system
      hintUsed: false,
      currentHint: null,
      // Reset nuclear system
      nukeAvailable: {
        white: true,
        black: true,
      },
      nukeModeActive: {
        white: false,
        black: false,
      },
      // Reset teleportation system
      teleportAvailable: {
        white: true,
        black: true,
      },
      teleportModeActive: {
        white: false,
        black: false,
      },
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
    
    // Save game to history with complete PGN
    const finalFen = gameState.game.fen();
    const pgn = gameState.game.pgn();
    saveGameToHistory(result, winningColor, finalFen, pgn);
    
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
    
    // Save game to history with complete PGN
    const finalFen = gameState.game.fen();
    const pgn = gameState.game.pgn();
    saveGameToHistory(result, undefined, finalFen, pgn);
    
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

  const setGameMode = useCallback(async (mode: 'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai', aiColor: 'w' | 'b' = 'b') => {
    console.log('🎮 Setting game mode:', mode, 'AI color:', mode === 'human-vs-ai' ? aiColor : 'N/A');
    setGameState(prev => {
      const newState = {
        ...prev,
        gameMode: mode,
        aiColor: mode === 'human-vs-ai' ? aiColor : null,
        aiGamePaused: mode === 'ai-vs-ai' ? false : undefined,
        whiteAiDifficulty: mode === 'ai-vs-ai' ? (prev.whiteAiDifficulty || 'medium') : undefined,
        blackAiDifficulty: mode === 'ai-vs-ai' ? (prev.blackAiDifficulty || 'medium') : undefined,
      };

      // Update player names based on mode
      if (mode === 'human-vs-ai') {
        const aiPlayerKey = (aiColor === 'w' && prev.colorAssignment.white === 'player1') || 
                            (aiColor === 'b' && prev.colorAssignment.black === 'player1') ? 'player1' : 'player2';
        newState.players = {
          ...prev.players,
          [aiPlayerKey]: 'Computer',
        };
      } else if (mode === 'ai-vs-ai') {
        // Both players are AI
        newState.players = {
          player1: prev.colorAssignment.white === 'player1' ? 'White AI' : 'Black AI',
          player2: prev.colorAssignment.white === 'player2' ? 'White AI' : 'Black AI',
        };
      } else {
        // Reset to default names when switching back to human vs human
        newState.players = {
          player1: (prev.players.player1 === 'Computer' || prev.players.player1 === 'White AI' || prev.players.player1 === 'Black AI') ? 'Player 1' : prev.players.player1,
          player2: (prev.players.player2 === 'Computer' || prev.players.player2 === 'White AI' || prev.players.player2 === 'Black AI') ? 'Player 2' : prev.players.player2,
        };
      }

      return newState;
    });
    
    // Initialize LC0 engine when switching to AI mode
    if (mode === 'human-vs-ai' || mode === 'ai-vs-ai') {
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
      
      // Parse the result to determine winning color
      let winningColor: 'w' | 'b' | undefined;
      if (data.result.includes('White wins')) {
        winningColor = 'w';
      } else if (data.result.includes('Black wins')) {
        winningColor = 'b';
      }
      
      // Update game state to show game result
      setGameState(prev => {
        // Save game to history with PGN from socket
        const finalFen = prev.game.fen();
        const pgn = data.pgn || prev.game.pgn(); // Use PGN from socket if available
        saveGameToHistory(`${data.result} (${data.reason})`, winningColor, finalFen, pgn);
        
        return {
          ...prev,
          gameResult: `${data.result} (${data.reason})`,
          activeColor: null,
        };
      });
      
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
  }, [saveGameToHistory]);

  const canUndo = gameState.currentMoveIndex >= 0;
  const canRedo = gameState.currentMoveIndex < gameState.history.length - 1;

  // Add AI vs AI specific functions
  const setAIvAIDifficulties = useCallback((whiteDifficulty: DifficultyLevel, blackDifficulty: DifficultyLevel) => {
    setGameState(prev => ({
      ...prev,
      whiteAiDifficulty: whiteDifficulty,
      blackAiDifficulty: blackDifficulty,
    }));
  }, []);

  const pauseAIGame = useCallback(() => {
    if (gameState.gameMode === 'ai-vs-ai') {
      setGameState(prev => ({
        ...prev,
        aiGamePaused: true,
      }));
    }
  }, [gameState.gameMode]);

  const resumeAIGame = useCallback(() => {
    if (gameState.gameMode === 'ai-vs-ai') {
      setGameState(prev => ({
        ...prev,
        aiGamePaused: false,
      }));
    }
  }, [gameState.gameMode]);

  // Hint system implementation
  const requestHint = useCallback(async (): Promise<boolean> => {
    // Check if hint can be used
    if (gameState.hintUsed || gameState.gameResult) {
      return false;
    }

    // Only allow hints in human vs human or human vs AI games
    if (gameState.gameMode === 'ai-vs-ai') {
      return false;
    }

    try {
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/analysis/hint`;
      console.log('💡 Requesting hint from:', url);
      console.log('💡 Request payload:', { fen: gameState.game.fen() });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fen: gameState.game.fen(),
        }),
      });

      console.log('💡 Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to get hint from server:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        return false;
      }

      const data = await response.json();
      console.log('💡 Response data:', data);
      
      if (data.success && data.bestMove) {
        console.log('💡 Setting hint:', data.bestMove);
        setGameState(prev => ({
          ...prev,
          hintUsed: true,
          currentHint: {
            from: data.bestMove.from,
            to: data.bestMove.to,
            promotion: data.bestMove.promotion,
          },
        }));
        return true;
      } else {
        console.warn('💡 Invalid response format or no best move:', data);
        return false;
      }
    } catch (error) {
      console.error('Error requesting hint:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('💡 This is likely a CORS or network connectivity issue');
      }
    }
    
    return false;
  }, [gameState.hintUsed, gameState.gameResult, gameState.gameMode, gameState.game]);

  const clearHint = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      currentHint: null,
    }));
  }, []);

  // Nuclear Chess functions
  const canUseNuke = useCallback((color: 'w' | 'b'): boolean => {
    // Check if feature is enabled
    if (!isFeatureEnabled('NUCLEAR_CHESS')) return false;
    
    // Only available in human vs human mode
    if (gameState.gameMode !== 'human-vs-human') return false;
    
    // Only available in first 10 moves (20 half-moves)
    const moveCount = gameState.game.history().length;
    if (moveCount >= 20) return false;
    
    // Check if this color hasn't used their nuke yet
    return color === 'w' ? gameState.nukeAvailable.white : gameState.nukeAvailable.black;
  }, [gameState.gameMode, gameState.game, gameState.nukeAvailable]);

  const activateNukeMode = useCallback((color: 'w' | 'b') => {
    if (!canUseNuke(color)) return;
    
    setGameState(prev => ({
      ...prev,
      nukeModeActive: {
        white: color === 'w',
        black: color === 'b',
      },
    }));
  }, [canUseNuke]);

  const cancelNukeMode = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      nukeModeActive: {
        white: false,
        black: false,
      },
    }));
  }, []);

  const executeNuke = useCallback((targetSquare: Square): boolean => {
    const activeNukeColor = gameState.nukeModeActive.white ? 'w' : 
                           gameState.nukeModeActive.black ? 'b' : null;
    
    if (!activeNukeColor) return false;
    
    // Get the piece on the target square
    const targetPiece = gameState.game.get(targetSquare);
    if (!targetPiece) return false;
    
    // Can't nuke your own pieces
    if (targetPiece.color === activeNukeColor) return false;
    
    // Can't nuke Kings or Queens
    if (targetPiece.type === 'k' || targetPiece.type === 'q') return false;
    
    // Create a copy of the game and remove the piece
    const gameCopy = new Chess(gameState.game.fen());
    gameCopy.remove(targetSquare);
    
    // Create a special nuke move entry
    const nukeMove: Move = {
      san: `💣x${targetPiece.type.toUpperCase()}${targetSquare}`,
      from: targetSquare,
      to: targetSquare,
      color: activeNukeColor,
      piece: targetPiece.type,
      captured: targetPiece.type,
      flags: 'n' as any, // Special flag for nuke
    };
    
    setGameState(prev => ({
      ...prev,
      game: gameCopy,
      history: [...prev.history, nukeMove],
      currentMoveIndex: prev.history.length,
      nukeAvailable: {
        white: activeNukeColor === 'w' ? false : prev.nukeAvailable.white,
        black: activeNukeColor === 'b' ? false : prev.nukeAvailable.black,
      },
      nukeModeActive: {
        white: false,
        black: false,
      },
    }));
    
    return true;
  }, [gameState.nukeModeActive, gameState.game]);

  // Teleportation functions
  const canUseTeleport = useCallback((color: 'w' | 'b'): boolean => {
    // Check if feature is enabled
    if (!isFeatureEnabled('TELEPORTATION')) return false;
    
    // Only available in human vs human mode
    if (gameState.gameMode !== 'human-vs-human') return false;
    
    // Only available in first 10 moves (20 half-moves)
    const moveCount = gameState.game.history().length;
    if (moveCount >= 20) return false;
    
    // Check if this color hasn't used their teleport yet
    return color === 'w' ? gameState.teleportAvailable.white : gameState.teleportAvailable.black;
  }, [gameState.gameMode, gameState.game, gameState.teleportAvailable]);

  const activateTeleportMode = useCallback((color: 'w' | 'b') => {
    if (!canUseTeleport(color)) return;
    
    setGameState(prev => ({
      ...prev,
      teleportModeActive: {
        white: color === 'w',
        black: color === 'b',
      },
    }));
  }, [canUseTeleport]);

  const cancelTeleportMode = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      teleportModeActive: {
        white: false,
        black: false,
      },
    }));
  }, []);

  const executeTeleport = useCallback((pieceSquare: Square): boolean => {
    const activeTeleportColor = gameState.teleportModeActive.white ? 'w' : 
                               gameState.teleportModeActive.black ? 'b' : null;
    
    if (!activeTeleportColor) return false;
    
    // Get the piece on the source square
    const piece = gameState.game.get(pieceSquare);
    if (!piece) return false;
    
    // Can only teleport your own pieces
    if (piece.color !== activeTeleportColor) return false;
    
    // Get all empty squares on the board
    const allSquares: Square[] = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8',
                                  'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8',
                                  'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8',
                                  'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8',
                                  'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8',
                                  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8',
                                  'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8',
                                  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'];
    
    const emptySquares = allSquares.filter(square => !gameState.game.get(square));
    
    if (emptySquares.length === 0) {
      // No empty squares available
      return false;
    }
    
    // Randomly select an empty square
    const randomIndex = Math.floor(Math.random() * emptySquares.length);
    const targetSquare = emptySquares[randomIndex];
    
    // Create a copy of the game and make the teleport move
    const gameCopy = new Chess(gameState.game.fen());
    gameCopy.remove(pieceSquare);
    gameCopy.put({ type: piece.type, color: piece.color }, targetSquare);
    
    // Create a special teleport move entry
    const teleportMove: Move = {
      san: `♦${piece.type.toUpperCase()}${pieceSquare}-${targetSquare}`,
      from: pieceSquare,
      to: targetSquare,
      color: activeTeleportColor,
      piece: piece.type,
      flags: 't' as any, // Special flag for teleport
    };
    
    setGameState(prev => ({
      ...prev,
      game: gameCopy,
      history: [...prev.history, teleportMove],
      currentMoveIndex: prev.history.length,
      teleportAvailable: {
        white: activeTeleportColor === 'w' ? false : prev.teleportAvailable.white,
        black: activeTeleportColor === 'b' ? false : prev.teleportAvailable.black,
      },
      teleportModeActive: {
        white: false,
        black: false,
      },
    }));
    
    return true;
  }, [gameState.teleportModeActive, gameState.game]);

  const canUseHint = isFeatureEnabled('HINTS') && 
                    !gameState.hintUsed && 
                    !gameState.gameResult && 
                    gameState.gameMode !== 'ai-vs-ai';

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
    setAIvAIDifficulties,
    pauseAIGame,
    resumeAIGame,
    canUndo,
    canRedo,
    // Hint system
    requestHint,
    clearHint,
    canUseHint,
    // Nuclear chess system
    activateNukeMode,
    cancelNukeMode,
    executeNuke,
    canUseNuke,
    // Teleportation system
    activateTeleportMode,
    cancelTeleportMode,
    executeTeleport,
    canUseTeleport,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};