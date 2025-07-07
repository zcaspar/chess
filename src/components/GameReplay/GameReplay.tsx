import React, { useState, useEffect, useMemo } from 'react';
import { Chess, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';

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

interface GameReplayProps {
  game: GameHistoryEntry;
  onClose?: () => void;
}

const GameReplay: React.FC<GameReplayProps> = ({ game, onClose }) => {
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(1000); // milliseconds

  // Parse the PGN and get all moves
  const gameHistory = useMemo(() => {
    try {
      const chessGame = new Chess();
      
      // Load the PGN
      chessGame.loadPgn(game.pgn);
      
      // Get all the moves from the history
      const history = chessGame.history({ verbose: true });
      return history;
    } catch (error) {
      console.error('Error parsing PGN:', error);
      return [];
    }
  }, [game.pgn]);

  // Get current board position
  const currentGame = useMemo(() => {
    const chessGame = new Chess();
    
    // Apply moves up to current index
    for (let i = 0; i <= currentMoveIndex && i < gameHistory.length; i++) {
      const move = gameHistory[i];
      chessGame.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion
      });
    }
    
    return chessGame;
  }, [gameHistory, currentMoveIndex]);

  // Auto-play functionality
  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setCurrentMoveIndex(prevIndex => {
        if (prevIndex >= gameHistory.length - 1) {
          setIsAutoPlaying(false);
          return prevIndex;
        }
        return prevIndex + 1;
      });
    }, autoPlaySpeed);

    return () => clearInterval(interval);
  }, [isAutoPlaying, autoPlaySpeed, gameHistory.length]);

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
    if (currentMoveIndex < gameHistory.length - 1) {
      setCurrentMoveIndex(currentMoveIndex + 1);
    }
    setIsAutoPlaying(false);
  };

  const goToEnd = () => {
    setCurrentMoveIndex(gameHistory.length - 1);
    setIsAutoPlaying(false);
  };

  const toggleAutoPlay = () => {
    setIsAutoPlaying(!isAutoPlaying);
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

  const getMoveNumber = (index: number) => {
    return Math.floor(index / 2) + 1;
  };

  const isWhiteMove = (index: number) => {
    return index % 2 === 0;
  };

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chess Board */}
        <div className="lg:col-span-2">
          <div className="mb-4">
            <Chessboard
              position={currentGame.fen()}
              boardWidth={500}
              customBoardStyle={{
                borderRadius: '4px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
              areArrowsAllowed={false}
              arePiecesDraggable={false}
            />
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
              Move {currentMoveIndex + 1} of {gameHistory.length}
              {currentMoveIndex >= 0 && gameHistory[currentMoveIndex] && (
                <span className="ml-2">
                  ({isWhiteMove(currentMoveIndex) ? 'White' : 'Black'}: {gameHistory[currentMoveIndex].san})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Move History */}
        <div className="lg:col-span-1">
          <h3 className="text-lg font-semibold mb-4">Move History</h3>
          <div className="bg-gray-50 rounded-lg p-4 h-96 overflow-y-auto">
            {gameHistory.length === 0 ? (
              <p className="text-gray-500 text-center">No moves available</p>
            ) : (
              <div className="space-y-1">
                {gameHistory.map((move, index) => {
                  const moveNumber = getMoveNumber(index);
                  const isWhite = isWhiteMove(index);
                  const isCurrentMove = index === currentMoveIndex;
                  
                  return (
                    <div key={index} className="flex items-center">
                      {isWhite && (
                        <span className="text-gray-500 text-sm w-8">{moveNumber}.</span>
                      )}
                      <button
                        onClick={() => {
                          setCurrentMoveIndex(index);
                          setIsAutoPlaying(false);
                        }}
                        className={`px-2 py-1 rounded text-sm transition-colors ${
                          isCurrentMove
                            ? 'bg-blue-500 text-white'
                            : 'hover:bg-gray-200'
                        }`}
                      >
                        {move.san}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PGN Export */}
          <div className="mt-4">
            <button
              onClick={() => {
                navigator.clipboard.writeText(game.pgn);
                // Could show a toast notification here
              }}
              className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Copy PGN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameReplay;