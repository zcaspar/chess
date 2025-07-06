import React from 'react';
import { useSocket } from '../../contexts/SocketContext';

export const OnlineGameStatus: React.FC = () => {
  const { isConnected, roomCode, assignedColor, players } = useSocket();

  if (!isConnected || !roomCode) {
    return null;
  }

  const colorName = assignedColor === 'white' ? 'White' : 
                    assignedColor === 'black' ? 'Black' : 
                    'Spectator';

  const copyRoomCode = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(roomCode);
      alert(`Room code ${roomCode} copied to clipboard!`);
    }
  };

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg shadow-lg mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold">Online Game</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm bg-green-600 px-2 py-1 rounded">
            Connected
          </span>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span>Room Code:</span>
          <div className="flex items-center gap-2">
            <code className="bg-gray-700 px-3 py-1 rounded font-mono text-lg">
              {roomCode}
            </code>
            <button
              onClick={copyRoomCode}
              className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
              title="Copy room code"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span>Your Color:</span>
          <span className={`font-bold ${assignedColor === 'white' ? 'text-gray-200' : 'text-gray-900 bg-gray-200 px-2 rounded'}`}>
            {colorName}
          </span>
        </div>

        <div className="border-t border-gray-700 pt-2 mt-2">
          <div className="text-sm">
            <div className="flex justify-between">
              <span>White:</span>
              <span>{players.white?.username || 'Waiting...'}</span>
            </div>
            <div className="flex justify-between">
              <span>Black:</span>
              <span>{players.black?.username || 'Waiting...'}</span>
            </div>
          </div>
        </div>

        {(!players.white || !players.black) && (
          <div className="text-yellow-400 text-sm mt-2">
            Waiting for opponent to join...
          </div>
        )}
      </div>
    </div>
  );
};