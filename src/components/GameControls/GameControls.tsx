import React from 'react';
import { useGame } from '../../contexts/GameContext';
import { useAuth } from '../../hooks/useAuth';

const GameControls: React.FC = () => {
  const { 
    gameState, 
    resetGame, 
    undoMove, 
    redoMove, 
    resign, 
    offerDraw,
    acceptDraw,
    declineDraw,
    pauseAIGame,
    resumeAIGame,
    canUndo, 
    canRedo 
  } = useGame();
  
  const { updatePreferences, profile } = useAuth();

  const currentPlayer = gameState.game.turn();
  const isGameOver = gameState.game.isGameOver() || gameState.gameResult !== '';
  
  const handleFlipBoard = async () => {
    if (profile) {
      const newOrientation = profile.preferences?.boardOrientation === 'black' ? 'white' : 'black';
      await updatePreferences({ boardOrientation: newOrientation });
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-3">
      <h3 className="font-bold text-lg mb-2">Game Controls</h3>
      
      {/* Main Controls */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={resetGame}
          className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
        >
          New Game
        </button>
        
        <button
          onClick={() => resign(currentPlayer)}
          disabled={isGameOver}
          className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Resign
        </button>
      </div>

      {/* Undo/Redo Controls */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={undoMove}
          disabled={!canUndo || isGameOver}
          className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Undo
        </button>
        
        <button
          onClick={redoMove}
          disabled={!canRedo || isGameOver}
          className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Redo →
        </button>
      </div>

      {/* Board Flip Control */}
      <button
        onClick={handleFlipBoard}
        className="w-full px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors text-sm flex items-center justify-center gap-2"
        title="Flip board perspective"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
        Flip Board
      </button>

      {/* AI vs AI Controls */}
      {gameState.gameMode === 'ai-vs-ai' && !isGameOver && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">AI Game Controls</div>
          {gameState.aiGamePaused ? (
            <button
              onClick={resumeAIGame}
              className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Resume Game
            </button>
          ) : (
            <button
              onClick={pauseAIGame}
              className="w-full px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors text-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pause Game
            </button>
          )}
        </div>
      )}

      {/* Draw Controls */}
      {!isGameOver && (
        <div>
          {!gameState.drawOffer.offered ? (
            <button
              onClick={() => offerDraw(currentPlayer)}
              className="w-full px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors text-sm"
            >
              Offer Draw
            </button>
          ) : gameState.drawOffer.by !== currentPlayer ? (
            <div className="space-y-2">
              <p className="text-sm text-center">
                {gameState.drawOffer.by === 'w' ? 'White' : 'Black'} offers a draw
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={acceptDraw}
                  className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm"
                >
                  Accept
                </button>
                <button
                  onClick={declineDraw}
                  className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
                >
                  Decline
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-center text-gray-600">
              Draw offered - waiting for response
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default GameControls;