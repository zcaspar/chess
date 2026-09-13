import { useState } from 'react';
import { renderHook, act } from '@testing-library/react';
import { Chess, Square } from 'chess.js';
import { useChessVariants } from '../useChessVariants';
import type { GameState } from '../../contexts/GameContext';
import { createMockGameState } from '../../test-utils/mockGameState';

/**
 * useChessVariants is a pure hook over (gameState, setGameState), so it can be
 * driven without GameProvider: this harness owns the state the hook mutates.
 */
const renderVariants = (
  overrides: Partial<GameState> = {},
  ainaraModeEnabled = true,
) =>
  renderHook(() => {
    const [gameState, setGameState] = useState<GameState>(() =>
      createMockGameState(overrides),
    );
    const variants = useChessVariants(gameState, setGameState, ainaraModeEnabled);
    return { gameState, ...variants };
  });

describe('useChessVariants — nuclear chess', () => {
  describe('availability', () => {
    it('is available to both colours at the start of a human-vs-human game', () => {
      const { result } = renderVariants();

      expect(result.current.canUseNuke('w')).toBe(true);
      expect(result.current.canUseNuke('b')).toBe(true);
    });

    it('is unavailable when Ainara mode is off', () => {
      const { result } = renderVariants({}, false);

      expect(result.current.canUseNuke('w')).toBe(false);
    });

    it('is unavailable outside human-vs-human', () => {
      const { result } = renderVariants({ gameMode: 'human-vs-ai', aiColor: 'b' });

      expect(result.current.canUseNuke('w')).toBe(false);
    });

    it('is unavailable after 20 half-moves', () => {
      // 20 half-moves of knights shuffling out and back.
      const game = new Chess();
      for (let i = 0; i < 5; i++) {
        game.move('Nf3');
        game.move('Nf6');
        game.move('Ng1');
        game.move('Ng8');
      }
      expect(game.history()).toHaveLength(20);

      const { result } = renderVariants({ game });

      expect(result.current.canUseNuke('w')).toBe(false);
      expect(result.current.canUseNuke('b')).toBe(false);
    });

    it('is unavailable to a colour that has already used it', () => {
      const { result } = renderVariants({
        nukeAvailable: { white: false, black: true },
      });

      expect(result.current.canUseNuke('w')).toBe(false);
      expect(result.current.canUseNuke('b')).toBe(true);
    });
  });

  describe('executeNuke', () => {
    it('removes the targeted enemy piece, passes the turn and consumes the nuke', () => {
      const { result } = renderVariants({
        game: new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
      });

      act(() => {
        result.current.activateNukeMode('w');
      });
      expect(result.current.gameState.nukeModeActive.white).toBe(true);

      let nuked: boolean | undefined;
      act(() => {
        nuked = result.current.executeNuke('b8');
      });

      expect(nuked).toBe(true);
      expect(result.current.gameState.game.get('b8' as Square)).toBeFalsy();
      expect(result.current.gameState.game.turn()).toBe('b');
      expect(result.current.gameState.nukeAvailable.white).toBe(false);
      expect(result.current.gameState.nukeModeActive.white).toBe(false);
      expect(result.current.gameState.history).toHaveLength(1);
      expect(result.current.gameState.history[0].san).toContain('💣');
    });

    it('refuses to nuke when no nuke mode is active', () => {
      const { result } = renderVariants();

      let nuked: boolean | undefined;
      act(() => {
        nuked = result.current.executeNuke('b8');
      });

      expect(nuked).toBe(false);
      expect(result.current.gameState.history).toHaveLength(0);
    });

    it('refuses to nuke an empty square', () => {
      const { result } = renderVariants();

      act(() => {
        result.current.activateNukeMode('w');
      });

      let nuked: boolean | undefined;
      act(() => {
        nuked = result.current.executeNuke('e4');
      });

      expect(nuked).toBe(false);
    });

    it('refuses to nuke your own piece', () => {
      const { result } = renderVariants();

      act(() => {
        result.current.activateNukeMode('w');
      });

      let nuked: boolean | undefined;
      act(() => {
        nuked = result.current.executeNuke('b1');
      });

      expect(nuked).toBe(false);
      expect(result.current.gameState.game.get('b1' as Square)).toBeTruthy();
    });

    it('refuses to nuke a king or a queen', () => {
      const { result } = renderVariants();

      act(() => {
        result.current.activateNukeMode('w');
      });

      let nukedQueen: boolean | undefined;
      act(() => {
        nukedQueen = result.current.executeNuke('d8');
      });
      expect(nukedQueen).toBe(false);

      let nukedKing: boolean | undefined;
      act(() => {
        nukedKing = result.current.executeNuke('e8');
      });
      expect(nukedKing).toBe(false);
    });

    it('refuses a nuke that would leave your own king in check', () => {
      // Black to nuke. The white knight on e4 is the only thing between the
      // white rook on e1 and the black king on e8. Removing it hands White a
      // position where Black's king can simply be captured.
      const { result } = renderVariants({
        game: new Chess('4k3/8/8/8/4N3/8/8/4R1K1 b - - 0 1'),
      });

      act(() => {
        result.current.activateNukeMode('b');
      });

      let nuked: boolean | undefined;
      act(() => {
        nuked = result.current.executeNuke('e4');
      });

      expect(nuked).toBe(false);
      expect(result.current.gameState.game.get('e4' as Square)).toBeTruthy();
      expect(result.current.gameState.nukeAvailable.black).toBe(true);
    });

    it('produces a position the chess engine still considers legal', () => {
      const { result } = renderVariants({
        game: new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
      });

      act(() => {
        result.current.activateNukeMode('w');
      });
      act(() => {
        result.current.executeNuke('b8');
      });

      const after = result.current.gameState.game;
      // The side to move must not be able to capture a king, and the side that
      // just moved must not be sitting in check.
      const opponentInCheck = new Chess(after.fen()).isCheck();
      expect(opponentInCheck).toBe(false);
      expect(after.moves().length).toBeGreaterThan(0);
    });
  });
});

