import React, { useState, useMemo, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Square } from 'chess.js';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { useOnlineGame } from '../../hooks/useOnlineGame';
import { useAuth } from '../../hooks/useAuth';

const ChessBoard: React.FC = () => {
  const { gameState, makeMove } = useGame();
  const { roomCode, assignedColor, makeMove: socketMakeMove } = useSocket();
  const { isOnlineGame } = useOnlineGame();
  const { profile } = useAuth();
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [rightClickedSquares, setRightClickedSquares] = useState<Square[]>([]);
  const [optionSquares, setOptionSquares] = useState<Partial<Record<Square, { background: string }>>>({});
  
  // Board theme configurations
  const boardThemes = {
    classic: {
      lightSquareStyle: { backgroundColor: '#f0d9b5' },
      darkSquareStyle: { backgroundColor: '#b58863' },
    },
    wood: {
      lightSquareStyle: { backgroundColor: '#ddb88c' },
      darkSquareStyle: { backgroundColor: '#8b6914' },
    },
    neon: {
      lightSquareStyle: { backgroundColor: '#39ff14' },
      darkSquareStyle: { backgroundColor: '#ff006e' },
    },
    ice: {
      lightSquareStyle: { backgroundColor: '#e8f4f8' },
      darkSquareStyle: { backgroundColor: '#4a90e2' },
    },
  };

  // Get current theme and board orientation
  const currentTheme = boardThemes[profile?.preferences?.boardTheme || 'classic'];
  const boardOrientation = profile?.preferences?.boardOrientation === 'black' ? 'black' : 'white';
  
  // Clear selections when game ends
  useEffect(() => {
    if (gameState.gameResult) {
      setMoveFrom(null);
      setOptionSquares({});
      setRightClickedSquares([]);
    }
  }, [gameState.gameResult]);

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
    // Don't allow any interaction if game has ended
    if (gameState.gameResult) {
      return;
    }
    
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
    let moveSuccessful = false;
    
    if (isOnlineGame && roomCode) {
      // For online games, check if it's our turn
      if (assignedColor && gameState.game.turn() === assignedColor.charAt(0)) {
        socketMakeMove(moveFrom, square);
        moveSuccessful = true; // Optimistically assume success
      }
    } else {
      // For local games, use the regular makeMove
      moveSuccessful = makeMove(moveFrom, square);
    }
    
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
    // Don't allow drag and drop if game has ended
    if (gameState.gameResult) {
      return false;
    }
    
    let moveSuccessful = false;
    
    if (isOnlineGame && roomCode) {
      // For online games, check if it's our turn
      if (assignedColor && gameState.game.turn() === assignedColor.charAt(0)) {
        socketMakeMove(sourceSquare, targetSquare);
        moveSuccessful = true; // Optimistically assume success
      }
    } else {
      // For local games, use the regular makeMove
      moveSuccessful = makeMove(sourceSquare, targetSquare);
    }
    
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

  // Get piece style class for CSS filters
  const getPieceStyleClass = () => {
    const pieceStyle = profile?.preferences?.pieceStyle || 'classic';
    return `piece-style-${pieceStyle}`;
  };

  return (
    <div className={`chess-board-container ${getPieceStyleClass()}`}>
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
        customLightSquareStyle={currentTheme.lightSquareStyle}
        customDarkSquareStyle={currentTheme.darkSquareStyle}
        boardOrientation={boardOrientation}
      />
    </div>
  );
};

export default ChessBoard;