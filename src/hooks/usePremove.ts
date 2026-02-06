import { useEffect, useRef, useCallback, useState } from 'react';
import { Square } from 'chess.js';
import { useGame } from '../contexts/GameContext';
import { useSocket } from '../contexts/SocketContext';
import { useOnlineGame } from './useOnlineGame';
import { isFeatureEnabled } from '../config/gameFeatures';

interface Premove {
  from: Square;
  to: Square;
  promotion?: string;
}

/**
 * Hook managing premove queue for online play.
 * Stores one premove. When turn changes to ours, validates and executes.
 */
export function usePremove() {
  const { gameState } = useGame();
  const { roomCode, assignedColor, makeMove: socketMakeMove } = useSocket();
  const { isOnlineGame } = useOnlineGame();
  const [premove, setPremove] = useState<Premove | null>(null);
  const prevTurn = useRef(gameState.game.turn());

  const isEnabled = isFeatureEnabled('PREMOVES') && isOnlineGame && !!roomCode && !!assignedColor;

  // When turn changes to ours, try to execute premove
  useEffect(() => {
    const currentTurn = gameState.game.turn();
    if (currentTurn !== prevTurn.current) {
      prevTurn.current = currentTurn;

      if (premove && isEnabled && assignedColor) {
        const ourColor = assignedColor.charAt(0);
        if (currentTurn === ourColor) {
          // Validate the premove is still legal
          const moves = gameState.game.moves({ verbose: true });
          const isLegal = moves.some(
            (m) => m.from === premove.from && m.to === premove.to
          );

          if (isLegal) {
            socketMakeMove(premove.from, premove.to, premove.promotion);
          }
          // Clear premove regardless
          setPremove(null);
        }
      }
    }
  }, [gameState.game, premove, isEnabled, assignedColor, socketMakeMove]);

  // Clear premove when game ends or new game starts
  useEffect(() => {
    if (gameState.gameResult) {
      setPremove(null);
    }
  }, [gameState.gameResult]);

  const queuePremove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      if (!isEnabled) return;
      setPremove({ from, to, promotion });
    },
    [isEnabled]
  );

  const clearPremove = useCallback(() => {
    setPremove(null);
  }, []);

  return { premove, queuePremove, clearPremove, isEnabled };
}