describe('useChessVariants — teleportation', () => {
  let randomSpy: jest.SpyInstance;

  beforeEach(() => {
    // executeTeleport picks a random empty square; pin it to the first one
    // (a1 in ALL_SQUARES order) so these tests are deterministic.
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  describe('availability', () => {
    it('is available to both colours at the start of a human-vs-human game', () => {
      const { result } = renderVariants();

      expect(result.current.canUseTeleport('w')).toBe(true);
      expect(result.current.canUseTeleport('b')).toBe(true);
    });

    it('is unavailable when Ainara mode is off', () => {
      const { result } = renderVariants({}, false);

      expect(result.current.canUseTeleport('w')).toBe(false);
    });

    it('is unavailable outside human-vs-human', () => {
      const { result } = renderVariants({ gameMode: 'ai-vs-ai' });

      expect(result.current.canUseTeleport('w')).toBe(false);
    });

    it('is unavailable to a colour that has already used it', () => {
      const { result } = renderVariants({
        teleportAvailable: { white: true, black: false },
      });

      expect(result.current.canUseTeleport('b')).toBe(false);
    });
  });

  describe('executeTeleport', () => {
    it('moves your own piece to an empty square, passes the turn and consumes the teleport', () => {
      const { result } = renderVariants({
        game: new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'),
      });

      act(() => {
        result.current.activateTeleportMode('w');
      });

      let teleported: boolean | undefined;
      act(() => {
        teleported = result.current.executeTeleport('a1');
      });

      expect(teleported).toBe(true);
      expect(result.current.gameState.game.turn()).toBe('b');
      expect(result.current.gameState.teleportAvailable.white).toBe(false);
      expect(result.current.gameState.teleportModeActive.white).toBe(false);
      expect(result.current.gameState.history).toHaveLength(1);
      expect(result.current.gameState.history[0].san).toContain('♦');

      // The rook still exists somewhere, just not where it started.
      const board = result.current.gameState.game.board().flat();
      expect(board.filter((p) => p && p.type === 'r' && p.color === 'w')).toHaveLength(1);
    });

    it('refuses to teleport when no teleport mode is active', () => {
      const { result } = renderVariants();

      let teleported: boolean | undefined;
      act(() => {
        teleported = result.current.executeTeleport('a1');
      });

      expect(teleported).toBe(false);
    });

    it("refuses to teleport an opponent's piece", () => {
      const { result } = renderVariants();

      act(() => {
        result.current.activateTeleportMode('w');
      });

      let teleported: boolean | undefined;
      act(() => {
        teleported = result.current.executeTeleport('a8');
      });

      expect(teleported).toBe(false);
    });

    it('refuses to teleport from an empty square', () => {
      const { result } = renderVariants();

      act(() => {
        result.current.activateTeleportMode('w');
      });

      let teleported: boolean | undefined;
      act(() => {
        teleported = result.current.executeTeleport('e4');
      });

      expect(teleported).toBe(false);
    });

    it('refuses a teleport that would leave your own king in check', () => {
      // The black bishop on e6 is the only blocker between the white rook on e1
      // and the black king on e8. Teleporting it away (to a1, with Math.random
      // pinned) exposes the king with White to move.
      const { result } = renderVariants({
        game: new Chess('4k3/8/4b3/8/8/8/8/4R1K1 b - - 0 1'),
      });

      act(() => {
        result.current.activateTeleportMode('b');
      });

      let teleported: boolean | undefined;
      act(() => {
        teleported = result.current.executeTeleport('e6');
      });

      expect(teleported).toBe(false);
      expect(result.current.gameState.game.get('e6' as Square)).toBeTruthy();
      expect(result.current.gameState.teleportAvailable.black).toBe(true);
    });
  });
});
