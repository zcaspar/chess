import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useGame } from '../../contexts/GameContext';
import { AuthModal, UserProfile } from '../Auth';
import { isFeatureEnabled } from '../../config/gameFeatures';

interface HeaderProps {
  onShowHistory?: () => void;
  onShowStats?: () => void;
  onShowPuzzles?: () => void;
  currentView?: 'game' | 'history' | 'stats' | 'puzzles';
}

export const Header: React.FC<HeaderProps> = ({ onShowHistory, onShowStats, onShowPuzzles, currentView = 'game' }) => {
  const { profile, isAuthenticated, isGuest, signOut } = useAuth();
  const { clearAllGameData } = useGame();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const handleSignOut = async () => {
    try {
      // Clear all game data first (stats, history, etc.)
      clearAllGameData();
      // Then sign out the user
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <>
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Title */}
            <div className="flex items-center">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                ♛ Chess
              </h1>
              
              {/* Desktop Navigation - Hidden on mobile */}
              {(isAuthenticated || isGuest) && (onShowHistory || onShowStats) && (
                <nav className="hidden md:flex space-x-4 ml-6">
                  {onShowHistory && (
                    <button
                      onClick={() => currentView === 'history' ? undefined : onShowHistory()}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        currentView === 'history'
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      History
                    </button>
                  )}
                  {onShowStats && (isAuthenticated || isGuest) && (
                    <button
                      onClick={() => currentView === 'stats' ? undefined : onShowStats()}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        currentView === 'stats'
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      Analytics
                    </button>
                  )}
                  {onShowPuzzles && isFeatureEnabled('PUZZLE_TRAINING') && (
                    <button
                      onClick={() => currentView === 'puzzles' ? undefined : onShowPuzzles()}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        currentView === 'puzzles'
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      Puzzles
                    </button>
                  )}
                </nav>
              )}
            </div>

            {/* User Authentication Controls */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              {isAuthenticated || isGuest ? (
                <>
                  {/* Mobile: Compact user info */}
                  <div className="md:hidden flex items-center space-x-2">
                    {isGuest && (
                      <div className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-full">
                        Guest
                      </div>
                    )}
                    <button
                      onClick={() => setShowProfile(true)}
                      className="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center font-medium transition-colors"
                    >
                      {(profile?.username || 'U').charAt(0).toUpperCase()}
                    </button>
                    {/* Mobile Menu Button */}
                    <button
                      onClick={() => setShowMobileMenu(!showMobileMenu)}
                      className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                      aria-label="Menu"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>

                  {/* Desktop: Full user info */}
                  <div className="hidden md:flex items-center space-x-3">
                    {isGuest && (
                      <div className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-full">
                        Guest
                      </div>
                    )}
                    <div className="text-sm">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {profile?.displayName || profile?.username || 'User'}
                      </div>
                      {profile && (
                        <div className="text-gray-500 dark:text-gray-400">
                          Rating: {profile.stats.rating}
                        </div>
                      )}
                    </div>
                    
                    <button
                      onClick={() => setShowProfile(true)}
                      className="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center font-medium transition-colors"
                    >
                      {(profile?.username || 'U').charAt(0).toUpperCase()}
                    </button>
                    
                    <button
                      onClick={handleSignOut}
                      className="text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 px-3 py-2 text-sm font-medium transition-colors"
                      title="Sign Out"
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Mobile: Compact auth buttons */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="hidden sm:block text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 text-sm font-medium transition-colors"
                    >
                      Quick Play
                    </button>
                    
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Sign In
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {showMobileMenu && (isAuthenticated || isGuest) && (
            <div className="md:hidden border-t border-gray-200 dark:border-gray-700 py-2">
              <div className="flex flex-col space-y-1">
                {/* User Info */}
                <div className="px-2 py-2 text-sm border-b border-gray-100 dark:border-gray-600">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {profile?.displayName || profile?.username || 'User'}
                  </div>
                  {profile && (
                    <div className="text-gray-500 dark:text-gray-400">
                      Rating: {profile.stats.rating}
                    </div>
                  )}
                </div>
                
                {/* Navigation */}
                {onShowHistory && (
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      if (currentView !== 'history') onShowHistory();
                    }}
                    className={`text-left px-2 py-2 text-sm transition-colors ${
                      currentView === 'history'
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    📜 Game History
                  </button>
                )}
                {onShowStats && (
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      if (currentView !== 'stats') onShowStats();
                    }}
                    className={`text-left px-2 py-2 text-sm transition-colors ${
                      currentView === 'stats'
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    📊 Analytics
                  </button>
                )}
                {onShowPuzzles && isFeatureEnabled('PUZZLE_TRAINING') && (
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      if (currentView !== 'puzzles') onShowPuzzles();
                    }}
                    className={`text-left px-2 py-2 text-sm transition-colors ${
                      currentView === 'puzzles'
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    🧩 Puzzles
                  </button>
                )}

                {/* Sign Out */}
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    handleSignOut();
                  }}
                  className="text-left px-2 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-gray-100 dark:border-gray-600"
                >
                  🚪 Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* User Profile Modal */}
      <UserProfile
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
      />
    </>
  );
};