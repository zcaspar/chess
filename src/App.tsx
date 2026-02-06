import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { SocketProvider } from './contexts/SocketContext';
import { Header } from './components/Header';
import { GameApp } from './components/GameApp';
import GameHistoryManager from './components/GameHistoryManager/GameHistoryManager';
import StatisticalDashboard from './components/StatisticalDashboard';
import PuzzleTrainer from './components/PuzzleTraining/PuzzleTrainer';
import { isFeatureEnabled } from './config/gameFeatures';
import './App.css';

type AppView = 'game' | 'history' | 'stats' | 'puzzles';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('game');

  const showGameHistory = () => setCurrentView('history');
  const showGame = () => setCurrentView('game');
  const showStats = () => setCurrentView('stats');
  const showPuzzles = () => setCurrentView('puzzles');

  return (
    <AuthProvider>
      <SocketProvider>
        <GameProvider>
          <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
            <Header onShowHistory={showGameHistory} onShowStats={showStats} onShowPuzzles={showPuzzles} currentView={currentView} />
            <main className="pb-8">
              {currentView === 'game' && <GameApp />}
              {currentView === 'history' && <GameHistoryManager onClose={showGame} />}
              {currentView === 'stats' && (
                <div className="container mx-auto px-4 py-8">
                  <button
                    onClick={showGame}
                    className="mb-4 flex items-center text-blue-600 hover:text-blue-800 font-medium"
                  >
                    ← Back to Game
                  </button>
                  <StatisticalDashboard />
                </div>
              )}
              {currentView === 'puzzles' && isFeatureEnabled('PUZZLE_TRAINING') && (
                <PuzzleTrainer onClose={showGame} />
              )}
            </main>
          </div>
        </GameProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;