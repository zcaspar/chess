import React from 'react';
import { GameProvider } from './contexts/GameContext';
import ChessBoard from './components/ChessBoard';
import GameControls from './components/GameControls';
import MoveHistory from './components/MoveHistory';
import GameStatus from './components/GameStatus';
import ChessClock from './components/ChessClock';
import PlayerInfo from './components/PlayerInfo';
import GameModeSelector from './components/GameModeSelector';
import './App.css';

function App() {
  return (
    <GameProvider>
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">Chess Game</h1>
          
          <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr_300px] lg:grid-cols-[250px_1fr_250px] gap-4 lg:gap-6">
            {/* Left Sidebar */}
            <div className="order-2 lg:order-1 space-y-4">
              <PlayerInfo />
              <GameModeSelector />
              <GameStatus />
              <GameControls />
            </div>
            
            {/* Center - Chess Board */}
            <div className="order-1 lg:order-2 flex justify-center items-start">
              <div className="w-full max-w-[500px]">
                <ChessBoard />
              </div>
            </div>
            
            {/* Right Sidebar */}
            <div className="order-3 space-y-4">
              <MoveHistory />
              <ChessClock />
            </div>
          </div>
        </div>
      </div>
    </GameProvider>
  );
}

export default App;