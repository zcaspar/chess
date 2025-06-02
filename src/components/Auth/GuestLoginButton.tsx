import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

interface GuestLoginButtonProps {
  onSuccess: () => void;
}

export const GuestLoginButton: React.FC<GuestLoginButtonProps> = ({ onSuccess }) => {
  const { createGuestAccount, loading } = useAuth();
  const [isGuestLoading, setIsGuestLoading] = useState(false);

  const handleGuestLogin = async () => {
    try {
      setIsGuestLoading(true);
      await createGuestAccount();
      onSuccess();
    } catch (error) {
      // Error is handled by AuthContext
    } finally {
      setIsGuestLoading(false);
    }
  };

  return (
    <button
      onClick={handleGuestLogin}
      disabled={loading || isGuestLoading}
      className="w-full flex items-center justify-center px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors duration-200 disabled:cursor-not-allowed"
    >
      {isGuestLoading ? (
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          Creating Guest Account...
        </div>
      ) : (
        <>
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Play as Guest
        </>
      )}
    </button>
  );
};