import React, { useState, useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Square } from 'chess.js';
import { usePuzzle } from '../../contexts/PuzzleContext';
import { useAuth } from '../../hooks/useAuth';
import { useResponsiveBoardSize } from '../../hooks/useResponsiveBoardSize';

const PuzzleBoard: React.FC = () => {
  const { state, makeMove } = usePuzzle();
  const { profile } = useAuth();
  const boardSize = useResponsiveBoardSize();
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Partial<Record<Square, { background: string }>>>({});

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

  const currentTheme = boardThemes[profile?.preferences?.boardTheme || 'classic'];

  // Determine board orientation: in the puzzle FEN, it's the opponent's turn first.
  // After the opponent moves, it's the player's turn. So player is the OTHER color.
  const playerSide = useMemo(() => {
    if (!state.puzzle) return 'white' as const;
    // Parse the active color from FEN (field index 1)
    const fenParts = state.puzzle.fen.split(' ');
    const startingTurn = fenParts[1] || 'w';
    return startingTurn === 'w' ? 'black' as const : 'white' as const;
  }, [state.puzzle]);

  const isPlayerTurn = state.phase === 'player-turn';

  const getMoveOptions = useCallback((square: Square) => {
    if (!isPlayerTurn) return {};
    const moves = state.game.moves({ square, verbose: true });
    const options: Partial<Record<Square, { background: string }>> = {};
    moves.forEach((move) => {
      options[move.to as Square] = {
        background: state.game.get(move.to as Square)
          ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
      };
    });
    return options;
  }, [state.game, isPlayerTurn]);

  const onSquareClick = useCallback((square: Square) => {
    if (!isPlayerTurn) return;

    if (moveFrom === square) {
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }

    if (!moveFrom) {
      const piece = state.game.get(square);
      if (piece && piece.color === state.game.turn()) {
        setMoveFrom(square);
        setOptionSquares(getMoveOptions(square));
      }
      return;
    }

    const success = makeMove(moveFrom, square);
    setMoveFrom(null);
    setOptionSquares({});
    if (!success) {
      const piece = state.game.get(square);
      if (piece && piece.color === state.game.turn()) {
        setMoveFrom(square);
        setOptionSquares(getMoveOptions(square));
      }
    }
  }, [isPlayerTurn, moveFrom, state.game, makeMove, getMoveOptions]);

  const onDrop = useCallback((sourceSquare: Square, targetSquare: Square) => {
    if (!isPlayerTurn) return false;
    const success = makeMove(sourceSquare, targetSquare);
    setMoveFrom(null);
    setOptionSquares({});
    return success;
  }, [isPlayerTurn, makeMove]);

  const customSquareStyles = useMemo(() => {
    const styles: Partial<Record<Square, any>> = {};

    if (moveFrom) {
      styles[moveFrom] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
    }

    Object.entries(optionSquares).forEach(([sq, style]) => {
      styles[sq as Square] = style;
    });

    // Highlight hint square
    if (state.hintSquare) {
      styles[state.hintSquare as Square] = {
        background: 'radial-gradient(circle, rgba(34, 197, 94, 0.8) 20%, rgba(34, 197, 94, 0.3) 80%)',
        border: '2px solid #10B981',
        borderRadius: '4px',
      };
    }

    // Feedback flash
    if (state.lastMoveCorrect === true) {
      // Green flash on last move squares
    } else if (state.lastMoveCorrect === false) {
      // Red overlay for incorrect
    }

    return styles;
  }, [moveFrom, optionSquares, state.hintSquare, state.lastMoveCorrect]);

  // Phase-based border glow
  const borderColor =
    state.phase === 'correct' || state.phase === 'complete'
      ? '0 0 0 3px rgba(34, 197, 94, 0.5)'
      : state.phase === 'incorrect' || state.phase === 'failed'
        ? '0 0 0 3px rgba(239, 68, 68, 0.5)'
        : 'none';

  return (
    <div style={{ boxShadow: borderColor, borderRadius: '12px', transition: 'box-shadow 0.3s' }}>
      <Chessboard
        position={state.game.fen()}
        onPieceDrop={onDrop}
        onSquareClick={onSquareClick}
        boardWidth={boardSize}
        customSquareStyles={customSquareStyles}
        customBoardStyle={{
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
        customLightSquareStyle={currentTheme.lightSquareStyle}
        customDarkSquareStyle={currentTheme.darkSquareStyle}
        boardOrientation={playerSide}
        arePiecesDraggable={isPlayerTurn}
        showBoardNotation={true}
        animationDuration={300}
      />
    </div>
  );
};

export default PuzzleBoard;
