import { useEffect, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { Square } from 'chess.js';

export const useOnlineGame = () => {
  const { roomCode, assignedColor } = useSocket();
  const { gameState, makeMove } = useGame();

  // Memoize handlers to prevent unnecessary re-renders
  const handleMoveMade = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<{
      move: { from: string; to: string; promotion?: string; san: string };
      fen: string;
      pgn: string;
      turn: string;
      whiteTime: number;
      blackTime: number;
    }>;
    const data = customEvent.detail;

    // Apply the move to the local game state
    // Note: The move has already been validated on the server
    console.log('[useOnlineGame] Received move from opponent:', data.move);
    makeMove(data.move.from as Square, data.move.to as Square, data.move.promotion);
  }, [makeMove]);

  const handleGameEnded = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<{
      result: 'white' | 'black' | 'draw';
      reason: string;
      pgn: string;
    }>;
    const data = customEvent.detail;

    // Update local game state to reflect game end
    console.log('[useOnlineGame] Game ended:', data);
    // TODO: Update GameContext to handle remote game endings
  }, []);

  const handleDrawOffered = useCallback(() => {
    // Show draw offer UI
    console.log('[useOnlineGame] Draw offered by opponent');
    // TODO: Implement draw offer UI
  }, []);

  useEffect(() => {
    if (!roomCode) return;

    // Listen for custom events dispatched by SocketContext
    // SocketContext receives raw socket events and converts them to CustomEvents
    console.log('[useOnlineGame] Setting up event listeners for room:', roomCode);

    window.addEventListener('socketMoveMade', handleMoveMade);
    window.addEventListener('socketGameEnded', handleGameEnded);
    window.addEventListener('socketDrawOffered', handleDrawOffered);

    return () => {
      console.log('[useOnlineGame] Cleaning up event listeners');
      window.removeEventListener('socketMoveMade', handleMoveMade);
      window.removeEventListener('socketGameEnded', handleGameEnded);
      window.removeEventListener('socketDrawOffered', handleDrawOffered);
    };
  }, [roomCode, handleMoveMade, handleGameEnded, handleDrawOffered]);

  // Get socket functions at hook level
  const { makeMove: socketMakeMove } = useSocket();

  // Override local move making to use socket for online games
  const makeOnlineMove = (from: Square, to: Square, promotion?: string) => {
    if (roomCode && assignedColor && gameState.game.turn() === assignedColor.charAt(0)) {
      // For online games, emit the move through socket
      socketMakeMove(from, to, promotion);
      return true;
    }
    return false;
  };

  return {
    isOnlineGame: !!roomCode,
    canMakeMove: assignedColor === 'white' || assignedColor === 'black',
    makeOnlineMove,
  };
};