import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../contexts/GameContext';
import { isFeatureEnabled } from '../../config/gameFeatures';

const GameEndModal: React.FC = () => {
  const { gameState, resetGame, getPlayerByColor } = useGame();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevGameId = useRef(gameState.gameId);

  // Reset dismissed state on new game
  useEffect(() => {
    if (gameState.gameId !== prevGameId.current) {
      prevGameId.current = gameState.gameId;
      setDismissed(false);
      setVisible(false);
    }
  }, [gameState.gameId]);

  // Show modal 500ms after game ends (dramatic pause)
  useEffect(() => {
    if (gameState.gameResult && !dismissed) {
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [gameState.gameResult, dismissed]);

  if (!isFeatureEnabled('GAME_END_MODAL') || !visible || dismissed || !gameState.gameResult) {
    return null;
  }

  const result = gameState.gameResult;
  const isCheckmate = result.toLowerCase().includes('checkmate');
  const isDraw = result.toLowerCase().includes('draw') || result.toLowerCase().includes('stalemate');
  const isResign = result.toLowerCase().includes('resign');
  const isTimeout = result.toLowerCase().includes('time');

  // Determine icon
  let icon = '🏁';
  if (isCheckmate) icon = '👑';
  else if (isDraw) icon = '🤝';
  else if (isResign) icon = '🏳️';
  else if (isTimeout) icon = '⏱️';

  // Format result text with player names
  const displayResult = result
    .replace('White', getPlayerByColor('w'))
    .replace('Black', getPlayerByColor('b'));

  // Game stats
  const totalMoves = Math.ceil(gameState.history.length / 2);
  const totalCaptures = gameState.history.filter(m => m.captured).length;

  const handleNewGame = () => {
    setDismissed(true);
    resetGame();
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleDismiss}
      style={{ animation: 'gameEndFadeIn 0.3s ease-out' }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'gameEndScaleIn 0.3s ease-out' }}
      >
        {/* Icon */}
        <div className="text-5xl mb-3">{icon}</div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          {isCheckmate ? 'Checkmate!' : isDraw ? 'Draw' : isResign ? 'Resigned' : isTimeout ? 'Time Out' : 'Game Over'}
        </h2>

        {/* Result */}
        <p className="text-gray-600 dark:text-gray-300 mb-4">{displayResult}</p>

        {/* Stats */}
        <div className="flex justify-center gap-6 mb-6 text-sm text-gray-500 dark:text-gray-400">
          <div>
            <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">{totalMoves}</div>
            <div>Moves</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">{totalCaptures}</div>
            <div>Captures</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">{gameState.history.length}</div>
            <div>Half-moves</div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
          >
            Review
          </button>
          <button
            onClick={handleNewGame}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors font-medium"
          >
            New Game
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameEndModal;
