import React from 'react';
import { useGame } from '../../contexts/GameContext';

const GameModeSelector: React.FC = () => {
  const { gameState, setGameMode } = useGame();
  const { gameMode, aiColor } = gameState;

  const handleModeChange = (mode: 'human-vs-human' | 'human-vs-ai') => {
    if (mode === 'human-vs-ai') {
      // Default to AI playing black
      setGameMode(mode, 'b');
    } else {
      setGameMode(mode);
    }
  };

  const handleAIColorChange = (color: 'w' | 'b') => {
    setGameMode('human-vs-ai', color);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="font-bold text-lg mb-3">Game Mode</h3>
      
      <div className="space-y-3">
        {/* Human vs Human */}
        <label className="flex items-center cursor-pointer">
          <input
            type="radio"
            name="gameMode"
            value="human-vs-human"
            checked={gameMode === 'human-vs-human'}
            onChange={() => handleModeChange('human-vs-human')}
            className="mr-3"
          />
          <div>
            <div className="font-semibold">Human vs Human</div>
            <div className="text-sm text-gray-600">Play against another person</div>
          </div>
        </label>

        {/* Human vs AI */}
        <label className="flex items-center cursor-pointer">
          <input
            type="radio"
            name="gameMode"
            value="human-vs-ai"
            checked={gameMode === 'human-vs-ai'}
            onChange={() => handleModeChange('human-vs-ai')}
            className="mr-3"
          />
          <div>
            <div className="font-semibold">Human vs Computer</div>
            <div className="text-sm text-gray-600">Play against AI opponent</div>
          </div>
        </label>

        {/* AI Color Selection */}
        {gameMode === 'human-vs-ai' && (
          <div className="ml-6 pl-4 border-l-2 border-gray-200">
            <div className="text-sm font-medium mb-2">Computer plays:</div>
            <div className="flex gap-3">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="aiColor"
                  value="w"
                  checked={aiColor === 'w'}
                  onChange={() => handleAIColorChange('w')}
                  className="mr-2"
                />
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-gray-100 border border-gray-400 rounded-sm"></div>
                  <span className="text-sm">White</span>
                </div>
              </label>
              
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="aiColor"
                  value="b"
                  checked={aiColor === 'b'}
                  onChange={() => handleAIColorChange('b')}
                  className="mr-2"
                />
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-gray-800 rounded-sm"></div>
                  <span className="text-sm">Black</span>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Current Mode Display */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-600">
          Current: <span className="font-semibold">
            {gameMode === 'human-vs-human' 
              ? 'Human vs Human' 
              : `Human vs AI (AI plays ${aiColor === 'w' ? 'White' : 'Black'})`
            }
          </span>
        </div>
      </div>
    </div>
  );
};

export default GameModeSelector;