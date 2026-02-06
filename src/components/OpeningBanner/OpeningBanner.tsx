import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useGame } from '../../contexts/GameContext';
import { initOpenings, detectOpening } from '../../utils/openingDetector';
import { isFeatureEnabled } from '../../config/gameFeatures';

const OpeningBanner: React.FC = () => {
  const { gameState } = useGame();
  const [ready, setReady] = useState(false);
  const prevNameRef = useRef('');

  // Load openings data on mount
  useEffect(() => {
    if (isFeatureEnabled('OPENING_EXPLORER')) {
      initOpenings().then(() => setReady(true));
    }
  }, []);

  // Get SAN moves from history
  const sanMoves = useMemo(
    () => gameState.history.map((m) => m.san),
    [gameState.history]
  );

  const opening = useMemo(() => {
    if (!ready) return null;
    return detectOpening(sanMoves);
  }, [ready, sanMoves]);

  if (!isFeatureEnabled('OPENING_EXPLORER')) return null;

  // Fade out after move 30
  const moveCount = gameState.history.length;
  if (moveCount > 60) return null; // After move 30 for each side

  if (!opening) {
    if (moveCount === 0) {
      return (
        <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-1">
          Make a move to see the opening name
        </div>
      );
    }
    return null;
  }

  // Animate when the name changes
  const nameChanged = opening.name !== prevNameRef.current;
  prevNameRef.current = opening.name;

  return (
    <div
      className={`text-center py-1 ${nameChanged ? 'opening-banner-enter' : ''}`}
      style={{ opacity: moveCount > 40 ? 0.5 : 1, transition: 'opacity 0.5s' }}
    >
      <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm">
        <span className="font-mono text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded text-[10px] font-bold">
          {opening.eco}
        </span>
        <span className="text-gray-700 dark:text-gray-300 font-medium">
          {opening.name}
        </span>
      </span>
    </div>
  );
};

export default OpeningBanner;
