import React, { useState, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { Square } from 'chess.js';
import { useGame } from '../../contexts/GameContext';

const ChessBoard: React.FC = () => {
  const { gameState, makeMove } = useGame();
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [rightClickedSquares, setRightClickedSquares] = useState<Square[]>([]);
  const [optionSquares, setOptionSquares] = useState<Partial<Record<Square, { background: string }>>>({});

  const getMoveOptions = (square: Square) => {
    const moves = gameState.game.moves({
      square,
      verbose: true,
    });
    
    const options: Partial<Record<Square, { background: string }>> = {};
    
    moves.forEach((move) => {
      options[move.to as Square] = {
        background:
          gameState.game.get(move.to as Square) && gameState.game.get(move.to as Square)?.color !== gameState.game.get(square)?.color
            ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
      };
    });
    
    return options;
  };

  const onSquareClick = (square: Square) => {
    // Clear right-clicked squares
    setRightClickedSquares([]);

    // If clicking the same square, deselect it
    if (moveFrom === square) {
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }

    // If no piece is selected
    if (!moveFrom) {
      // Check if there's a piece on this square and it's the right color
      const piece = gameState.game.get(square);
      if (piece && piece.color === gameState.game.turn()) {
        setMoveFrom(square);
        setOptionSquares(getMoveOptions(square));
      }
      return;
    }

    // Try to make the move
    const moveSuccessful = makeMove(moveFrom, square);
    
    if (moveSuccessful) {
      setMoveFrom(null);
      setOptionSquares({});
    } else {
      // If move failed, check if clicked square has a piece of the current color
      const piece = gameState.game.get(square);
      if (piece && piece.color === gameState.game.turn()) {
        setMoveFrom(square);
        setOptionSquares(getMoveOptions(square));
      } else {
        setMoveFrom(null);
        setOptionSquares({});
      }
    }
  };

  const onSquareRightClick = (square: Square) => {
    const newSquares = rightClickedSquares.includes(square)
      ? rightClickedSquares.filter((s) => s !== square)
      : [...rightClickedSquares, square];
    setRightClickedSquares(newSquares);
  };

  const onDrop = (sourceSquare: Square, targetSquare: Square) => {
    const moveSuccessful = makeMove(sourceSquare, targetSquare);
    setMoveFrom(null);
    setOptionSquares({});
    return moveSuccessful;
  };

  // Custom square styles for highlights
  const customSquareStyles = useMemo(() => {
    const styles: Partial<Record<Square, { backgroundColor?: string; background?: string }>> = {};
    
    // Highlight the selected square
    if (moveFrom) {
      styles[moveFrom] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
    }
    
    // Highlight right-clicked squares
    rightClickedSquares.forEach((square) => {
      styles[square] = { backgroundColor: 'rgba(0, 0, 255, 0.4)' };
    });
    
    // Show possible moves
    Object.entries(optionSquares).forEach(([square, style]) => {
      styles[square as Square] = style;
    });
    
    // Highlight last move
    if (gameState.history.length > 0 && gameState.currentMoveIndex >= 0) {
      const lastMove = gameState.history[gameState.currentMoveIndex];
      styles[lastMove.from as Square] = { backgroundColor: 'rgba(255, 255, 0, 0.2)' };
      styles[lastMove.to as Square] = { backgroundColor: 'rgba(255, 255, 0, 0.2)' };
    }
    
    return styles;
  }, [moveFrom, rightClickedSquares, optionSquares, gameState.history, gameState.currentMoveIndex]);

  return (
    <div className="chess-board-container">
      <Chessboard
        position={gameState.game.fen()}
        onPieceDrop={onDrop}
        onSquareClick={onSquareClick}
        onSquareRightClick={onSquareRightClick}
        boardWidth={500}
        customSquareStyles={customSquareStyles}
        customBoardStyle={{
          borderRadius: '4px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        }}
      />
    </div>
  );
};

export default ChessBoard;