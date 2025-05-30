import React, { useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, Square } from 'chess.js';

interface ChessBoardProps {
  onGameOver?: (result: string) => void;
}

const ChessBoard: React.FC<ChessBoardProps> = ({ onGameOver }) => {
  const [game, setGame] = useState(new Chess());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);

  const makeMove = (sourceSquare: Square, targetSquare: Square) => {
    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // Always promote to queen for simplicity
      });

      if (!move) return false;

      setGame(gameCopy);
      setMoveHistory([...moveHistory, move.san]);

      // Check game over conditions
      if (gameCopy.isGameOver()) {
        let result = '';
        if (gameCopy.isCheckmate()) {
          result = `Checkmate! ${gameCopy.turn() === 'w' ? 'Black' : 'White'} wins!`;
        } else if (gameCopy.isDraw()) {
          result = 'Draw!';
        } else if (gameCopy.isStalemate()) {
          result = 'Stalemate!';
        } else if (gameCopy.isThreefoldRepetition()) {
          result = 'Draw by threefold repetition!';
        } else if (gameCopy.isInsufficientMaterial()) {
          result = 'Draw by insufficient material!';
        }
        onGameOver?.(result);
      }

      return true;
    } catch (error) {
      return false;
    }
  };

  const onDrop = (sourceSquare: Square, targetSquare: Square) => {
    const moveSuccessful = makeMove(sourceSquare, targetSquare);
    return moveSuccessful;
  };

  const resetGame = () => {
    setGame(new Chess());
    setMoveHistory([]);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">
          Turn: {game.turn() === 'w' ? 'White' : 'Black'}
        </h2>
        {game.isCheck() && <p className="text-red-600 font-bold">Check!</p>}
      </div>
      
      <div className="mb-4">
        <Chessboard 
          position={game.fen()} 
          onPieceDrop={onDrop}
          boardWidth={500}
        />
      </div>

      <button
        onClick={resetGame}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        New Game
      </button>

      <div className="mt-4 p-4 bg-gray-100 rounded max-h-40 overflow-y-auto">
        <h3 className="font-bold mb-2">Move History</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {moveHistory.map((move, index) => (
            <div key={index} className="flex">
              {index % 2 === 0 && (
                <span className="font-semibold mr-2">{Math.floor(index / 2) + 1}.</span>
              )}
              <span>{move}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChessBoard;