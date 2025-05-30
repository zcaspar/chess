import React, { useState } from 'react';
import { useGame } from '../../contexts/GameContext';

const PlayerInfo: React.FC = () => {
  const { gameState, setPlayerName, swapColors } = useGame();
  const { players, gameStats, colorAssignment, gameMode, aiColor } = gameState;
  const [editingPlayer1, setEditingPlayer1] = useState(false);
  const [editingPlayer2, setEditingPlayer2] = useState(false);
  const [player1Input, setPlayer1Input] = useState(players.player1);
  const [player2Input, setPlayer2Input] = useState(players.player2);

  const handlePlayer1Submit = () => {
    setPlayerName('player1', player1Input);
    setEditingPlayer1(false);
  };

  const handlePlayer2Submit = () => {
    setPlayerName('player2', player2Input);
    setEditingPlayer2(false);
  };

  const getTotalGames = (stats: typeof gameStats.player1) => {
    return stats.wins + stats.draws + stats.losses;
  };

  const getWinRate = (stats: typeof gameStats.player1) => {
    const total = getTotalGames(stats);
    if (total === 0) return '0';
    return ((stats.wins / total) * 100).toFixed(1);
  };

  const player1Color = colorAssignment.white === 'player1' ? 'w' : 'b';
  const player2Color = colorAssignment.white === 'player2' ? 'w' : 'b';
  
  // Check if players are AI
  const isPlayer1AI = gameMode === 'human-vs-ai' && aiColor === player1Color;
  const isPlayer2AI = gameMode === 'human-vs-ai' && aiColor === player2Color;

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg">Players & Statistics</h3>
        <button
          onClick={swapColors}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm flex items-center gap-1"
          title="Swap colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          Swap
        </button>
      </div>
      
      {/* Player 1 */}
      <div className="mb-4 pb-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 ${player1Color === 'w' ? 'bg-gray-100 border border-gray-400' : 'bg-gray-800'} rounded-sm`}></div>
            {editingPlayer1 && !isPlayer1AI ? (
              <input
                type="text"
                value={player1Input}
                onChange={(e) => setPlayer1Input(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handlePlayer1Submit()}
                onBlur={handlePlayer1Submit}
                className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            ) : isPlayer1AI ? (
              <span className="font-semibold text-blue-600">
                {players.player1}
              </span>
            ) : (
              <button
                onClick={() => {
                  setEditingPlayer1(true);
                  setPlayer1Input(players.player1);
                }}
                className="font-semibold hover:text-blue-600 transition-colors"
              >
                {players.player1}
              </button>
            )}
            <span className="text-xs text-gray-500">
              (playing {player1Color === 'w' ? 'White' : 'Black'}{isPlayer1AI ? ' - AI' : ''})
            </span>
          </div>
          {!editingPlayer1 && (
            <span className="text-sm text-gray-600">
              {getWinRate(gameStats.player1)}% win rate
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="font-semibold text-green-600">{gameStats.player1.wins}</div>
            <div className="text-gray-500">Wins</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-yellow-600">{gameStats.player1.draws}</div>
            <div className="text-gray-500">Draws</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-red-600">{gameStats.player1.losses}</div>
            <div className="text-gray-500">Losses</div>
          </div>
        </div>
      </div>

      {/* Player 2 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 ${player2Color === 'w' ? 'bg-gray-100 border border-gray-400' : 'bg-gray-800'} rounded-sm`}></div>
            {editingPlayer2 && !isPlayer2AI ? (
              <input
                type="text"
                value={player2Input}
                onChange={(e) => setPlayer2Input(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handlePlayer2Submit()}
                onBlur={handlePlayer2Submit}
                className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            ) : isPlayer2AI ? (
              <span className="font-semibold text-blue-600">
                {players.player2}
              </span>
            ) : (
              <button
                onClick={() => {
                  setEditingPlayer2(true);
                  setPlayer2Input(players.player2);
                }}
                className="font-semibold hover:text-blue-600 transition-colors"
              >
                {players.player2}
              </button>
            )}
            <span className="text-xs text-gray-500">
              (playing {player2Color === 'w' ? 'White' : 'Black'}{isPlayer2AI ? ' - AI' : ''})
            </span>
          </div>
          {!editingPlayer2 && (
            <span className="text-sm text-gray-600">
              {getWinRate(gameStats.player2)}% win rate
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="font-semibold text-green-600">{gameStats.player2.wins}</div>
            <div className="text-gray-500">Wins</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-yellow-600">{gameStats.player2.draws}</div>
            <div className="text-gray-500">Draws</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-red-600">{gameStats.player2.losses}</div>
            <div className="text-gray-500">Losses</div>
          </div>
        </div>
      </div>

      {/* Overall Statistics */}
      <div className="pt-3 border-t text-center">
        <div className="text-sm text-gray-600">
          Total Games: <span className="font-semibold">{getTotalGames(gameStats.player1)}</span>
        </div>
        {gameStats.player1.wins > gameStats.player2.wins && (
          <div className="text-xs text-gray-500 mt-1">
            {players.player1} leads {gameStats.player1.wins}-{gameStats.player2.wins}
          </div>
        )}
        {gameStats.player2.wins > gameStats.player1.wins && (
          <div className="text-xs text-gray-500 mt-1">
            {players.player2} leads {gameStats.player2.wins}-{gameStats.player1.wins}
          </div>
        )}
        {gameStats.player1.wins === gameStats.player2.wins && getTotalGames(gameStats.player1) > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            Series tied {gameStats.player1.wins}-{gameStats.player2.wins}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerInfo;