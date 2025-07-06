import React from 'react';
import ChessBoard from '../ChessBoard';
import GameControls from '../GameControls';
import MoveHistory from '../MoveHistory';
import GameStatus from '../GameStatus';
import ChessClock from '../ChessClock';
import PlayerInfo from '../PlayerInfo';
import GameModeSelector from '../GameModeSelector';
import { OnlineGameStatus } from '../OnlineGameStatus';

export const GameApp: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4">
      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr_300px] lg:grid-cols-[250px_1fr_250px] gap-4 lg:gap-6">
        {/* Left Sidebar */}
        <div className="order-2 lg:order-1 space-y-4">
          <PlayerInfo />
          <GameModeSelector />
          <OnlineGameStatus />
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
  );
};