import React, { useState } from 'react';
import ChessBoard from '../ChessBoard';
import GameControls from '../GameControls';
import MoveHistory from '../MoveHistory';
import GameStatus from '../GameStatus';
import ChessClock from '../ChessClock';
import GameModeSelector from '../GameModeSelector';
import { OnlineGameStatus } from '../OnlineGameStatus';
import { MobileMenu } from '../MobileMenu';

export const GameApp: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'game' | 'moves' | null>(null);

  return (
    <div className="max-w-[1400px] mx-auto px-2 sm:px-4">
      <div className="flex flex-col lg:flex-row gap-2 sm:gap-4 lg:gap-8">
        {/* Left Sidebar - Hidden on mobile, visible on desktop */}
        <div className="hidden lg:block lg:w-[280px] lg:flex-shrink-0 space-y-4">
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
        <div className="lg:flex-1 flex justify-center pt-2 sm:pt-4 lg:pt-8 pb-2 sm:pb-4 lg:pb-8">
          <div className="w-full">
            {/* Mobile status bar */}
            <div className="lg:hidden mb-2">
              <GameStatus />
            </div>
            <div className="lg:sticky lg:top-8">
              <ChessBoard />
            </div>
            {/* Mobile controls */}
            <div className="lg:hidden mt-2">
              <GameControls />
            </div>
          </div>
        </div>
        
        {/* Right Sidebar - Hidden on mobile, visible on desktop */}
        <div className="hidden lg:block lg:w-[280px] lg:flex-shrink-0 space-y-4">
          <div className="sidebar-glass">
            <MoveHistory />
          </div>
          <div className="sidebar-glass">
            <ChessClock />
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40">
        <div className="flex justify-around items-center py-2">
          <button
            onClick={() => setActivePanel(activePanel === 'game' ? null : 'game')}
            className="flex flex-col items-center p-2 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-xs mt-1">Game</span>
          </button>
          <button
            onClick={() => setActivePanel(activePanel === 'moves' ? null : 'moves')}
            className="flex flex-col items-center p-2 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-xs mt-1">Moves</span>
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex flex-col items-center p-2 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="text-xs mt-1">Menu</span>
          </button>
        </div>
      </div>

      {/* Mobile Panels */}
      {activePanel === 'moves' && (
        <div className="lg:hidden fixed inset-x-0 bottom-16 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-30 max-h-[50vh] overflow-y-auto">
          <div className="p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Move History</h3>
              <button
                onClick={() => setActivePanel(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <MoveHistory />
          </div>
        </div>
      )}

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <MobileMenu onClose={() => setMobileMenuOpen(false)} />
      )}
    </div>
  );
};