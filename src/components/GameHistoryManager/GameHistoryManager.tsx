import React, { useState } from 'react';
import GameHistory from '../GameHistory/GameHistory';
import GameReplay from '../GameReplay/GameReplay';
import HeadToHeadList from '../HeadToHeadList/HeadToHeadList';

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

type ViewMode = 'history' | 'replay' | 'head-to-head';

interface GameHistoryManagerProps {
  onClose?: () => void;
}

const GameHistoryManager: React.FC<GameHistoryManagerProps> = ({ onClose }) => {
  const [currentView, setCurrentView] = useState<ViewMode>('history');
  const [activeTab, setActiveTab] = useState<'history' | 'head-to-head'>('history');
  const [selectedGame, setSelectedGame] = useState<GameHistoryEntry | null>(null);

  const handleReplayGame = (game: GameHistoryEntry) => {
    setSelectedGame(game);
    setCurrentView('replay');
  };

  const handleBackToHistory = () => {
    setCurrentView(activeTab);
    setSelectedGame(null);
  };
  
  const handleTabChange = (tab: 'history' | 'head-to-head') => {
    setActiveTab(tab);
    setCurrentView(tab);
  };

  // Removed unused handleClose function

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Navigation Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {(currentView === 'replay' || currentView === 'head-to-head') && (
                <button
                  onClick={handleBackToHistory}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                >
                  ← Back to History
                </button>
              )}
              <h1 className="text-3xl font-bold text-gray-900">
                {currentView === 'history' ? 'Game History' : 
                 currentView === 'head-to-head' ? 'Head-to-Head Records' : 'Game Replay'}
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

        {/* Tab Navigation */}
        {(currentView === 'history' || currentView === 'head-to-head') && (
          <div className="mb-6">
            <div className="flex gap-1 bg-gray-200 rounded-lg p-1">
              <button
                onClick={() => handleTabChange('history')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  activeTab === 'history'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Game History
              </button>
              <button
                onClick={() => handleTabChange('head-to-head')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  activeTab === 'head-to-head'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Head-to-Head Records
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {currentView === 'history' && (
            <div className="p-6">
              <GameHistory onReplayGame={handleReplayGame} />
            </div>
          )}
          
          {currentView === 'head-to-head' && (
            <div className="p-6">
              <HeadToHeadList />
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