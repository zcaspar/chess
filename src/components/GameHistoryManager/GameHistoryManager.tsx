import React, { useState } from 'react';
import GameHistory from '../GameHistory/GameHistory';
import GameReplay from '../GameReplay/GameReplay';

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

type ViewMode = 'history' | 'replay';

interface GameHistoryManagerProps {
  onClose?: () => void;
}

const GameHistoryManager: React.FC<GameHistoryManagerProps> = ({ onClose }) => {
  const [currentView, setCurrentView] = useState<ViewMode>('history');
  const [selectedGame, setSelectedGame] = useState<GameHistoryEntry | null>(null);

  const handleReplayGame = (game: GameHistoryEntry) => {
    setSelectedGame(game);
    setCurrentView('replay');
  };

  const handleBackToHistory = () => {
    setCurrentView('history');
    setSelectedGame(null);
  };

  // Removed unused handleClose function

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Navigation Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {currentView === 'replay' && (
                <button
                  onClick={handleBackToHistory}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                >
                  ← Back to History
                </button>
              )}
              <h1 className="text-3xl font-bold text-gray-900">
                {currentView === 'history' ? 'Game History' : 'Game Replay'}
              </h1>
            </div>
            
            {onClose && currentView === 'history' && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Close
              </button>
            )}
          </div>
          
          {currentView === 'replay' && selectedGame && (
            <div className="mt-2 text-gray-600">
              <span className="text-sm">
                Game vs {selectedGame.opponentName} • {' '}
                {new Date(selectedGame.createdAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {currentView === 'history' && (
            <div className="p-6">
              <GameHistory onReplayGame={handleReplayGame} />
            </div>
          )}
          
          {currentView === 'replay' && selectedGame && (
            <div className="p-6">
              <GameReplay 
                game={selectedGame} 
                onClose={handleBackToHistory} 
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameHistoryManager;