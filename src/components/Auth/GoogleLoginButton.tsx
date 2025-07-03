import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { firebaseConfigInfo } from '../../config/firebase-client';

interface GoogleLoginButtonProps {
  onSuccess: () => void;
}

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({ onSuccess }) => {
  const { signInWithGoogle, createGuestAccount, loading } = useAuth();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showGuestFallback, setShowGuestFallback] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      await signInWithGoogle();
      onSuccess();
    } catch (error: any) {
      console.error('Google sign-in failed:', error);
      // Show guest fallback if Google auth fails in development mode
      if (firebaseConfigInfo.isDevelopmentConfig) {
        setShowGuestFallback(true);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGuestAccount = async () => {
    try {
      setIsGoogleLoading(true);
      await createGuestAccount();
      onSuccess();
    } catch (error) {
      console.error('Guest account creation failed:', error);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  if (showGuestFallback) {
    return (
      <div className="space-y-3">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            Google authentication is unavailable in development mode. Continue as guest to play chess!
          </p>
        </div>
        <button
          onClick={handleGuestAccount}
          disabled={loading || isGoogleLoading}
          className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGoogleLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600 dark:border-gray-300"></div>
          ) : (
            <>
              🎮 Continue as Guest
            </>
          )}
        </button>
        <button
          onClick={() => setShowGuestFallback(false)}
          className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline"
        >
          Try Google Sign-In Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {firebaseConfigInfo.isDevelopmentConfig && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
          <p className="text-xs text-blue-600 dark:text-blue-400">
            Development Mode: Using Firebase emulator. Authentication may have limited functionality.
          </p>
        </div>
      )}
      <button
        onClick={handleGoogleSignIn}
        disabled={loading || isGoogleLoading}
        className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGoogleLoading ? (
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600 dark:border-gray-300"></div>
        ) : (
          <>
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </>
        )}
      </button>
      {firebaseConfigInfo.isDevelopmentConfig && (
        <button
          onClick={handleGuestAccount}
          disabled={loading || isGoogleLoading}
          className="w-full flex items-center justify-center px-4 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-600 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGoogleLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600 dark:border-gray-300"></div>
          ) : (
            <>
              🎮 Play as Guest (Development)
            </>
          )}
        </button>
      )}
    </div>
  );
};