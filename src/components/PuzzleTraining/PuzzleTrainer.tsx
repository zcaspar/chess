import React, { useEffect } from 'react';
import { PuzzleProvider, usePuzzle } from '../../contexts/PuzzleContext';
import PuzzleBoard from './PuzzleBoard';
import PuzzleControls from './PuzzleControls';
import PuzzleInfo from './PuzzleInfo';

interface PuzzleTrainerProps {
  onClose: () => void;
}

const PuzzleTrainerInner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { isLoaded, loadNextPuzzle, state } = usePuzzle();

  // Auto-load first puzzle when puzzles are ready
  useEffect(() => {
    if (isLoaded && state.phase === 'loading' && !state.puzzle) {
      loadNextPuzzle();
    }
  }, [isLoaded, state.phase, state.puzzle, loadNextPuzzle]);

  return (
    <div className="max-w-[1000px] mx-auto px-2 sm:px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onClose}
          className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm"
        >
          ← Back to Game
        </button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Puzzle Training</h2>
        <div className="w-24" /> {/* Spacer for centering */}
      </div>

      {!isLoaded ? (
        <div className="text-center py-20">
          <div className="text-gray-500 dark:text-gray-400">Loading puzzles...</div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
          {/* Board */}
          <div className="lg:flex-1 flex justify-center">
            <div>
              <PuzzleBoard />
            </div>
          </div>

          {/* Side panel */}
          <div className="lg:w-[260px] space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4">
              <PuzzleInfo />
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4">
              <PuzzleControls />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PuzzleTrainer: React.FC<PuzzleTrainerProps> = ({ onClose }) => {
  return (
    <PuzzleProvider>
      <PuzzleTrainerInner onClose={onClose} />
    </PuzzleProvider>
  );
};

export default PuzzleTrainer;
