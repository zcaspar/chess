import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Square } from 'chess.js';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { useOnlineGame } from '../../hooks/useOnlineGame';
import { useAuth } from '../../hooks/useAuth';
import { useResponsiveBoardSize } from '../../hooks/useResponsiveBoardSize';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { isFeatureEnabled } from '../../config/gameFeatures';

// Pre-computed constant: all 64 board squares
const ALL_SQUARES: Square[] = [
  'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8',
  'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8',
  'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8',
  'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8',
  'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8',
  'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8',
];

const ChessBoard: React.FC = () => {
  const { gameState, makeMove, executeNuke, executeTeleport } = useGame();
  const { roomCode, assignedColor, makeMove: socketMakeMove } = useSocket();
  const { isOnlineGame } = useOnlineGame();
  const { profile } = useAuth();
  const boardSize = useResponsiveBoardSize();
  useSoundEffects();

  // Animation speed from preferences
  const animationSpeedMap = { slow: 500, normal: 300, fast: 100 } as const;
  const animationDuration = animationSpeedMap[profile?.preferences?.animationSpeed || 'normal'];

  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [rightClickedSquares, setRightClickedSquares] = useState<Square[]>([]);
  const [optionSquares, setOptionSquares] = useState<Partial<Record<Square, { background: string }>>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  
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
  // In online games, auto-orient board based on assigned color; otherwise use preference
  const boardOrientation = (isOnlineGame && assignedColor)
    ? (assignedColor === 'black' ? 'black' : 'white')
    : (profile?.preferences?.boardOrientation === 'black' ? 'black' : 'white');
  
  // Clear selections when game ends
  useEffect(() => {
    if (gameState.gameResult) {
      setMoveFrom(null);
      setOptionSquares({});
      setRightClickedSquares([]);
    }
  }, [gameState.gameResult]);

  const getMoveOptions = useCallback((square: Square) => {
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
  }, [gameState.game]);

  const onSquareClick = useCallback((square: Square) => {
    // Don't allow any interaction if game has ended
    if (gameState.gameResult) {
      return;
    }
    
    // Clear right-clicked squares
    setRightClickedSquares([]);

    // Handle nuclear chess mode
    const isNukeModeActive = (gameState.nukeModeActive.white || gameState.nukeModeActive.black);
    if (isNukeModeActive) {
      // In nuke mode, clicking executes the nuke
      if (executeNuke(square)) {
        // Nuke successful - clear any selection
        setMoveFrom(null);
        setOptionSquares({});
      }
      return;
    }

    // Handle teleportation mode
    const isTeleportModeActive = (gameState.teleportModeActive.white || gameState.teleportModeActive.black);
    if (isTeleportModeActive) {
      // In teleport mode, clicking executes the teleport
      if (executeTeleport(square)) {
        // Teleport successful - clear any selection
        setMoveFrom(null);
        setOptionSquares({});
      }
      return;
    }

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
  }, [gameState.gameResult, gameState.nukeModeActive, gameState.teleportModeActive, gameState.game, moveFrom, isOnlineGame, roomCode, assignedColor, socketMakeMove, makeMove, executeNuke, executeTeleport, getMoveOptions]);

  const onSquareRightClick = useCallback((square: Square) => {
    const newSquares = rightClickedSquares.includes(square)
      ? rightClickedSquares.filter((s) => s !== square)
      : [...rightClickedSquares, square];
    setRightClickedSquares(newSquares);
  }, [rightClickedSquares]);

  const onDrop = useCallback((sourceSquare: Square, targetSquare: Square) => {
    // Don't allow drag and drop if game has ended
    if (gameState.gameResult) {
      return false;
    }
    
    // Don't allow drag and drop in nuclear mode
    const isNukeModeActive = (gameState.nukeModeActive.white || gameState.nukeModeActive.black);
    if (isNukeModeActive) {
      return false;
    }
    
    // Don't allow drag and drop in teleportation mode
    const isTeleportModeActive = (gameState.teleportModeActive.white || gameState.teleportModeActive.black);
    if (isTeleportModeActive) {
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
  }, [gameState.gameResult, gameState.nukeModeActive, gameState.teleportModeActive, gameState.game, isOnlineGame, roomCode, assignedColor, socketMakeMove, makeMove]);

  const onDragBegin = useCallback((piece: string, sourceSquare: Square) => {
    // Don't allow drag if game has ended
    if (gameState.gameResult) {
      return false;
    }

    // Don't allow drag in nuclear mode
    const isNukeModeActive = (gameState.nukeModeActive.white || gameState.nukeModeActive.black);
    if (isNukeModeActive) {
      return false;
    }

    // Don't allow drag in teleportation mode
    const isTeleportModeActive = (gameState.teleportModeActive.white || gameState.teleportModeActive.black);
    if (isTeleportModeActive) {
      return false;
    }

    // Check if it's the correct turn
    const pieceColor = piece[0] === 'w' ? 'w' : 'b';
    if (pieceColor !== gameState.game.turn()) {
      return false;
    }

    // For online games, check if it's our turn
    if (isOnlineGame && roomCode && assignedColor) {
      if (gameState.game.turn() !== assignedColor.charAt(0)) {
        return false;
      }
    }

    // Highlight the source square and show move options
    setIsDragging(true);
    setMoveFrom(sourceSquare);
    setOptionSquares(getMoveOptions(sourceSquare));
    return true;
  }, [gameState.gameResult, gameState.nukeModeActive, gameState.teleportModeActive, gameState.game, isOnlineGame, roomCode, assignedColor, getMoveOptions]);

  const onDragEnd = useCallback(() => {
    // Clear highlights when drag ends
    setIsDragging(false);
    setMoveFrom(null);
    setOptionSquares({});
  }, []);

  // Custom square styles for highlights
  const customSquareStyles = useMemo(() => {
    const styles: Partial<Record<Square, { backgroundColor?: string; background?: string; cursor?: string }>> = {};
    
    // Handle nuclear mode highlighting
    const isNukeModeActive = (gameState.nukeModeActive.white || gameState.nukeModeActive.black);
    if (isNukeModeActive) {
      const activeNukeColor = gameState.nukeModeActive.white ? 'w' : 'b';
      
      // Highlight all opponent pieces that can be nuked (not King or Queen)
      ALL_SQUARES.forEach((square) => {
        const piece = gameState.game.get(square);
        if (piece && piece.color !== activeNukeColor && piece.type !== 'k' && piece.type !== 'q') {
          styles[square] = { 
            backgroundColor: 'rgba(255, 0, 0, 0.5)',
            cursor: 'crosshair'
          };
        }
      });
      
      return styles;
    }

    // Handle teleportation mode highlighting
    const isTeleportModeActive = (gameState.teleportModeActive.white || gameState.teleportModeActive.black);
    if (isTeleportModeActive) {
      const activeTeleportColor = gameState.teleportModeActive.white ? 'w' : 'b';
      
      // Highlight all own pieces that can be teleported
      ALL_SQUARES.forEach((square) => {
        const piece = gameState.game.get(square);
        if (piece && piece.color === activeTeleportColor) {
          styles[square] = { 
            backgroundColor: 'rgba(147, 51, 234, 0.5)', // purple highlight
            cursor: 'pointer'
          };
        }
      });
      
      return styles;
    }
    
    // Normal move highlighting (when not in special modes)
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
    
    // Highlight hint move with distinctive green styling
    if (gameState.currentHint) {
      styles[gameState.currentHint.from] = { 
        background: 'radial-gradient(circle, rgba(34, 197, 94, 0.8) 20%, rgba(34, 197, 94, 0.3) 80%)',
        border: '2px solid #10B981',
        borderRadius: '4px',
        boxShadow: '0 0 10px rgba(34, 197, 94, 0.6)'
      };
      styles[gameState.currentHint.to] = { 
        background: 'radial-gradient(circle, rgba(34, 197, 94, 0.8) 20%, rgba(34, 197, 94, 0.3) 80%)',
        border: '2px solid #10B981',
        borderRadius: '4px',
        boxShadow: '0 0 10px rgba(34, 197, 94, 0.6)'
      };
    }
    
    return styles;
  }, [moveFrom, rightClickedSquares, optionSquares, gameState.history, gameState.currentMoveIndex, gameState.currentHint, gameState.nukeModeActive, gameState.teleportModeActive, gameState.game]);

  // Get piece style class for CSS filters
  const getPieceStyleClass = () => {
    const pieceStyle = profile?.preferences?.pieceStyle || 'classic';
    return `piece-style-${pieceStyle}`;
  };

  // Determine game phase for ambient effects
  const getGamePhase = () => {
    const moveCount = gameState.history.length;
    if (gameState.gameResult) return 'ended';
    if (gameState.inCheck) return 'check';
    if (moveCount < 10) return 'opening';
    if (moveCount < 30) return 'middlegame';
    return 'endgame';
  };

  return (
    <div className={`chess-board-hero-container ${gameState.gameResult ? 'game-ended' : ''} ${gameState.inCheck ? 'in-check' : ''} phase-${getGamePhase()}`}>
      <div className="chess-board-stage">
        <div className="board-glow-effect"></div>
        <div className="board-ambient-particles"></div>
        <div className="board-frame-wrapper">
          <div className="board-frame">
            <div 
              className={`chess-board-container ${getPieceStyleClass()} ${isDragging ? 'dragging' : ''}`}
              onTouchStart={(e) => {
                setTouchStartTime(Date.now());
                // Prevent pull-to-refresh on mobile
                if (e.touches[0].clientY < 100) {
                  e.preventDefault();
                }
              }}
              onTouchMove={(e) => {
                // Prevent scrolling while dragging
                if (isDragging) {
                  e.preventDefault();
                }
              }}
              onTouchEnd={() => {
                // Check for long press (for right-click simulation)
                const touchDuration = Date.now() - touchStartTime;
                if (touchDuration > 500 && !isDragging) {
                  // Long press detected, could show context menu
                }
              }}
              style={{ touchAction: isDragging ? 'none' : 'auto' }}
            >
              <Chessboard
              position={gameState.game.fen()}
              onPieceDrop={onDrop}
              onPieceDragBegin={onDragBegin}
              onPieceDragEnd={onDragEnd}
              onSquareClick={onSquareClick}
              onSquareRightClick={onSquareRightClick}
              boardWidth={boardSize}
              customSquareStyles={customSquareStyles}
              customBoardStyle={{
                borderRadius: '8px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              }}
              customLightSquareStyle={currentTheme.lightSquareStyle}
              customDarkSquareStyle={currentTheme.darkSquareStyle}
              boardOrientation={boardOrientation}
              arePiecesDraggable={true}
              showBoardNotation={true}
              animationDuration={animationDuration}
              arePremovesAllowed={isFeatureEnabled('PREMOVES') && isOnlineGame && !!roomCode && !!assignedColor}
              clearPremovesOnRightClick={true}
              customPremoveDarkSquareStyle={{ backgroundColor: '#A42323' }}
              customPremoveLightSquareStyle={{ backgroundColor: '#BD2828' }}
            />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessBoard;