import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { SocketProvider } from './contexts/SocketContext';
import { Header } from './components/Header';
import { GameApp } from './components/GameApp';
import GameHistoryManager from './components/GameHistoryManager/GameHistoryManager';
import StatisticalDashboard from './components/StatisticalDashboard';
import './App.css';

type AppView = 'game' | 'history' | 'stats';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('game');

  const showGameHistory = () => setCurrentView('history');
  const showGame = () => setCurrentView('game');
  const showStats = () => setCurrentView('stats');

  return (
    <AuthProvider>
      <SocketProvider>
        <GameProvider>
          <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
            <Header onShowHistory={showGameHistory} onShowStats={showStats} currentView={currentView} />
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
            </main>
          </div>
        </GameProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;