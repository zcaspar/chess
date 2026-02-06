import React from 'react';
import { usePuzzle } from '../../contexts/PuzzleContext';

const PuzzleInfo: React.FC = () => {
  const { state } = usePuzzle();
  const { stats, puzzle, phase } = state;

  const phaseLabel: Record<string, { text: string; color: string }> = {
    'loading': { text: 'Ready', color: 'text-gray-500' },
    'opponent-move': { text: 'Watch...', color: 'text-blue-500' },
    'player-turn': { text: 'Your turn', color: 'text-green-600' },
    'correct': { text: 'Correct!', color: 'text-green-600' },
    'incorrect': { text: 'Try again', color: 'text-red-500' },
    'complete': { text: 'Solved!', color: 'text-green-600' },
    'failed': { text: 'Solution shown', color: 'text-gray-500' },
  };

  const currentPhase = phaseLabel[phase] || phaseLabel['loading'];

  return (
    <div className="space-y-3">
      {/* Phase status */}
      <div className="text-center">
        <span className={`text-lg font-bold ${currentPhase.color}`}>
          {currentPhase.text}
        </span>
      </div>

      {/* Puzzle rating & themes */}
      {puzzle && (
        <div className="text-center space-y-1">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Puzzle Rating: <span className="font-semibold text-gray-800 dark:text-gray-200">{puzzle.rating}</span>
          </div>
          {puzzle.themes && (
            <div className="flex flex-wrap justify-center gap-1">
              {puzzle.themes.split(/\s+/).filter(Boolean).slice(0, 4).map((theme) => (
                <span
                  key={theme}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium"
                >
                  {theme}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <div className="text-base font-bold text-gray-800 dark:text-gray-200">{stats.rating}</div>
          <div className="text-gray-500 dark:text-gray-400">Rating</div>
        </div>
        <div>
          <div className="text-base font-bold text-green-600">{stats.solved}</div>
          <div className="text-gray-500 dark:text-gray-400">Solved</div>
        </div>
        <div>
          <div className="text-base font-bold text-red-500">{stats.failed}</div>
          <div className="text-gray-500 dark:text-gray-400">Failed</div>
        </div>
        <div>
          <div className="text-base font-bold text-amber-500">{stats.streak}</div>
          <div className="text-gray-500 dark:text-gray-400">Streak</div>
        </div>
      </div>

      {stats.bestStreak > 0 && (
        <div className="text-center text-[10px] text-gray-400 dark:text-gray-500">
          Best streak: {stats.bestStreak}
        </div>
      )}
    </div>
  );
};

export default PuzzleInfo;
