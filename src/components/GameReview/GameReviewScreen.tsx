import React, { useMemo } from 'react';
import { useGame } from '../../contexts/GameContext';
import GameReplay from '../GameReplay/GameReplay';
import { buildReviewEntry } from '../../utils/gameReview';

interface GameReviewScreenProps {
  /** Return to the board. */
  onClose: () => void;
}

/**
 * Review of the game that just finished.
 *
 * Reuses the replay screen from game history, but builds its entry from live
 * game state rather than fetching it back, so this works for a guest, for a
 * local game that is never saved, and the instant the game ends.
 */
const GameReviewScreen: React.FC<GameReviewScreenProps> = ({ onClose }) => {
  const { gameState } = useGame();

  const entry = useMemo(() => buildReviewEntry(gameState), [gameState]);

  const hasSomethingToReview = gameState.history.length > 0;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            ← Back to Game
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Game Review</h1>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden p-6">
          {hasSomethingToReview ? (
            <GameReplay game={entry} onClose={onClose} />
          ) : (
            <div className="text-center py-12 text-gray-600">
              <p className="text-lg font-medium">Nothing to review yet</p>
              <p className="mt-2 text-sm">
                This game ended before a move was played.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameReviewScreen;
