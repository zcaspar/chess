import { useCallback } from 'react';
import { Chess, Move, Square } from 'chess.js';
import type { GameState } from '../contexts/GameContext';
import { isFeatureEnabled } from '../config/gameFeatures';
import { ALL_SQUARES } from '../utils/chessSquares';

type SetGameState = React.Dispatch<React.SetStateAction<GameState>>;

export interface ChessVariants {
  canUseNuke: (color: 'w' | 'b') => boolean;
  activateNukeMode: (color: 'w' | 'b') => void;
  cancelNukeMode: () => void;
  executeNuke: (targetSquare: Square) => boolean;
  canUseTeleport: (color: 'w' | 'b') => boolean;
  activateTeleportMode: (color: 'w' | 'b') => void;
  cancelTeleportMode: () => void;
  executeTeleport: (pieceSquare: Square) => boolean;
}

/**
 * Encapsulates the "Ainara mode" chess variants (nuclear chess + teleportation)
 * previously inlined in GameContext. Behavior is unchanged; GameContext simply
 * spreads the returned methods into its context value.
 */
export function useChessVariants(
  gameState: GameState,
  setGameState: SetGameState,
  ainaraModeEnabled: boolean,
): ChessVariants {
  // ----- Nuclear chess -----
  const canUseNuke = useCallback((color: 'w' | 'b'): boolean => {
    if (!ainaraModeEnabled || !isFeatureEnabled('NUCLEAR_CHESS')) return false;

    // Only available in human vs human mode
    if (gameState.gameMode !== 'human-vs-human') return false;

    // Only available in first 10 moves (20 half-moves)
    const moveCount = gameState.game.history().length;
    if (moveCount >= 20) return false;

    // Check if this color hasn't used their nuke yet
    return color === 'w' ? gameState.nukeAvailable.white : gameState.nukeAvailable.black;
  }, [ainaraModeEnabled, gameState.gameMode, gameState.game, gameState.nukeAvailable]);

  const activateNukeMode = useCallback((color: 'w' | 'b') => {
    if (!canUseNuke(color)) return;

    setGameState(prev => ({
      ...prev,
      nukeModeActive: {
        white: color === 'w',
        black: color === 'b',
      },
    }));
  }, [canUseNuke, setGameState]);

  const cancelNukeMode = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      nukeModeActive: { white: false, black: false },
    }));
  }, [setGameState]);

  const executeNuke = useCallback((targetSquare: Square): boolean => {
    const activeNukeColor = gameState.nukeModeActive.white ? 'w' :
                            gameState.nukeModeActive.black ? 'b' : null;

    if (!activeNukeColor) return false;

    // Get the piece on the target square
    const targetPiece = gameState.game.get(targetSquare);
    if (!targetPiece) return false;

    // Can't nuke your own pieces
    if (targetPiece.color === activeNukeColor) return false;

    // Can't nuke Kings or Queens
    if (targetPiece.type === 'k' || targetPiece.type === 'q') return false;

    // Create a copy of the game and remove the piece
    const gameCopy = new Chess(gameState.game.fen());
    gameCopy.remove(targetSquare);

    // Advance the turn after the nuke (chess.js doesn't do this for direct manipulation)
    const fenParts = gameCopy.fen().split(' ');
    fenParts[1] = activeNukeColor === 'w' ? 'b' : 'w'; // Switch turn
    if (activeNukeColor === 'b') {
      fenParts[5] = (parseInt(fenParts[5]) + 1).toString(); // Increment full move number
    }
    fenParts[4] = '0'; // Reset half-move clock (capturing move)
    const finalGame = new Chess(fenParts.join(' '));

    // Create a special nuke move entry (synthetic, not a real chess.js Move)
    const nukeMove = {
      san: `💣x${targetPiece.type.toUpperCase()}${targetSquare}`,
      from: targetSquare,
      to: targetSquare,
      color: activeNukeColor,
      piece: targetPiece.type,
      captured: targetPiece.type,
      flags: 'n',
    } as unknown as Move;

    setGameState(prev => ({
      ...prev,
      game: finalGame,
      history: [...prev.history, nukeMove],
      currentMoveIndex: prev.history.length,
      nukeAvailable: {
        white: activeNukeColor === 'w' ? false : prev.nukeAvailable.white,
        black: activeNukeColor === 'b' ? false : prev.nukeAvailable.black,
      },
      nukeModeActive: { white: false, black: false },
    }));

    return true;
  }, [gameState.nukeModeActive, gameState.game, setGameState]);

  // ----- Teleportation -----
  const canUseTeleport = useCallback((color: 'w' | 'b'): boolean => {
    if (!ainaraModeEnabled || !isFeatureEnabled('TELEPORTATION')) return false;

    // Only available in human vs human mode
    if (gameState.gameMode !== 'human-vs-human') return false;

    // Only available in first 10 moves (20 half-moves)
    const moveCount = gameState.game.history().length;
    if (moveCount >= 20) return false;

    // Check if this color hasn't used their teleport yet
    return color === 'w' ? gameState.teleportAvailable.white : gameState.teleportAvailable.black;
  }, [ainaraModeEnabled, gameState.gameMode, gameState.game, gameState.teleportAvailable]);

  const activateTeleportMode = useCallback((color: 'w' | 'b') => {
    if (!canUseTeleport(color)) return;

    setGameState(prev => ({
      ...prev,
      teleportModeActive: {
        white: color === 'w',
        black: color === 'b',
      },
    }));
  }, [canUseTeleport, setGameState]);

  const cancelTeleportMode = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      teleportModeActive: { white: false, black: false },
    }));
  }, [setGameState]);

  const executeTeleport = useCallback((pieceSquare: Square): boolean => {
    const activeTeleportColor = gameState.teleportModeActive.white ? 'w' :
                                gameState.teleportModeActive.black ? 'b' : null;

    if (!activeTeleportColor) return false;

    // Get the piece on the source square
    const piece = gameState.game.get(pieceSquare);
    if (!piece) return false;

    // Can only teleport your own pieces
    if (piece.color !== activeTeleportColor) return false;

    // Find all empty squares on the board
    const emptySquares = ALL_SQUARES.filter(square => !gameState.game.get(square));
    if (emptySquares.length === 0) return false;

    // Randomly select an empty square
    const targetSquare = emptySquares[Math.floor(Math.random() * emptySquares.length)];

    // Create a copy of the game and make the teleport move
    const gameCopy = new Chess(gameState.game.fen());
    gameCopy.remove(pieceSquare);
    gameCopy.put({ type: piece.type, color: piece.color }, targetSquare);

    // Advance the turn after the teleport (chess.js doesn't do this for direct manipulation)
    const fenParts = gameCopy.fen().split(' ');
    fenParts[1] = activeTeleportColor === 'w' ? 'b' : 'w'; // Switch turn
    if (activeTeleportColor === 'b') {
      fenParts[5] = (parseInt(fenParts[5]) + 1).toString(); // Increment full move number
    }
    fenParts[4] = (parseInt(fenParts[4]) + 1).toString(); // Increment half-move clock (non-capturing)
    const finalGame = new Chess(fenParts.join(' '));

    // Create a special teleport move entry (synthetic, not a real chess.js Move)
    const teleportMove = {
      san: `♦${piece.type.toUpperCase()}${pieceSquare}-${targetSquare}`,
      from: pieceSquare,
      to: targetSquare,
      color: activeTeleportColor,
      piece: piece.type,
      flags: 't',
    } as unknown as Move;

    setGameState(prev => ({
      ...prev,
      game: finalGame,
      history: [...prev.history, teleportMove],
      currentMoveIndex: prev.history.length,
      teleportAvailable: {
        white: activeTeleportColor === 'w' ? false : prev.teleportAvailable.white,
        black: activeTeleportColor === 'b' ? false : prev.teleportAvailable.black,
      },
      teleportModeActive: { white: false, black: false },
    }));

    return true;
  }, [gameState.teleportModeActive, gameState.game, setGameState]);

  return {
    canUseNuke,
    activateNukeMode,
    cancelNukeMode,
    executeNuke,
    canUseTeleport,
    activateTeleportMode,
    cancelTeleportMode,
    executeTeleport,
  };
}
