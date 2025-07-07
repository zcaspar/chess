import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { SocketProvider } from './contexts/SocketContext';
import { Header } from './components/Header';
import { GameApp } from './components/GameApp';
import GameHistoryManager from './components/GameHistoryManager/GameHistoryManager';
import './App.css';

type AppView = 'game' | 'history';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('game');

  const showGameHistory = () => setCurrentView('history');
  const showGame = () => setCurrentView('game');

  return (
    <AuthProvider>
      <SocketProvider>
        <GameProvider>
          <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
            <Header onShowHistory={showGameHistory} currentView={currentView} />
            <main className="pb-8">
              {currentView === 'game' && <GameApp />}
              {currentView === 'history' && <GameHistoryManager onClose={showGame} />}
            </main>
          </div>
        </GameProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;