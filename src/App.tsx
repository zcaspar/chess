import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { SocketProvider } from './contexts/SocketContext';
import { Header } from './components/Header';
import { GameApp } from './components/GameApp';
import './App.css';

function App() {
  // Deployment trigger - Dec 20 2024
  return (
    <AuthProvider>
      <SocketProvider>
        <GameProvider>
          <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
            <Header />
            <main className="pb-8">
              <GameApp />
            </main>
          </div>
        </GameProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;