import React from 'react';
import GameModeSelector from '../GameModeSelector';
import { OnlineGameStatus } from '../OnlineGameStatus';
import ChessClock from '../ChessClock';

interface MobileMenuProps {
  onClose: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 lg:hidden">
      <div className="fixed inset-x-0 bottom-0 bg-white dark:bg-gray-800 rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Game Menu</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Close menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h3 className="font-medium mb-3">Game Mode</h3>
            <GameModeSelector />
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h3 className="font-medium mb-3">Online Status</h3>
            <OnlineGameStatus />
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h3 className="font-medium mb-3">Chess Clock</h3>
            <ChessClock />
          </div>
        </div>
      </div>
    </div>
  );
};