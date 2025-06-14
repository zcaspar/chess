import { useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { Square } from 'chess.js';

export const useOnlineGame = () => {
  const { socket, roomCode, assignedColor } = useSocket();
  const { gameState, makeMove } = useGame();

  useEffect(() => {
    if (!socket || !roomCode) return;

    // Listen for moves from other players
    const handleMoveMade = (data: {
      move: { from: string; to: string; promotion?: string; san: string };
      fen: string;
      pgn: string;
      turn: string;
      whiteTime: number;
      blackTime: number;
    }) => {
      // Apply the move to the local game state
      // Note: The move has already been validated on the server
      makeMove(data.move.from as Square, data.move.to as Square, data.move.promotion);
    };

    // Listen for game events
    const handleGameEnded = (data: {
      result: 'white' | 'black' | 'draw';
      reason: string;
      pgn: string;
    }) => {
      // Update local game state to reflect game end
      console.log('Game ended:', data);
      // TODO: Update GameContext to handle remote game endings
    };

    const handleDrawOffered = () => {
      // Show draw offer UI
      console.log('Draw offered by opponent');
      // TODO: Implement draw offer UI
    };

    socket.on('moveMade', handleMoveMade);
    socket.on('gameEnded', handleGameEnded);
    socket.on('drawOffered', handleDrawOffered);

    return () => {
      socket.off('moveMade', handleMoveMade);
      socket.off('gameEnded', handleGameEnded);
      socket.off('drawOffered', handleDrawOffered);
    };
  }, [socket, roomCode, makeMove]);

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