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
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
        {/* Left Sidebar - with glass effect */}
        <div className="lg:w-[280px] lg:flex-shrink-0 order-2 lg:order-1 space-y-4">
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
        
        {/* Center - Chess Board Hero - Fixed position */}
        <div className="lg:flex-1 order-1 lg:order-2 flex justify-center pt-8 pb-8">
          <div className="w-full max-w-[700px]">
            <div className="sticky top-8">
              <ChessBoard />
            </div>
          </div>
        </div>
        
        {/* Right Sidebar - with glass effect */}
        <div className="lg:w-[280px] lg:flex-shrink-0 order-3 space-y-4">
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