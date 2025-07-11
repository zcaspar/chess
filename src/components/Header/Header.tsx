import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useGame } from '../../contexts/GameContext';
import { AuthModal, UserProfile } from '../Auth';

interface HeaderProps {
  onShowHistory?: () => void;
  onShowStats?: () => void;
  currentView?: 'game' | 'history' | 'stats';
}

export const Header: React.FC<HeaderProps> = ({ onShowHistory, onShowStats, currentView = 'game' }) => {
  const { profile, isAuthenticated, isGuest, signOut } = useAuth();
  const { clearAllGameData } = useGame();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

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
            <div className="flex items-center space-x-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                ♛ Chess App
              </h1>
              
              {/* Navigation */}
              {(isAuthenticated || isGuest) && (onShowHistory || onShowStats) && (
                <nav className="flex space-x-4">
                  {onShowHistory && (
                    <button
                      onClick={() => currentView === 'history' ? undefined : onShowHistory()}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        currentView === 'history'
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      Game History
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
                      📊 Analytics
                    </button>
                  )}
                </nav>
              )}
            </div>

            {/* User Authentication Controls */}
            <div className="flex items-center space-x-4">
              {isAuthenticated || isGuest ? (
                <>
                  {/* User Info */}
                  <div className="flex items-center space-x-3">
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
                    
                    {/* Avatar */}
                    <button
                      onClick={() => setShowProfile(true)}
                      className="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center font-medium transition-colors"
                    >
                      {(profile?.username || 'U').charAt(0).toUpperCase()}
                    </button>
                    
                    {/* Logout Button */}
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
                  {/* Guest Quick Play */}
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 text-sm font-medium transition-colors"
                  >
                    Quick Play
                  </button>
                  
                  {/* Sign In Button */}
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Sign In
                  </button>
                </>
              )}
            </div>
          </div>
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