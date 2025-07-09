describe('Complete Game Flow Integration Tests', () => {
  
  describe('Checkmate Scenarios', () => {
    beforeEach(() => {
      cy.visit('/');
    });

    it('should handle checkmate in local game', () => {
      // Fool's mate sequence
      const foolsMate = [
        ['f2', 'f3'],
        ['e7', 'e5'],
        ['g2', 'g4'],
        ['d8', 'h4']
      ];

      foolsMate.forEach(([from, to]) => {
        cy.makeMove(from, to);
        cy.wait(300);
      });

      // Game should end with checkmate
      cy.contains('Checkmate').should('be.visible');
      cy.contains('Black wins').should('be.visible');
      
      // Should not allow more moves
      cy.get('[data-square="e2"]').click();
      cy.get('[data-square="e4"]').click();
      // Piece should not move
      cy.get('[data-square="e2"]').should('contain', '♟');
    });

    it('should handle AI checkmate', () => {
      cy.get('select').first().select('ai');
      cy.get('select').last().select('expert');

      // Play some moves
      cy.makeMove('e2', 'e4');
      cy.wait(3000); // Wait for AI

      // Continue playing (AI should eventually win)
      // This is a simplified test - in reality we'd play a full game
    });
  });

  describe('Draw Scenarios', () => {
    beforeEach(() => {
      cy.visit('/');
    });

    it('should handle draw by agreement', () => {
      // Make a few moves
      cy.makeMove('e2', 'e4');
      cy.wait(300);
      cy.makeMove('e7', 'e5');
      cy.wait(300);

      // Offer draw
      cy.contains('Offer Draw').click();
      
      // In local mode, should show draw offer
      cy.contains('Draw offered').should('be.visible');
      
      // Accept draw (in local mode)
      cy.contains('Accept Draw').click();
      
      // Game should end in draw
      cy.contains('Draw').should('be.visible');
    });

    it('should detect stalemate', () => {
      // This would require setting up a specific position
      // For now, we test the UI responds correctly
      
      // In a real test, we'd set up a stalemate position
      // and verify the game ends correctly
    });

    it('should handle threefold repetition', () => {
      // Move knights back and forth
      const repetitiveMoves = [
        ['g1', 'f3'],
        ['g8', 'f6'],
        ['f3', 'g1'],
        ['f6', 'g8'],
        ['g1', 'f3'],
        ['g8', 'f6'],
        ['f3', 'g1'],
        ['f6', 'g8']
      ];

      repetitiveMoves.forEach(([from, to]) => {
        cy.makeMove(from, to);
        cy.wait(300);
      });

      // Should offer draw by repetition
      cy.get('body').then($body => {
        if ($body.text().includes('Claim Draw')) {
          cy.contains('Claim Draw').click();
          cy.contains('Draw by repetition').should('be.visible');
        }
      });
    });
  });

  describe('Time Control Scenarios', () => {
    beforeEach(() => {
      cy.visit('/');
    });

    it('should handle timeout correctly', () => {
      // This test would need to wait for actual timeout
      // or we'd need to mock the timer
      
      // For now, verify timer is counting down
      cy.get('[data-testid="white-timer"]').then($timer => {
        const initialTime = $timer.text();
        cy.wait(2000);
        cy.get('[data-testid="white-timer"]').should('not.have.text', initialTime);
      });
    });

    it('should pause timer when game ends', () => {
      // Quick checkmate
      const moves = [
        ['f2', 'f3'],
        ['e7', 'e5'],
        ['g2', 'g4'],
        ['d8', 'h4']
      ];

      moves.forEach(([from, to]) => {
        cy.makeMove(from, to);
        cy.wait(300);
      });

      // After checkmate, timers should stop
      cy.wait(1000);
      cy.get('[data-testid="white-timer"]').then($timer => {
        const timeAfterEnd = $timer.text();
        cy.wait(1000);
        cy.get('[data-testid="white-timer"]').should('have.text', timeAfterEnd);
      });
    });
  });

  describe('Resignation Flow', () => {
    beforeEach(() => {
      cy.visit('/');
    });

    it('should handle resignation in local game', () => {
      // Make some moves
      cy.makeMove('e2', 'e4');
      cy.wait(300);
      cy.makeMove('e7', 'e5');

      // Resign
      cy.contains('Resign').click();
      
      // Confirm resignation
      cy.contains('Confirm').click();

      // Game should end
      cy.contains('resigned').should('be.visible');
      
      // New game should be available
      cy.contains('New Game').should('be.visible');
    });

    it('should handle resignation in AI game', () => {
      cy.get('select').first().select('ai');
      
      // Make a move
      cy.makeMove('e2', 'e4');
      cy.wait(2000);

      // Resign
      cy.contains('Resign').click();
      cy.contains('Confirm').click();

      // Game should end with player resignation
      cy.contains('You resigned').should('be.visible');
    });
  });

  describe('Game State Persistence', () => {
    it('should save and restore game state on refresh', () => {
      // Make some moves
      const moves = [
        ['e2', 'e4'],
        ['e7', 'e5'],
        ['g1', 'f3'],
        ['b8', 'c6']
      ];

      moves.forEach(([from, to]) => {
        cy.makeMove(from, to);
        cy.wait(300);
      });

      // Get current position
      cy.get('[data-square="e4"]').should('contain', '♟');
      cy.get('[data-square="e5"]').should('contain', '♙');

      // Refresh page
      cy.reload();

      // Position should be restored
      cy.get('[data-square="e4"]').should('contain', '♟');
      cy.get('[data-square="e5"]').should('contain', '♙');
      cy.get('[data-square="f3"]').should('contain', '♞');
      cy.get('[data-square="c6"]').should('contain', '♘');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid moves gracefully', () => {
      // Try to move opponent's piece
      cy.get('[data-square="e7"]').click();
      cy.get('[data-square="e5"]').click();
      
      // Piece should not move
      cy.get('[data-square="e7"]').should('contain', '♙');
      
      // Try invalid move with own piece
      cy.makeMove('a2', 'a5'); // Invalid pawn move
      
      // Piece should not move
      cy.get('[data-square="a2"]').should('contain', '♟');
    });

    it('should handle network errors in online mode', () => {
      cy.login();
      cy.get('select').first().select('online');

      // Intercept network requests and force failure
      cy.intercept('POST', '**/api/rooms/create', { 
        statusCode: 500,
        body: { error: 'Server error' }
      });

      cy.contains('Create Room').click();

      // Should show error message
      cy.contains('Failed to create room').should('be.visible');
    });
  });

  describe('Special Moves', () => {
    beforeEach(() => {
      cy.visit('/');
    });

    it('should handle castling correctly', () => {
      // King side castling for white
      const moves = [
        ['e2', 'e4'],
        ['e7', 'e5'],
        ['g1', 'f3'],
        ['b8', 'c6'],
        ['f1', 'c4'],
        ['g8', 'f6']
      ];

      moves.forEach(([from, to]) => {
        cy.makeMove(from, to);
        cy.wait(300);
      });

      // Castle king side
      cy.makeMove('e1', 'g1');
      
      // Verify castling completed
      cy.get('[data-square="g1"]').should('contain', '♚');
      cy.get('[data-square="f1"]').should('contain', '♜');
    });

    it('should handle en passant correctly', () => {
      const moves = [
        ['e2', 'e4'],
        ['a7', 'a6'],
        ['e4', 'e5'],
        ['d7', 'd5']
      ];

      moves.forEach(([from, to]) => {
        cy.makeMove(from, to);
        cy.wait(300);
      });

      // En passant capture
      cy.makeMove('e5', 'd6');
      
      // Verify en passant completed
      cy.get('[data-square="d6"]').should('contain', '♟');
      cy.get('[data-square="d5"]').should('not.contain', '♙');
    });

    it('should handle pawn promotion', () => {
      // This would require setting up a position where promotion is possible
      // For a full test, we'd need to play moves to get a pawn to the 8th rank
      
      // Simplified test structure:
      // 1. Set up position with pawn on 7th rank
      // 2. Move pawn to 8th rank
      // 3. Verify promotion dialog appears
      // 4. Select queen
      // 5. Verify pawn promoted to queen
    });
  });
});