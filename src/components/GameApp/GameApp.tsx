import React from 'react';
import ChessBoard from '../ChessBoard';
import GameControls from '../GameControls';
import MoveHistory from '../MoveHistory';
import GameStatus from '../GameStatus';
import ChessClock from '../ChessClock';
import GameModeSelector from '../GameModeSelector';
import { OnlineGameStatus } from '../OnlineGameStatus';

export const GameApp: React.FC = () => {
  return (
    <div className="max-w-[1400px] mx-auto px-4">
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_280px] lg:grid-cols-[240px_1fr_240px] gap-4 lg:gap-8">
        {/* Left Sidebar - with glass effect */}
        <div className="order-2 lg:order-1 space-y-4">
          <div className="sidebar-glass">
            <GameModeSelector />
          </div>
          <div className="sidebar-glass">
            <OnlineGameStatus />
          </div>
          <div className="sidebar-glass">
            <GameStatus />
          </div>
          <div className="sidebar-glass">
            <GameControls />
          </div>
        </div>
        
        {/* Center - Chess Board Hero */}
        <div className="order-1 lg:order-2 flex justify-center items-start pt-8 pb-8">
          <div className="w-full max-w-[700px]">
            <ChessBoard />
          </div>
        </div>
        
        {/* Right Sidebar - with glass effect */}
        <div className="order-3 space-y-4">
          <div className="sidebar-glass">
            <MoveHistory />
          </div>
          <div className="sidebar-glass">
            <ChessClock />
          </div>
        </div>
      </div>
    </div>
  );
};