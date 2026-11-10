import { useSocket } from '../contexts/SocketContext';

/**
 * Whether the board is showing an online game, and whether this client holds
 * a seat in it.
 *
 * Applying the opponent's moves is NOT done here. This hook is mounted by the
 * board component, so a listener here stopped existing the moment the player
 * opened another screen. GameContext applies server moves instead (see its
 * `socketMoveMade` handler).
 */
export const useOnlineGame = () => {
  const { roomCode, assignedColor } = useSocket();

  return {
    isOnlineGame: !!roomCode,
    canMakeMove: assignedColor === 'white' || assignedColor === 'black',
  };
};
