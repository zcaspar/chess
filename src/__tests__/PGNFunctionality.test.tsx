/**
 * Comprehensive tests for PGN Generation and Parsing
 * Tests the fix for game replay move history display
 */

import { Chess } from 'chess.js';

describe('PGN Generation and Parsing', () => {
  describe('PGN Format Generation', () => {
    test('should generate PGN with proper move numbers', () => {
      const game = new Chess();

      // Play a few moves
      game.move('e4');
      game.move('e5');
      game.move('Nf3');
      game.move('Nc6');

      const pgn = game.pgn({ max_width: 0, newline_char: ' ' });

      // Should contain move numbers
      expect(pgn).toMatch(/1\./);
      expect(pgn).toMatch(/2\./);

      // Should be on a single line or well-formatted
      expect(pgn.length).toBeGreaterThan(10);
    });

    test('should handle games with many moves', () => {
      const game = new Chess();

      // Play 20 moves (10 full turns)
      const moves = [
        'e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6',
        'Nxc6', 'bxc6', 'Bd3', 'Be7', 'O-O', 'O-O', 'Nc3', 'd5',
        'exd5', 'cxd5', 'Bf4', 'c6'
      ];

      moves.forEach(move => game.move(move));

      const pgn = game.pgn({ max_width: 0, newline_char: ' ' });
      const history = game.history();

      // PGN should contain all moves
      expect(history.length).toBe(20);
      expect(pgn).toContain('1. e4');
      expect(pgn).toContain('9. exd5');
    });

    test('should generate parseable PGN', () => {
      const game = new Chess();

      // Play some moves
      game.move('e4');
      game.move('c5');
      game.move('Nf3');

      const pgn = game.pgn({ max_width: 0, newline_char: ' ' });

      // Should be able to parse it back
      const newGame = new Chess();
      newGame.loadPgn(pgn);

      expect(newGame.history()).toEqual(game.history());
    });
  });

  describe('PGN Parsing - Direct Load', () => {
    test('should parse standard PGN with headers', () => {
      const pgn = `[Event "Test Game"]
[White "Player 1"]
[Black "Player 2"]

1. e4 e5 2. Nf3 Nc6`;

      const game = new Chess();
      game.loadPgn(pgn);

      expect(game.history().length).toBe(4);
    });

    test('should parse PGN without headers', () => {
      const pgn = '1. e4 e5 2. Nf3 Nc6';

      const game = new Chess();
      game.loadPgn(pgn);

      expect(game.history().length).toBe(4);
    });

    test('should handle PGN with result markers', () => {
      const pgn = '1. e4 e5 2. Nf3 Nc6 1-0';

      const game = new Chess();
      game.loadPgn(pgn);

      expect(game.history().length).toBe(4);
    });
  });

  describe('PGN Parsing - With Auto-Generated Headers', () => {
    test('should parse moves-only PGN by adding headers', () => {
      const movesOnly = '1. d4 d5 2. c4 e6 3. Nc3 Nf6';

      // Simulate what the fix does
      const pgnWithHeaders = `[Event "Saved Game"]
[Site "Chess App"]
[Date "2025.01.20"]
[White "Player"]
[Black "Opponent"]
[Result "*"]

${movesOnly}`;

      const game = new Chess();
      game.loadPgn(pgnWithHeaders);

      expect(game.history().length).toBe(6);
    });

    test('should handle long games with auto-generated headers', () => {
      const moves = new Chess();

      // Create a longer game
      const moveSequence = [
        'e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6',
        'Nc3', 'a6', 'Be2', 'e5', 'Nb3', 'Be7', 'O-O', 'O-O'
      ];

      moveSequence.forEach(m => moves.move(m));

      const movesOnly = moves.pgn({ max_width: 0, newline_char: ' ' })
        .split('\n')
        .filter(line => !line.startsWith('['))
        .join(' ')
        .trim();

      // Add headers
      const pgnWithHeaders = `[Event "Test"]
[White "Player"]
[Black "Opponent"]
[Result "*"]

${movesOnly}`;

      const game = new Chess();
      game.loadPgn(pgnWithHeaders);

      expect(game.history().length).toBe(16);
    });
  });

  describe('PGN Parsing - Edge Cases', () => {
    test('should handle PGN with move numbers only on white moves', () => {
      const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5';

      const game = new Chess();
      game.loadPgn(pgn);

      expect(game.history().length).toBe(5);
    });

    test('should handle PGN with comments', () => {
      const pgn = '1. e4 {Best by test} e5 2. Nf3 Nc6';

      const game = new Chess();
      game.loadPgn(pgn);

      // Should still parse moves correctly
      expect(game.history().length).toBeGreaterThan(0);
    });

    test('should handle PGN with variations (may fail gracefully)', () => {
      const pgn = '1. e4 e5 (1... c5) 2. Nf3';

      const game = new Chess();

      // chess.js may or may not support variations
      // At minimum, it should not crash
      expect(() => game.loadPgn(pgn)).not.toThrow();
    });

    test('should handle empty PGN gracefully', () => {
      const game = new Chess();

      expect(() => game.loadPgn('')).not.toThrow();
    });
  });

  describe('Game Replay Scenarios', () => {
    test('should correctly replay a complete game', () => {
      const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O';

      const game = new Chess();
      game.loadPgn(pgn);

      const history = game.history({ verbose: true });

      // Should have correct number of moves
      expect(history.length).toBe(16);

      // Replay move by move
      const replayGame = new Chess();
      history.forEach((move, index) => {
        const result = replayGame.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion
        });

        expect(result).not.toBeNull();
        expect(result?.san).toBe(move.san);
      });

      // Final positions should match
      expect(replayGame.fen()).toBe(game.fen());
    });

    test('should handle game with checkmate', () => {
      const game = new Chess();

      // Fool's mate
      game.move('f3');
      game.move('e5');
      game.move('g4');
      game.move('Qh4#');

      const pgn = game.pgn();
      const history = game.history({ verbose: true });

      // Should recognize checkmate
      expect(game.isCheckmate()).toBe(true);
      expect(history.length).toBe(4);
      expect(history[3].san).toBe('Qh4#');

      // Should be parseable
      const newGame = new Chess();
      newGame.loadPgn(pgn);
      expect(newGame.isCheckmate()).toBe(true);
    });

    test('should handle game with castling', () => {
      const game = new Chess();

      // Setup for castling
      game.move('e4');
      game.move('e5');
      game.move('Nf3');
      game.move('Nc6');
      game.move('Bc4');
      game.move('Bc5');
      game.move('O-O'); // White castles

      const pgn = game.pgn();

      // Should preserve castling notation
      expect(pgn).toContain('O-O');

      // Should be parseable
      const newGame = new Chess();
      newGame.loadPgn(pgn);
      expect(newGame.history().length).toBe(7);
    });

    test('should handle game with pawn promotion', () => {
      // FEN with pawn about to promote
      const game = new Chess('8/P7/8/8/8/8/8/K6k w - - 0 1');

      game.move('a8=Q'); // Promote to queen

      const history = game.history({ verbose: true });

      expect(history[0].promotion).toBe('q');
      expect(history[0].san).toContain('a8=Q');
    });
  });

  describe('PGN Round-Trip (Generate -> Parse -> Generate)', () => {
    test('should maintain consistency through round-trip', () => {
      const game1 = new Chess();

      // Play a game
      const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'];
      moves.forEach(m => game1.move(m));

      // Generate PGN
      const pgn1 = game1.pgn({ max_width: 0, newline_char: ' ' });

      // Parse it
      const game2 = new Chess();
      game2.loadPgn(pgn1);

      // History should be identical
      expect(game1.history()).toEqual(game2.history());

      // Positions should be identical
      expect(game1.fen()).toBe(game2.fen());
    });
  });

  describe('Integration: Game History Save Format', () => {
    test('should mimic actual game save format', () => {
      // Simulate what gets saved to database
      const game = new Chess();

      // Play a game
      const testMoves = ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7'];
      testMoves.forEach(m => game.move(m));

      // Generate PGN like the app does
      const pgn = game.pgn({ max_width: 0, newline_char: ' ' });

      // Extract moves (remove headers)
      const lines = pgn.split('\n');
      const moveLines = lines.filter(line =>
        line.trim() &&
        !line.startsWith('[') &&
        !line.endsWith(']')
      );
      const cleanPgn = moveLines.join(' ').trim();

      // This is what gets stored
      expect(cleanPgn.length).toBeGreaterThan(0);

      // Should be parseable when we add headers back
      const pgnWithHeaders = `[Event "Test"]
[White "Player"]
[Black "Opponent"]
[Result "*"]

${cleanPgn}`;

      const replayGame = new Chess();
      replayGame.loadPgn(pgnWithHeaders);

      expect(replayGame.history().length).toBe(8);
    });

    test('should handle game history object structure', () => {
      const game = new Chess();

      // Simulate a complete game
      game.move('e4');
      game.move('e5');
      game.move('Qh5');
      game.move('Nc6');
      game.move('Bc4');
      game.move('Nf6');

      // Create game history object like in the app
      const gameHistoryData = {
        gameId: 'test-123',
        opponentName: 'Test Opponent',
        playerColor: 'w' as const,
        gameResult: 'Game in progress',
        gameOutcome: 'draw' as const,
        finalFen: game.fen(),
        pgn: game.pgn({ max_width: 0, newline_char: ' ' }),
        moveCount: game.history().length,
        gameMode: 'human-vs-human' as const,
        createdAt: new Date().toISOString()
      };

      // Verify structure
      expect(gameHistoryData.moveCount).toBe(6);
      expect(gameHistoryData.pgn).toBeTruthy();
      expect(gameHistoryData.finalFen).toBeTruthy();

      // Should be replayable
      const replayGame = new Chess();
      replayGame.loadPgn(gameHistoryData.pgn);
      expect(replayGame.history().length).toBe(6);
    });
  });
});

describe('GameReplay Component Logic', () => {
  test('should extract moves from PGN correctly', () => {
    const testPgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5';

    const game = new Chess();
    game.loadPgn(testPgn);

    const history = game.history({ verbose: true });

    expect(history.length).toBe(5);
    expect(history[0].san).toBe('e4');
    expect(history[1].san).toBe('e5');
    expect(history[4].san).toBe('Bb5');
  });

  test('should create move pairs for display', () => {
    const game = new Chess();

    game.move('e4');
    game.move('e5');
    game.move('Nf3');
    game.move('Nc6');

    const history = game.history();

    // Create move pairs like the UI does
    const movePairs = [];
    for (let i = 0; i < history.length; i += 2) {
      movePairs.push({
        white: history[i],
        black: history[i + 1],
        moveNumber: Math.floor(i / 2) + 1
      });
    }

    expect(movePairs.length).toBe(2);
    expect(movePairs[0]).toEqual({
      white: 'e4',
      black: 'e5',
      moveNumber: 1
    });
    expect(movePairs[1]).toEqual({
      white: 'Nf3',
      black: 'Nc6',
      moveNumber: 2
    });
  });

  test('should handle odd number of moves', () => {
    const game = new Chess();

    game.move('e4');
    game.move('e5');
    game.move('Nf3');

    const history = game.history();

    const movePairs = [];
    for (let i = 0; i < history.length; i += 2) {
      movePairs.push({
        white: history[i],
        black: history[i + 1],
        moveNumber: Math.floor(i / 2) + 1
      });
    }

    expect(movePairs.length).toBe(2);
    expect(movePairs[1].white).toBe('Nf3');
    expect(movePairs[1].black).toBeUndefined();
  });

  test('should apply moves sequentially for replay', () => {
    const originalGame = new Chess();

    // Original game
    originalGame.move('e4');
    originalGame.move('e5');
    originalGame.move('Nf3');

    const history = originalGame.history({ verbose: true });

    // Replay
    const replayGame = new Chess();
    let currentMoveIndex = -1;

    // Apply first move
    currentMoveIndex = 0;
    replayGame.move({
      from: history[0].from,
      to: history[0].to,
      promotion: history[0].promotion
    });

    expect(replayGame.history().length).toBe(1);

    // Apply second move
    currentMoveIndex = 1;
    replayGame.move({
      from: history[1].from,
      to: history[1].to,
      promotion: history[1].promotion
    });

    expect(replayGame.history().length).toBe(2);
  });
});
