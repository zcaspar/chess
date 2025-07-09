import React, { useState, useEffect } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { useAuth } from '../../hooks/useAuth';

interface OnlineGameModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnlineGameModal: React.FC<OnlineGameModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [roomCode, setRoomCode] = useState('');
  const [timeControl, setTimeControl] = useState({ minutes: 10, increment: 5 });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  
  const { isConnected, createRoom, joinRoom, roomCode: currentRoomCode } = useSocket();
  const { user } = useAuth();

  // Auto-close modal when room is successfully joined
  useEffect(() => {
    if (currentRoomCode && isOpen) {
      onClose();
    }
  }, [currentRoomCode, isOpen, onClose]);

  // Listen for socket errors
  useEffect(() => {
    if (!isOpen) return;

    const handleSocketError = (event: CustomEvent) => {
      const errorData = event.detail;
      console.log('Socket error received in modal:', errorData);
      
      // Display error message
      if (errorData.message) {
        setError(errorData.message);
      }
    };

    window.addEventListener('socketError', handleSocketError as EventListener);
    
    return () => {
      window.removeEventListener('socketError', handleSocketError as EventListener);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateRoom = async () => {
    if (!isConnected) {
      setError('Not connected to server. Please try again.');
      return;
    }

    if (!user) {
      setError('You must be signed in to create a room.');
      return;
    }

    setIsCreating(true);
    setError('');
    
    console.log('Creating room with user:', user.email);
    
    const timeControlSeconds = {
      initial: timeControl.minutes * 60,
      increment: timeControl.increment,
    };
    
    createRoom(timeControlSeconds);
    
    // Close modal after a short delay to allow socket events to process
    setTimeout(() => {
      setIsCreating(false);
      // The room creation will trigger both roomCreated and roomJoined events
      // which will update the currentRoomCode in SocketContext
      onClose();
    }, 500); // Short delay to ensure socket events are processed
  };

  const handleJoinRoom = () => {
    if (!isConnected) {
      setError('Not connected to server. Please try again.');
      return;
    }

    if (roomCode.length !== 6) {
      setError('Room code must be 6 characters');
      return;
    }

    setError(''); // Clear any previous errors
    joinRoom(roomCode.toUpperCase());
    
    // The success/failure will be handled by socket events in SocketContext
    // 'roomJoined' event will trigger onClose via useEffect
    // 'error' event will display error message via SocketContext
  };

  if (!user) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h2 className="text-2xl font-bold mb-4">Sign In Required</h2>
          <p className="mb-4 text-gray-600">
            You need to sign in to play online multiplayer games.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Online Game</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Mode Selection */}
        <div className="flex mb-6">
          <button
            onClick={() => setMode('create')}
            className={`flex-1 py-2 px-4 rounded-l-lg ${
              mode === 'create'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Create Game
          </button>
          <button
            onClick={() => setMode('join')}
            className={`flex-1 py-2 px-4 rounded-r-lg ${
              mode === 'join'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Join Game
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {!isConnected && (
          <div className="mb-4 p-3 bg-yellow-100 text-yellow-700 rounded-lg">
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Connecting to server...</span>
            </div>
            <div className="text-xs mt-1">Backend: {process.env.REACT_APP_BACKEND_URL || 'http://localhost:3005'}</div>
          </div>
        )}

        {mode === 'create' ? (
          <div>
            <h3 className="font-semibold mb-3">Time Control</h3>
            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Minutes per side
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={timeControl.minutes}
                  onChange={(e) => setTimeControl({ ...timeControl, minutes: parseInt(e.target.value) || 10 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Increment (seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={timeControl.increment}
                  onChange={(e) => setTimeControl({ ...timeControl, increment: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={!isConnected || isCreating}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
            >
              {isCreating ? 'Creating Room...' : 'Create Room'}
            </button>

            {currentRoomCode && (
              <div className="mt-4 p-3 bg-green-100 rounded-lg">
                <p className="text-sm font-semibold text-green-800">Room Code:</p>
                <p className="text-2xl font-bold text-green-900">{currentRoomCode}</p>
                <p className="text-xs text-green-700 mt-1">Share this code with your friend</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <h3 className="font-semibold mb-3">Enter Room Code</h3>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="XXXXXX"
              maxLength={6}
              className="w-full px-4 py-3 text-2xl text-center font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6"
            />
            
            <button
              onClick={handleJoinRoom}
              disabled={!isConnected || roomCode.length !== 6}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
            >
              Join Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
};