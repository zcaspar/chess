import React from 'react';
import { useGame } from '../../contexts/GameContext';
import HeadToHead from '../HeadToHead/HeadToHead';
import { useAuth } from '../../hooks/useAuth';

const GameStatus: React.FC = () => {
  const { gameState, getPlayerByColor } = useGame();
  const { user } = useAuth();
  const { game, gameResult } = gameState;
  
  const turn = game.turn();
  const isCheck = game.isCheck();
  const currentPlayer = getPlayerByColor(turn);
  
  // Get opponent info for head-to-head display
  const isOnlineGame = gameState.gameMode === 'human-vs-human' && gameState.onlineGameRoom;
  const opponentId = isOnlineGame ? gameState.onlineGameRoom?.opponentId || null : null;
  const opponentName = isOnlineGame && gameState.onlineGameRoom?.opponentName 
    ? gameState.onlineGameRoom.opponentName 
    : null;

  // Replace player names in game result
  const displayResult = gameResult
    .replace('White', getPlayerByColor('w'))
    .replace('Black', getPlayerByColor('b'));

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="font-bold text-lg mb-2">Game Status</h3>
      
      {gameResult ? (
        <div className="text-center">
          <p className="text-lg font-semibold text-green-600 mb-2">
            Game Over
          </p>
          <p className="text-md">{displayResult}</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600">Current Turn:</span>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 ${turn === 'w' ? 'bg-gray-100 border border-gray-400' : 'bg-gray-800'} rounded-sm`}></div>
              <span className={`font-bold text-lg ${turn === 'w' ? 'text-gray-800' : 'text-gray-900'}`}>
                {currentPlayer}
              </span>
            </div>
          </div>
          
          {isCheck && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-center">
              <span className="font-bold">Check!</span>
            </div>
          )}
          
          {gameState.drawOffer.offered && (
            <div className="mt-2 bg-yellow-100 border border-yellow-400 text-yellow-700 px-3 py-2 rounded text-center text-sm">
              Draw offered by {getPlayerByColor(gameState.drawOffer.by!)}
            </div>
          )}
        </div>
      )}
      
      {/* Head-to-Head Stats */}
      {user && opponentId && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <HeadToHead 
            opponentId={opponentId} 
            opponentName={opponentName || undefined}
            compact={true}
          />
        </div>
      )}
      
      {/* Game Statistics */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <h4 className="font-semibold text-sm mb-2">Current Game</h4>
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span>Total Moves:</span>
            <span>{Math.ceil(gameState.history.length / 2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Captures:</span>
            <span>{gameState.history.filter(m => m.captured).length}</span>
          </div>
          {gameState.timeControl && (
            <div className="flex justify-between">
              <span>Time Control:</span>
              <span>{gameState.timeControl.initial / 60}+{gameState.timeControl.increment}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameStatus;