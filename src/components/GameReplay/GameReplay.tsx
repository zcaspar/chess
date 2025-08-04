import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useAuth } from '../../hooks/useAuth';

interface GameHistoryEntry {
  id: number;
  gameId: string;
  opponentName: string;
  playerColor: 'w' | 'b';
  gameResult: string;
  gameOutcome: 'win' | 'loss' | 'draw';
  finalFen: string;
  pgn: string;
  moveCount: number;
  gameDuration?: number;
  timeControl?: {
    initial: number;
    increment: number;
  };
  gameMode: 'human-vs-human' | 'human-vs-ai';
  aiDifficulty?: string;
  createdAt: string;
}

interface PositionAnalysis {
  position: string;
  engine: string;
  depth: number;
  analysisTime: number;
  evaluation: number | null;
  bestMove: {
    from: string;
    to: string;
    uci: string;
  } | null;
  recommendation: string | null;
  analysisDate: string;
  message?: string;
}

interface GameReplayProps {
  game: GameHistoryEntry;
  onClose?: () => void;
}

const GameReplay: React.FC<GameReplayProps> = ({ game, onClose }) => {
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(1000); // milliseconds
  const [analysis, setAnalysis] = useState<PositionAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  
  const { user, profile } = useAuth();
  
  // Ref for the move history container to enable auto-scrolling
  const moveHistoryRef = useRef<HTMLDivElement>(null);

  // Parse the PGN and get all moves
  const gameHistory = useMemo(() => {
    try {
      setGameError(null);
      
      if (!game.pgn || typeof game.pgn !== 'string') {
        throw new Error('Invalid PGN data - PGN is missing or not a string');
      }
      
      console.log('🔍 Raw PGN data:', game.pgn);
      console.log('🔍 PGN length:', game.pgn.length);
      console.log('🔍 PGN type:', typeof game.pgn);
      console.log('🔍 PGN char codes:', game.pgn.split('').slice(0, 20).map(c => c.charCodeAt(0)));
      console.log('🔍 Game moveCount:', game.moveCount);
      console.log('🔍 Game finalFen:', game.finalFen);
      console.log('🔍 Full PGN content:', JSON.stringify(game.pgn));
      
      // Try multiple approaches to parse the game
      let history: any[] = [];
      
      // Approach 1: Direct PGN loading
      try {
        const chessGame = new Chess();
        console.log('🔍 Attempting direct PGN load...');
        const success = chessGame.loadPgn(game.pgn);
        if (success) {
          history = chessGame.history({ verbose: true });
          console.log('✅ Direct PGN load successful, moves:', history.length);
          if (history.length > 0) {
            console.log('🔍 Sample moves from direct load:', history.slice(0, 5).map(m => m.san));
            return history;
          } else {
            console.log('⚠️ Direct PGN load succeeded but returned 0 moves');
          }
        } else {
          console.log('❌ Direct PGN load failed');
        }
      } catch (pgnError) {
        console.log('❌ Direct PGN load error:', pgnError);
      }
      
      // Approach 2: Try cleaning the PGN and removing result markers
      try {
        console.log('🔍 Attempting cleaned PGN load...');
        let cleanedPgn = game.pgn.trim();
        
        // Remove PGN metadata tags (everything in square brackets) but keep newlines
        cleanedPgn = cleanedPgn.replace(/\[.*?\]\s*/g, '');
        
        // Remove common PGN result markers that might cause issues
        cleanedPgn = cleanedPgn.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '');
        
        // Clean up multiple whitespaces but preserve structure
        cleanedPgn = cleanedPgn.replace(/\n\s*\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
        
        console.log('🔍 Cleaned PGN length:', cleanedPgn.length);
        console.log('🔍 Cleaned PGN preview:', cleanedPgn.substring(0, 200));
        
        if (cleanedPgn.length > 0) {
          const chessGame = new Chess();
          const success = chessGame.loadPgn(cleanedPgn);
          if (success) {
            history = chessGame.history({ verbose: true });
            console.log('✅ Cleaned PGN load successful, moves:', history.length);
            console.log('🔍 Sample moves from cleaned load:', history.slice(0, 5).map(m => m.san));
            return history;
          } else {
            console.log('❌ Cleaned PGN load failed - chess.js could not parse');
          }
        } else {
          console.log('❌ Cleaned PGN is empty after removing headers');
        }
      } catch (cleanError) {
        console.log('❌ Cleaned PGN load error:', cleanError);
      }
      
      // Approach 3: Try parsing as space-separated moves without move numbers
      try {
        console.log('🔍 Attempting manual move parsing...');
        const chessGame = new Chess();
        
        // Extract just the moves from PGN, removing move numbers and results
        let moveString = game.pgn
          .replace(/\[.*?\]/g, '') // Remove PGN metadata tags
          .replace(/\d+\.\s*/g, '') // Remove move numbers like "1. "
          .replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '') // Remove result
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        console.log('🔍 Extracted move string:', moveString);
        
        if (moveString) {
          const moves = moveString.split(' ').filter(move => move.trim());
          console.log('🔍 Move array:', moves);
          
          for (const moveStr of moves) {
            if (moveStr.trim()) {
              try {
                const move = chessGame.move(moveStr.trim());
                if (!move) {
                  console.log('❌ Invalid move:', moveStr);
                  break;
                }
              } catch (moveErr) {
                console.log('❌ Move error for', moveStr, ':', moveErr);
                break;
              }
            }
          }
          
          history = chessGame.history({ verbose: true });
          if (history.length > 0) {
            console.log('✅ Manual parsing successful, moves:', history.length);
            return history;
          }
        }
      } catch (manualError) {
        console.log('❌ Manual parsing error:', manualError);
      }
      
      // Approach 3.5: Try regex-based move extraction
      try {
        console.log('🔍 Attempting regex-based move extraction...');
        const chessGame = new Chess();
        
        // More comprehensive regex to catch various move formats
        const movePattern = /([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?[+#]?)/g;
        const extractedMoves = game.pgn.match(movePattern);
        
        console.log('🔍 Regex extracted moves:', extractedMoves);
        
        if (extractedMoves && extractedMoves.length > 0) {
          for (const moveStr of extractedMoves) {
            try {
              const move = chessGame.move(moveStr.trim());
              if (!move) {
                console.log('❌ Invalid regex move:', moveStr);
                // Continue instead of breaking to try more moves
                continue;
              }
            } catch (moveErr) {
              console.log('❌ Regex move error for', moveStr, ':', moveErr);
              // Continue instead of breaking to try more moves
              continue;
            }
          }
          
          history = chessGame.history({ verbose: true });
          if (history.length > 0) {
            console.log('✅ Regex parsing successful, moves:', history.length);
            return history;
          }
        }
      } catch (regexError) {
        console.log('❌ Regex parsing error:', regexError);
      }
      
      // Approach 4: Try very aggressive text parsing
      try {
        console.log('🔍 Attempting aggressive text parsing...');
        const chessGame = new Chess();
        
        // Split on any whitespace and filter for chess move patterns
        const tokens = game.pgn.split(/\s+/).filter(token => token.trim());
        console.log('🔍 All tokens:', tokens);
        
        for (const token of tokens) {
          // Skip move numbers, results, annotations, and PGN metadata tags
          if (token.match(/^\d+\.?$/) || 
              token.match(/^(1-0|0-1|1\/2-1\/2|\*)$/) ||
              token.match(/^\{.*\}$/) ||
              token.match(/^\(.*\)$/) ||
              token.match(/^\[.*/) ||  // PGN tag start like [Round, [White, etc.
              token.match(/.*\]$/) ||  // PGN tag end like "?"], 1"], etc.
              token.match(/^".*"$/) || // Quoted strings in PGN tags
              (token.match(/^[a-zA-Z]+$/) && token.length > 10)) { // Skip long text like FEN strings
            continue;
          }
          
          // Try to play the move
          try {
            const move = chessGame.move(token);
            if (!move) {
              // If move fails, continue to next token instead of breaking
              console.log('⚠️ Skipping invalid token:', token);
              continue;
            }
          } catch (moveErr) {
            console.log('⚠️ Skipping problematic token:', token, moveErr);
            continue;
          }
        }
        
        history = chessGame.history({ verbose: true });
        if (history.length > 0) {
          console.log('✅ Aggressive parsing successful, moves:', history.length);
          return history;
        }
      } catch (aggressiveError) {
        console.log('❌ Aggressive parsing error:', aggressiveError);
      }
      
      // Approach 5: Last resort - try to extract moves from PGN using a different method
      try {
        console.log('🔍 Last resort: trying to build moves from FEN and moveCount...');
        
        // If we have a final FEN and move count, we can at least show the final position
        if (game.finalFen && game.moveCount > 0) {
          console.log('⚠️ Using final position fallback - showing end position only');
          // Return empty array to trigger final position display
          return [];
        }
      } catch (lastError) {
        console.log('❌ Last resort failed:', lastError);
      }
      
      // If all approaches fail
      console.log('❌ All PGN parsing methods failed - no moves will be shown');
      console.log('🔍 PGN details:', {
        hasRealCredentials: !!game.pgn,
        pgnLength: game.pgn?.length || 0,
        moveCount: game.moveCount,
        finalFen: game.finalFen ? 'Present' : 'Missing'
      });
      
      throw new Error(`Unable to parse PGN. Expected ${game.moveCount} moves but could not extract them from PGN.`);
      
    } catch (error) {
      console.error('❌ All PGN parsing methods failed:', error);
      setGameError(`Failed to load PGN: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }, [game.pgn, game.finalFen, game.moveCount]);

  // Log the final gameHistory result
  useEffect(() => {
    console.log('🎯 Final gameHistory length:', gameHistory.length);
    console.log('🎯 Expected moveCount:', game.moveCount);
    if (gameHistory.length > 0) {
      console.log('🎯 First 10 moves:', gameHistory.slice(0, 10).map(m => m.san));
      console.log('🎯 Last 5 moves:', gameHistory.slice(-5).map(m => m.san));
    }
  }, [gameHistory, game.moveCount]);

  // Get current board position
  const currentGame = useMemo(() => {
    try {
      const chessGame = new Chess();
      
      // If we have move history, apply moves up to current index
      if (gameHistory.length > 0) {
        for (let i = 0; i <= currentMoveIndex && i < gameHistory.length; i++) {
          const move = gameHistory[i];
          try {
            const result = chessGame.move({
              from: move.from,
              to: move.to,
              promotion: move.promotion
            });
            if (!result) {
              console.error('Invalid move at index', i, move);
              break;
            }
          } catch (moveError) {
            console.error('Error applying move at index', i, move, moveError);
            break;
          }
        }
        return chessGame;
      } else {
        // If no move history but we have a final FEN, show that position
        if (game.finalFen) {
          try {
            console.log('🔄 Loading final position from FEN:', game.finalFen);
            return new Chess(game.finalFen);
          } catch (fenError) {
            console.error('❌ Error loading final FEN:', fenError);
            return new Chess(); // Return starting position as fallback
          }
        }
        return new Chess(); // Return starting position as fallback
      }
    } catch (error) {
      console.error('Error creating current game position:', error);
      return new Chess(); // Return starting position as fallback
    }
  }, [gameHistory, currentMoveIndex, game.finalFen]);

  // Auto-play functionality
  useEffect(() => {
    if (!isAutoPlaying || gameHistory.length === 0) return;

    const interval = setInterval(() => {
      try {
        setCurrentMoveIndex(prevIndex => {
          if (prevIndex >= gameHistory.length - 1) {
            setIsAutoPlaying(false);
            return prevIndex;
          }
          return prevIndex + 1;
        });
      } catch (error) {
        console.error('Error in auto-play interval:', error);
        setIsAutoPlaying(false);
      }
    }, autoPlaySpeed);

    return () => clearInterval(interval);
  }, [isAutoPlaying, autoPlaySpeed, gameHistory.length]);

  // Auto-scroll to current move in history
  useEffect(() => {
    if (moveHistoryRef.current && currentMoveIndex >= 0) {
      const pairIndex = Math.floor(currentMoveIndex / 2);
      const moveElement = moveHistoryRef.current.children[pairIndex] as HTMLElement;
      if (moveElement) {
        moveElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest' 
        });
      }
    }
  }, [currentMoveIndex]);

  const goToStart = () => {
    setCurrentMoveIndex(-1);
    setIsAutoPlaying(false);
  };

  const goToPrevious = () => {
    if (currentMoveIndex > -1) {
      setCurrentMoveIndex(currentMoveIndex - 1);
    }
    setIsAutoPlaying(false);
  };

  const goToNext = () => {
    try {
      if (currentMoveIndex < gameHistory.length - 1) {
        setCurrentMoveIndex(currentMoveIndex + 1);
      }
      setIsAutoPlaying(false);
    } catch (error) {
      console.error('Error in goToNext:', error);
      setIsAutoPlaying(false);
    }
  };

  const goToEnd = () => {
    try {
      setCurrentMoveIndex(gameHistory.length - 1);
      setIsAutoPlaying(false);
    } catch (error) {
      console.error('Error in goToEnd:', error);
      setIsAutoPlaying(false);
    }
  };

  const toggleAutoPlay = () => {
    try {
      setIsAutoPlaying(!isAutoPlaying);
    } catch (error) {
      console.error('Error in toggleAutoPlay:', error);
      setIsAutoPlaying(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'win': return 'text-green-600';
      case 'loss': return 'text-red-600';
      case 'draw': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };


  const isWhiteMove = (index: number) => {
    return index % 2 === 0;
  };

  const analyzePosition = async () => {
    if (!user) {
      setAnalysisError('You must be signed in to analyze positions');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysis(null);

    try {
      const token = await user.getIdToken();
      const currentFen = currentGame.fen();
      
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/analysis/position`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fen: currentFen,
          depth: 15
        })
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setAnalysis(data.analysis);
        if (data.warning) {
          setAnalysisError(data.warning);
        }
      } else {
        throw new Error('Analysis request failed');
      }

    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisError(error instanceof Error ? error.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Create custom square styles for highlighting the best move
  const getCustomSquareStyles = () => {
    const styles: { [square: string]: React.CSSProperties } = {};
    
    if (analysis?.bestMove) {
      // Highlight the from square in light purple
      styles[analysis.bestMove.from] = {
        backgroundColor: 'rgba(147, 51, 234, 0.3)',
        borderRadius: '3px',
      };
      
      // Highlight the to square in darker purple
      styles[analysis.bestMove.to] = {
        backgroundColor: 'rgba(147, 51, 234, 0.5)',
        borderRadius: '3px',
      };
    }
    
    return styles;
  };

  // Get board orientation from user preferences
  const boardOrientation = profile?.preferences?.boardOrientation === 'black' ? 'black' : 'white';

  // If there's a critical error, show error message
  if (gameError) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl font-bold text-red-600">Error Loading Game</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Close
            </button>
          )}
        </div>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-medium">Failed to load game replay:</p>
          <p className="mt-2">{gameError}</p>
          <p className="mt-2 text-sm">Please try refreshing the page or contact support if this issue persists.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Game Replay</h2>
          <div className="text-gray-600 space-y-1">
            <p><strong>Opponent:</strong> {game.opponentName}</p>
            <p><strong>Date:</strong> {formatDate(game.createdAt)}</p>
            <p><strong>Result:</strong> <span className={getOutcomeColor(game.gameOutcome)}>{game.gameResult}</span></p>
            <p><strong>Mode:</strong> {game.gameMode === 'human-vs-ai' ? `AI (${game.aiDifficulty})` : 'Human vs Human'}</p>
            {game.gameDuration && <p><strong>Duration:</strong> {formatDuration(game.gameDuration)}</p>}
            {game.timeControl && (
              <p><strong>Time Control:</strong> {Math.floor(game.timeControl.initial / 60)}min
                {game.timeControl.increment > 0 && ` + ${game.timeControl.increment}s`}
              </p>
            )}
          </div>
        </div>
        
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Chess Board - Fixed position */}
        <div className="lg:flex-1">
          <div className="flex justify-center">
            <div className="sticky top-4">
              <Chessboard
                position={currentGame.fen()}
                boardWidth={500}
                customBoardStyle={{
                  borderRadius: '4px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
                customSquareStyles={getCustomSquareStyles()}
                areArrowsAllowed={false}
                arePiecesDraggable={false}
                boardOrientation={boardOrientation}
              />
            </div>
          </div>

          {/* Position Analysis - Left aligned with board */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={analyzePosition}
              disabled={isAnalyzing || !user}
              className={`px-4 py-2 rounded transition-colors ${
                isAnalyzing || !user
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
              title={!user ? 'Sign in to analyze positions' : 'Analyze current position with LC0'}
            >
              {isAnalyzing ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Analyzing...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  🧠 Analyze Position
                </div>
              )}
            </button>
            
            {analysis && (
              <button
                onClick={() => {
                  setAnalysis(null);
                  setAnalysisError(null);
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                title="Clear analysis and highlighting"
              >
                Clear Analysis
              </button>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4">
            <div className="flex justify-center items-center gap-2">
              <button
                onClick={goToStart}
                disabled={currentMoveIndex <= -1}
                className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Go to start"
              >
                ⏮
              </button>
              <button
                onClick={goToPrevious}
                disabled={currentMoveIndex <= -1}
                className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous move"
              >
                ⏪
              </button>
              <button
                onClick={toggleAutoPlay}
                className={`px-4 py-2 rounded transition-colors ${
                  isAutoPlaying 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {isAutoPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <button
                onClick={goToNext}
                disabled={currentMoveIndex >= gameHistory.length - 1}
                className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next move"
              >
                ⏩
              </button>
              <button
                onClick={goToEnd}
                disabled={currentMoveIndex >= gameHistory.length - 1}
                className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Go to end"
              >
                ⏭
              </button>
            </div>

            {/* Speed Control */}
            <div className="flex justify-center items-center gap-2">
              <label className="text-sm font-medium">Speed:</label>
              <select
                value={autoPlaySpeed}
                onChange={(e) => setAutoPlaySpeed(Number(e.target.value))}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value={2000}>Slow (2s)</option>
                <option value={1000}>Normal (1s)</option>
                <option value={500}>Fast (0.5s)</option>
                <option value={250}>Very Fast (0.25s)</option>
              </select>
            </div>


            {/* Position Info */}
            <div className="text-center text-sm text-gray-600">
              {gameHistory.length > 0 ? (
                <>
                  Move {currentMoveIndex + 1} of {gameHistory.length}
                  {currentMoveIndex >= 0 && currentMoveIndex < gameHistory.length && gameHistory[currentMoveIndex] && (
                    <span className="ml-2">
                      ({isWhiteMove(currentMoveIndex) ? 'White' : 'Black'}: {gameHistory[currentMoveIndex].san})
                    </span>
                  )}
                </>
              ) : game.finalFen ? (
                <span className="text-yellow-600">Showing final position - move history unavailable</span>
              ) : (
                <span className="text-red-500">No moves available in this game</span>
              )}
            </div>
          </div>
        </div>

        {/* Move History */}
        <div className="lg:w-[300px] lg:flex-shrink-0">
          <h3 className="text-lg font-semibold mb-4">Move History</h3>
          <div className="bg-gray-50 rounded-lg p-3 h-[600px] overflow-y-auto">
            {gameHistory.length === 0 ? (
              <div className="text-gray-500 text-center">
                <p>No move history available</p>
                {game.finalFen && (
                  <p className="text-sm mt-2">Showing final board position</p>
                )}
              </div>
            ) : gameHistory.length < game.moveCount / 2 ? (
              <div className="text-center mb-4">
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-2 rounded mb-3">
                  <p className="text-sm font-medium">⚠️ Incomplete Move History</p>
                  <p className="text-xs mt-1">
                    This game was saved with limited move data. 
                    Expected {game.moveCount} moves, showing {gameHistory.length} available moves.
                    Future games will save complete move history.
                  </p>
                </div>
                <div className="space-y-0.5" ref={moveHistoryRef}>
                  {Array.from({ length: Math.ceil(gameHistory.length / 2) }, (_, pairIndex) => {
                    const whiteIndex = pairIndex * 2;
                    const blackIndex = pairIndex * 2 + 1;
                    const whiteMove = gameHistory[whiteIndex];
                    const blackMove = gameHistory[blackIndex];
                    const moveNumber = pairIndex + 1;
                    
                    return (
                      <div key={pairIndex} className="flex items-center gap-1">
                        {/* Move number */}
                        <span className="text-gray-500 text-sm w-6 text-right">{moveNumber}.</span>
                        
                        {/* White move */}
                        <button
                          onClick={() => {
                            try {
                              setCurrentMoveIndex(whiteIndex);
                              setIsAutoPlaying(false);
                            } catch (error) {
                              console.error('Error setting move index:', error);
                            }
                          }}
                          className={`px-2 py-0.5 rounded text-sm transition-colors min-w-[60px] bg-yellow-200 text-yellow-800 ${
                            currentMoveIndex === whiteIndex
                              ? 'bg-yellow-400 text-yellow-900'
                              : 'hover:bg-yellow-300'
                          }`}
                          title="Reconstructed move - not from original game"
                        >
                          {whiteMove?.san || 'Invalid'}
                        </button>
                        
                        {/* Black move (if exists) */}
                        {blackMove ? (
                          <button
                            onClick={() => {
                              try {
                                setCurrentMoveIndex(blackIndex);
                                setIsAutoPlaying(false);
                              } catch (error) {
                                console.error('Error setting move index:', error);
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-sm transition-colors min-w-[60px] bg-yellow-200 text-yellow-800 ${
                              currentMoveIndex === blackIndex
                                ? 'bg-yellow-400 text-yellow-900'
                                : 'hover:bg-yellow-300'
                            }`}
                            title="Reconstructed move - not from original game"
                          >
                            {blackMove.san || 'Invalid'}
                          </button>
                        ) : (
                          <div className="min-w-[60px]"></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-0.5" ref={moveHistoryRef}>
                {Array.from({ length: Math.ceil(gameHistory.length / 2) }, (_, pairIndex) => {
                  const whiteIndex = pairIndex * 2;
                  const blackIndex = pairIndex * 2 + 1;
                  const whiteMove = gameHistory[whiteIndex];
                  const blackMove = gameHistory[blackIndex];
                  const moveNumber = pairIndex + 1;
                  
                  return (
                    <div key={pairIndex} className="flex items-center gap-1">
                      {/* Move number */}
                      <span className="text-gray-500 text-sm w-6 text-right">{moveNumber}.</span>
                      
                      {/* White move */}
                      <button
                        onClick={() => {
                          try {
                            setCurrentMoveIndex(whiteIndex);
                            setIsAutoPlaying(false);
                          } catch (error) {
                            console.error('Error setting move index:', error);
                          }
                        }}
                        className={`px-2 py-0.5 rounded text-sm transition-colors min-w-[60px] ${
                          currentMoveIndex === whiteIndex
                            ? 'bg-blue-500 text-white'
                            : 'hover:bg-gray-200'
                        }`}
                      >
                        {whiteMove?.san || 'Invalid'}
                      </button>
                      
                      {/* Black move (if exists) */}
                      {blackMove ? (
                        <button
                          onClick={() => {
                            try {
                              setCurrentMoveIndex(blackIndex);
                              setIsAutoPlaying(false);
                            } catch (error) {
                              console.error('Error setting move index:', error);
                            }
                          }}
                          className={`px-2 py-0.5 rounded text-sm transition-colors min-w-[60px] ${
                            currentMoveIndex === blackIndex
                              ? 'bg-blue-500 text-white'
                              : 'hover:bg-gray-200'
                          }`}
                        >
                          {blackMove.san || 'Invalid'}
                        </button>
                      ) : (
                        <div className="min-w-[60px]"></div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Analysis Results */}
          {(analysis || analysisError) && (
            <div className="mt-4">
              <h4 className="text-md font-semibold mb-2">Position Analysis</h4>
              
              {analysisError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-2">
                  <div className="text-sm">{analysisError}</div>
                </div>
              )}
              
              {analysis && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Engine:</span>
                      <span className="text-sm">{analysis.engine}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Analysis Time:</span>
                      <span className="text-sm">{analysis.analysisTime}ms</span>
                    </div>
                    
                    {analysis.bestMove && (
                      <div className="border-t pt-2">
                        <div className="text-sm font-medium mb-1">Best Move:</div>
                        <div className="text-lg font-bold text-purple-700">
                          {analysis.bestMove.uci}
                        </div>
                        <div className="text-xs text-gray-600">
                          {analysis.bestMove.from} → {analysis.bestMove.to}
                        </div>
                      </div>
                    )}
                    
                    {analysis.recommendation && (
                      <div className="text-sm text-purple-700 font-medium">
                        {analysis.recommendation}
                      </div>
                    )}
                    
                    {analysis.message && (
                      <div className="text-xs text-gray-600 italic">
                        {analysis.message}
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-500 border-t pt-2">
                      Analyzed: {new Date(analysis.analysisDate).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PGN Export */}
          <div className="mt-4 space-y-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(game.pgn);
                // Could show a toast notification here
              }}
              className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Copy PGN
            </button>
            <button
              onClick={() => {
                console.log('=== DEBUG PGN ===');
                console.log('Raw PGN:', game.pgn);
                console.log('PGN type:', typeof game.pgn);
                console.log('PGN length:', game.pgn.length);
                console.log('Move count:', game.moveCount);
                console.log('Final FEN:', game.finalFen);
                console.log('First 100 chars:', game.pgn.substring(0, 100));
                console.log('Last 100 chars:', game.pgn.substring(game.pgn.length - 100));
                console.log('PGN as JSON:', JSON.stringify(game.pgn));
                console.log('Current gameHistory length:', gameHistory.length);
                console.log('Discrepancy:', game.moveCount, 'expected vs', gameHistory.length, 'actual');
                
                // Try to manually parse and see where it stops
                const testGame = new Chess();
                console.log('=== MANUAL PARSING TEST ===');
                try {
                  const result = testGame.loadPgn(game.pgn);
                  console.log('Manual loadPgn result:', result);
                  const moves = testGame.history({ verbose: true });
                  console.log('Manual parsing got', moves.length, 'moves');
                  console.log('All moves:', moves.map(m => m.san).join(' '));
                } catch (e) {
                  console.log('Manual parsing failed:', e);
                }
                
                alert('PGN debug info logged to console. Check developer tools.');
              }}
              className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors text-sm"
            >
              Debug PGN (Console)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameReplay;