import { useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from './useAuth';
import { soundManager, SoundType } from '../utils/soundManager';
import { isFeatureEnabled } from '../config/gameFeatures';

/**
 * Hook that observes game state changes and plays appropriate sound effects.
 * Determines sound type from the last move's flags.
 */
export function useSoundEffects(): void {
  const { gameState } = useGame();
  const { profile } = useAuth();
  const prevMoveCount = useRef(gameState.history.length);
  const prevGameId = useRef(gameState.gameId);
  const prevGameResult = useRef(gameState.gameResult);

  // Sync sound enabled preference
  useEffect(() => {
    if (!isFeatureEnabled('SOUND_EFFECTS')) {
      soundManager.setEnabled(false);
      return;
    }
    const enabled = profile?.preferences?.soundEnabled !== false; // default to true
    soundManager.setEnabled(enabled);
  }, [profile?.preferences?.soundEnabled]);

  // Detect new game start
  useEffect(() => {
    if (!isFeatureEnabled('SOUND_EFFECTS')) return;

    if (gameState.gameId !== prevGameId.current) {
      prevGameId.current = gameState.gameId;
      prevMoveCount.current = 0;
      prevGameResult.current = '';
      soundManager.play('game-start');
    }
  }, [gameState.gameId]);

  // Detect game end
  useEffect(() => {
    if (!isFeatureEnabled('SOUND_EFFECTS')) return;

    if (gameState.gameResult && gameState.gameResult !== prevGameResult.current) {
      prevGameResult.current = gameState.gameResult;
      soundManager.play('game-end');
    }
  }, [gameState.gameResult]);

  // Detect moves and play appropriate sound
  useEffect(() => {
    if (!isFeatureEnabled('SOUND_EFFECTS')) return;

    const currentCount = gameState.history.length;
    if (currentCount > prevMoveCount.current && currentCount > 0) {
      const lastMove = gameState.history[currentCount - 1];
      const sound = determineSoundType(lastMove);
      soundManager.play(sound);
    }
    prevMoveCount.current = currentCount;
  }, [gameState.history.length, gameState.history]);
}

function determineSoundType(move: any): SoundType {
  // Check in order of specificity
  if (move.san?.includes('#')) return 'check'; // checkmate is also check sound
  if (move.san?.includes('+')) return 'check';
  if (move.san?.includes('=') || move.promotion) return 'promote';
  if (move.flags?.includes('k') || move.flags?.includes('q')) return 'castle';
  if (move.captured) return 'capture';
  return 'move';
}
