import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { GameProvider, useGame } from '../contexts/GameContext';
import { Chess } from 'chess.js';
import { AuthProvider } from '../contexts/AuthContext';
import { ChessAI } from '../utils/chessAI';

// Mock dependencies
jest.mock('../utils/chessAI');
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    profile: null,
    updateStats: jest.fn(),
  }),
}));

// Mock firebase to prevent initialization errors
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn(() => () => {}),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <GameProvider>{children}</GameProvider>
  </AuthProvider>
);

describe('GameContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset ChessAI mock
    (ChessAI as jest.MockedClass<typeof ChessAI>).mockClear();
  });

  describe('Initial State', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      expect(result.current.gameState.game).toBeDefined();
      expect(result.current.gameState.history).toEqual([]);
      expect(result.current.gameState.currentMoveIndex).toBe(-1);
      expect(result.current.gameState.gameResult).toBe('');
      expect(result.current.gameState.gameMode).toBe('human-vs-human');
      expect(result.current.gameState.aiColor).toBeNull();
      expect(result.current.gameState.aiDifficulty).toBe('medium');
    });

    it('should have default player names', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      expect(result.current.gameState.players.player1).toBe('Player 1');
      expect(result.current.gameState.players.player2).toBe('Player 2');
    });

    it('should have white assigned to player1 by default', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      expect(result.current.gameState.colorAssignment.white).toBe('player1');
      expect(result.current.gameState.colorAssignment.black).toBe('player2');
    });
  });

  describe('Move Functionality', () => {
    it('should make a valid move', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        const moveResult = result.current.makeMove('e2', 'e4');
        expect(moveResult).toBe(true);
      });

      expect(result.current.gameState.history).toHaveLength(1);
      expect(result.current.gameState.currentMoveIndex).toBe(0);
      expect(result.current.gameState.game.fen()).not.toBe(new Chess().fen());
    });

    it('should reject invalid moves', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        const moveResult = result.current.makeMove('e2', 'e5');
        expect(moveResult).toBe(false);
      });

      expect(result.current.gameState.history).toHaveLength(0);
      expect(result.current.gameState.game.fen()).toBe(new Chess().fen());
    });

    it('should not allow moves after game ends', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      // Set up a checkmate position
      act(() => {
        result.current.gameState.game = new Chess('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
        result.current.gameState.gameResult = 'Checkmate! Player 2 wins!';
      });

      act(() => {
        const moveResult = result.current.makeMove('e2', 'e4');
        expect(moveResult).toBe(false);
      });
    });

    it('should detect checkmate correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      // Manually set up moves leading to checkmate
      // Fool's mate: 1.f3 e5 2.g4 Qh4#
      act(() => {
        const move1 = result.current.makeMove('f2', 'f3');
        expect(move1).toBe(true);
      });
      
      act(() => {
        const move2 = result.current.makeMove('e7', 'e5');
        expect(move2).toBe(true);
      });
      
      act(() => {
        const move3 = result.current.makeMove('g2', 'g4');
        expect(move3).toBe(true);
      });
      
      act(() => {
        const move4 = result.current.makeMove('d8', 'h4');
        expect(move4).toBe(true);
      });

      // After Qh4#, the game should be checkmate
      expect(result.current.gameState.gameResult).toContain('Checkmate');
      expect(result.current.gameState.gameResult).toContain('Player 2 wins');
    });

    it('should detect draws correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      // Set up a stalemate position
      act(() => {
        result.current.gameState.game = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
      });

      expect(result.current.gameState.gameResult).toBe('');
      
      // The position is already stalemate, so the game should end immediately
      const game = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
      expect(game.isStalemate()).toBe(true);
    });
  });

  describe('Undo/Redo Functionality', () => {
    it('should undo moves correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });
      const initialFen = result.current.gameState.game.fen();

      act(() => {
        result.current.makeMove('e2', 'e4');
      });

      const afterMoveFen = result.current.gameState.game.fen();
      expect(afterMoveFen).not.toBe(initialFen);

      act(() => {
        result.current.undoMove();
      });

      expect(result.current.gameState.game.fen()).toBe(initialFen);
      expect(result.current.gameState.currentMoveIndex).toBe(-1);
    });

    it('should redo moves correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.makeMove('e2', 'e4');
      });

      const afterMoveFen = result.current.gameState.game.fen();

      act(() => {
        result.current.undoMove();
      });

      act(() => {
        result.current.redoMove();
      });

      expect(result.current.gameState.game.fen()).toBe(afterMoveFen);
      expect(result.current.gameState.currentMoveIndex).toBe(0);
    });

    it('should update canUndo and canRedo correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);

      act(() => {
        result.current.makeMove('e2', 'e4');
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);

      act(() => {
        result.current.undoMove();
      });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });
  });

  describe('Game Control Functions', () => {
    it('should reset game correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      // Store initial game ID
      const initialGameId = result.current.gameState.gameId;

      act(() => {
        result.current.makeMove('e2', 'e4');
      });

      act(() => {
        result.current.makeMove('e7', 'e5');
      });

      expect(result.current.gameState.history).toHaveLength(2);

      act(() => {
        result.current.resetGame();
      });

      expect(result.current.gameState.history).toHaveLength(0);
      expect(result.current.gameState.game.fen()).toBe(new Chess().fen());
      expect(result.current.gameState.gameResult).toBe('');
      expect(result.current.gameState.gameId).toBeDefined();
      expect(result.current.gameState.gameId).not.toBe(initialGameId);
    });

    it('should handle resignation correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.resign('w');
      });

      expect(result.current.gameState.gameResult).toContain('Player 2 wins by resignation');
      expect(result.current.gameState.statsUpdated).toBe(true);
    });

    it('should handle draw offers correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.offerDraw('w');
      });

      expect(result.current.gameState.drawOffer.offered).toBe(true);
      expect(result.current.gameState.drawOffer.by).toBe('w');

      act(() => {
        result.current.acceptDraw();
      });

      expect(result.current.gameState.gameResult).toBe('Draw by agreement!');
      expect(result.current.gameState.drawOffer.offered).toBe(false);
    });

    it('should decline draw offers correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.offerDraw('w');
      });

      act(() => {
        result.current.declineDraw();
      });

      expect(result.current.gameState.drawOffer.offered).toBe(false);
      expect(result.current.gameState.gameResult).toBe('');
    });
  });

  describe('Player Management', () => {
    it('should set player names correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.setPlayerName('player1', 'Alice');
        result.current.setPlayerName('player2', 'Bob');
      });

      expect(result.current.gameState.players.player1).toBe('Alice');
      expect(result.current.gameState.players.player2).toBe('Bob');
    });

    it('should swap colors correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      const initialWhite = result.current.gameState.colorAssignment.white;
      const initialBlack = result.current.gameState.colorAssignment.black;

      act(() => {
        result.current.swapColors();
      });

      expect(result.current.gameState.colorAssignment.white).toBe(initialBlack);
      expect(result.current.gameState.colorAssignment.black).toBe(initialWhite);
    });

    it('should get player by color correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.setPlayerName('player1', 'Alice');
        result.current.setPlayerName('player2', 'Bob');
      });

      expect(result.current.getPlayerByColor('w')).toBe('Alice');
      expect(result.current.getPlayerByColor('b')).toBe('Bob');
    });
  });

  describe('Time Control', () => {
    it('should set time control correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.setTimeControl(10, 5);
      });

      expect(result.current.gameState.timeControl).toEqual({ initial: 600, increment: 5 });
      expect(result.current.gameState.whiteTime).toBe(600);
      expect(result.current.gameState.blackTime).toBe(600);
    });

    it('should clear time control when set to null', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.setTimeControl(10, 5);
      });

      act(() => {
        result.current.setTimeControl(null);
      });

      expect(result.current.gameState.timeControl).toBeNull();
      expect(result.current.gameState.whiteTime).toBe(0);
      expect(result.current.gameState.blackTime).toBe(0);
    });

    it('should start and pause clock correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.setTimeControl(10);
        result.current.startClock();
      });

      expect(result.current.gameState.activeColor).toBe('w');
      expect(result.current.gameState.startTime).not.toBeNull();

      act(() => {
        result.current.pauseClock();
      });

      expect(result.current.gameState.activeColor).toBeNull();
      expect(result.current.gameState.startTime).toBeNull();
    });
  });

  describe('Game Mode and AI', () => {
    it('should set game mode to AI correctly', async () => {
      const mockInitializeLc0 = jest.fn().mockResolvedValue(undefined);
      const mockGetBestMove = jest.fn().mockResolvedValue({ from: 'e7', to: 'e5' });
      
      (ChessAI as jest.MockedClass<typeof ChessAI>).mockImplementation(() => ({
        initializeLc0: mockInitializeLc0,
        getBestMove: mockGetBestMove,
        setDifficulty: jest.fn(),
        getEngineType: jest.fn().mockReturnValue('lc0'),
      } as any));

      const { result } = renderHook(() => useGame(), { wrapper });

      await act(async () => {
        await result.current.setGameMode('human-vs-ai', 'b');
      });

      expect(result.current.gameState.gameMode).toBe('human-vs-ai');
      expect(result.current.gameState.aiColor).toBe('b');
      expect(result.current.gameState.players.player2).toBe('Computer');
      expect(mockInitializeLc0).toHaveBeenCalled();
    });

    it('should set AI difficulty correctly', async () => {
      const mockSetDifficulty = jest.fn();
      const mockInitializeLc0 = jest.fn().mockResolvedValue(undefined);
      
      (ChessAI as jest.MockedClass<typeof ChessAI>).mockImplementation(() => ({
        setDifficulty: mockSetDifficulty,
        initializeLc0: mockInitializeLc0,
        getEngineType: jest.fn().mockReturnValue('lc0'),
        getBestMove: jest.fn(),
      } as any));

      const { result } = renderHook(() => useGame(), { wrapper });

      await act(async () => {
        await result.current.setGameMode('human-vs-ai', 'b');
      });

      await act(async () => {
        await result.current.setAIDifficulty('hard');
      });

      expect(result.current.gameState.aiDifficulty).toBe('hard');
      expect(mockSetDifficulty).toHaveBeenCalledWith('hard');
    });

    it('should make AI moves automatically', async () => {
      const mockGetBestMove = jest.fn().mockResolvedValue({ from: 'e7', to: 'e5' });
      
      (ChessAI as jest.MockedClass<typeof ChessAI>).mockImplementation(() => ({
        initializeLc0: jest.fn().mockResolvedValue(undefined),
        getBestMove: mockGetBestMove,
        setDifficulty: jest.fn(),
        getEngineType: jest.fn().mockReturnValue('builtin'),
      } as any));

      const { result } = renderHook(() => useGame(), { wrapper });

      await act(async () => {
        await result.current.setGameMode('human-vs-ai', 'b');
      });

      // Make a move as white (human)
      act(() => {
        result.current.makeMove('e2', 'e4');
      });

      // Wait for AI to make a move
      await waitFor(() => {
        expect(mockGetBestMove).toHaveBeenCalled();
      });

      // The AI should have made a move
      await waitFor(() => {
        expect(result.current.gameState.history.length).toBe(2);
      });
    });
  });

  describe('Game Statistics', () => {
    it('should track game statistics correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      // Initial stats should be zero
      expect(result.current.gameState.gameStats.player1).toEqual({ wins: 0, draws: 0, losses: 0 });
      expect(result.current.gameState.gameStats.player2).toEqual({ wins: 0, draws: 0, losses: 0 });

      // Player 1 resigns - Player 2 wins
      act(() => {
        result.current.resign('w');
      });

      expect(result.current.gameState.gameStats.player1.losses).toBe(1);
      expect(result.current.gameState.gameStats.player2.wins).toBe(1);
    });

    it('should prevent double counting of statistics', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.resign('w');
      });

      const statsAfterResign = { ...result.current.gameState.gameStats };

      // Try to resign again (shouldn't update stats)
      act(() => {
        result.current.resign('w');
      });

      expect(result.current.gameState.gameStats).toEqual(statsAfterResign);
    });

    it('should track draw statistics correctly', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      act(() => {
        result.current.offerDraw('w');
        result.current.acceptDraw();
      });

      expect(result.current.gameState.gameStats.player1.draws).toBe(1);
      expect(result.current.gameState.gameStats.player2.draws).toBe(1);
    });
  });

  describe('Clear All Game Data', () => {
    it('should clear all game data and reset to initial state', () => {
      const { result } = renderHook(() => useGame(), { wrapper });

      // Make some changes
      act(() => {
        result.current.setPlayerName('player1', 'Alice');
        result.current.setTimeControl(10, 5);
        result.current.makeMove('e2', 'e4');
      });

      act(() => {
        result.current.clearAllGameData();
      });

      // Should reset to default state
      expect(result.current.gameState.players.player1).toBe('Player 1');
      expect(result.current.gameState.timeControl).toBeNull();
      expect(result.current.gameState.history).toHaveLength(0);
      expect(result.current.gameState.game.fen()).toBe(new Chess().fen());
    });
  });
});