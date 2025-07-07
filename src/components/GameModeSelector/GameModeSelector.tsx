import React, { useState } from 'react';
import { useGame } from '../../contexts/GameContext';
import { DifficultyLevel } from '../../utils/chessAI';
import { OnlineGameModal } from '../OnlineGameModal';
import { useSocket } from '../../contexts/SocketContext';

const GameModeSelector: React.FC = () => {
  const { gameState, setGameMode, setAIDifficulty } = useGame();
  const { gameMode, aiColor, aiDifficulty } = gameState;
  const { roomCode, leaveRoom } = useSocket();
  const [showOnlineModal, setShowOnlineModal] = useState(false);

  const handleModeChange = async (mode: 'human-vs-human' | 'human-vs-ai') => {
    // Leave online room if switching away from online play
    if (roomCode) {
      leaveRoom();
    }
    
    if (mode === 'human-vs-ai') {
      // Default to AI playing black
      await setGameMode(mode, 'b');
    } else {
      await setGameMode(mode);
    }
  };

  const handleAIColorChange = async (color: 'w' | 'b') => {
    await setGameMode('human-vs-ai', color);
  };

  const handleDifficultyChange = async (difficulty: DifficultyLevel) => {
    await setAIDifficulty(difficulty);
  };

  const difficultyLabels: Record<DifficultyLevel, { name: string; description: string }> = {
    beginner: { name: 'Beginner', description: 'Very easy, makes many mistakes' },
    easy: { name: 'Easy', description: 'Casual play, some mistakes' },
    medium: { name: 'Medium', description: 'Balanced challenge' },
    hard: { name: 'Hard', description: 'Strong play, few mistakes' },
    expert: { name: 'Expert', description: 'Very strong, minimal mistakes' },
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

        {/* AI Settings */}
        {gameMode === 'human-vs-ai' && (
          <div className="ml-6 pl-4 border-l-2 border-gray-200 space-y-4">
            {/* AI Color Selection */}
            <div>
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

            {/* Difficulty Selection */}
            <div>
              <div className="text-sm font-medium mb-2">Difficulty Level:</div>
              <div className="space-y-2">
                {Object.entries(difficultyLabels).map(([level, info]) => (
                  <label key={level} className="flex items-start cursor-pointer">
                    <input
                      type="radio"
                      name="difficulty"
                      value={level}
                      checked={aiDifficulty === level}
                      onChange={() => handleDifficultyChange(level as DifficultyLevel)}
                      className="mr-3 mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium">{info.name}</div>
                      <div className="text-xs text-gray-600">{info.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Online Multiplayer */}
        <div className="pt-3 mt-3 border-t border-gray-200">
          <button
            onClick={() => setShowOnlineModal(true)}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Play Online with Friends
          </button>
        </div>
      </div>

      {/* Current Mode Display */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-600">
          Current: <span className="font-semibold">
            {gameMode === 'human-vs-human' 
              ? 'Human vs Human (Local)' 
              : `Human vs AI (${difficultyLabels[aiDifficulty].name}, AI plays ${aiColor === 'w' ? 'White' : 'Black'})`
            }
          </span>
        </div>
      </div>

      {/* Online Game Modal */}
      <OnlineGameModal 
        isOpen={showOnlineModal} 
        onClose={() => setShowOnlineModal(false)} 
      />
    </div>
  );
};

export default GameModeSelector;