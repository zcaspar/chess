import React from 'react';
import { usePuzzle } from '../../contexts/PuzzleContext';

const PuzzleControls: React.FC = () => {
  const { state, loadNextPuzzle, requestHint, showSolution, resetPuzzle } = usePuzzle();

  const isActive = state.phase === 'player-turn' || state.phase === 'incorrect';
  const isFinished = state.phase === 'complete' || state.phase === 'failed';

  return (
    <div className="flex flex-wrap gap-2">
      {isActive && (
        <>
          <button
            onClick={requestHint}
            className="flex-1 min-w-[80px] px-3 py-2 text-sm font-medium rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
          >
            Hint {state.hintsUsed > 0 && `(${state.hintsUsed})`}
          </button>
          <button
            onClick={showSolution}
            className="flex-1 min-w-[80px] px-3 py-2 text-sm font-medium rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            Show Solution
          </button>
        </>
      )}
      {isFinished && (
        <>
          <button
            onClick={resetPuzzle}
            className="flex-1 min-w-[80px] px-3 py-2 text-sm font-medium rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            Retry
          </button>
          <button
            onClick={loadNextPuzzle}
            className="flex-1 min-w-[80px] px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Next Puzzle
          </button>
        </>
      )}
      {state.phase === 'loading' && (
        <button
          onClick={loadNextPuzzle}
          className="w-full px-4 py-3 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Start Puzzle
        </button>
      )}
    </div>
  );
};

export default PuzzleControls;
