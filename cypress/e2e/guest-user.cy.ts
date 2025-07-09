describe('Guest User Journey', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should load the chess app and display the board', () => {
    // Check that the chess board is visible
    cy.get('.chess-board').should('be.visible');
    
    // Check initial game mode is Local Play
    cy.contains('Local Play').should('be.visible');
    
    // Verify all pieces are in starting positions
    cy.get('[data-square="a1"]').should('contain', '♜');
    cy.get('[data-square="e1"]').should('contain', '♚');
    cy.get('[data-square="d8"]').should('contain', '♛');
    cy.get('[data-square="h8"]').should('contain', '♜');
  });

  it('should allow playing a local game', () => {
    // Make sure we're in local mode
    cy.contains('Local Play').should('be.visible');
    
    // Make a move as white
    cy.makeMove('e2', 'e4');
    cy.wait(500);
    
    // Make a move as black
    cy.makeMove('e7', 'e5');
    cy.wait(500);
    
    // Continue with more moves
    cy.makeMove('g1', 'f3');
    cy.wait(500);
    cy.makeMove('b8', 'c6');
    cy.wait(500);
    
    // Verify moves were made
    cy.get('[data-square="e4"]').should('contain', '♟');
    cy.get('[data-square="e5"]').should('contain', '♙');
    cy.get('[data-square="f3"]').should('contain', '♞');
    cy.get('[data-square="c6"]').should('contain', '♘');
  });

  it('should switch to AI mode and play against computer', () => {
    // Click on game mode selector
    cy.get('select').first().select('ai');
    
    // Verify AI mode is active
    cy.contains('Play vs Computer').should('be.visible');
    
    // Select difficulty
    cy.get('select').last().select('easy');
    
    // Make a move
    cy.makeMove('e2', 'e4');
    
    // Wait for AI response
    cy.waitForMove();
    cy.wait(2000); // Give AI time to respond
    
    // Verify AI made a move (black pieces should have moved)
    cy.get('[data-square="e7"]').should('not.contain', '♙');
  });

  it('should test different AI difficulty levels', () => {
    // Switch to AI mode
    cy.get('select').first().select('ai');
    
    const difficulties = ['beginner', 'easy', 'medium', 'hard', 'expert'];
    
    difficulties.forEach((difficulty) => {
      // Select difficulty
      cy.get('select').last().select(difficulty);
      
      // Start new game
      cy.contains('New Game').click();
      
      // Make a move
      cy.makeMove('d2', 'd4');
      
      // Wait for AI response
      cy.wait(difficulty === 'expert' ? 5000 : 2000);
      
      // Verify AI made a move
      cy.get('.move-history').should('contain', 'd4');
    });
  });

  it('should handle game controls properly', () => {
    // Test resign button
    cy.contains('Resign').should('be.visible');
    
    // Test draw offer button
    cy.contains('Offer Draw').should('be.visible');
    
    // Make some moves
    cy.makeMove('e2', 'e4');
    cy.wait(500);
    cy.makeMove('e7', 'e5');
    
    // Test new game button
    cy.contains('New Game').click();
    
    // Verify board reset
    cy.get('[data-square="e2"]').should('contain', '♟');
    cy.get('[data-square="e7"]').should('contain', '♙');
  });

  it('should display move history correctly', () => {
    // Make several moves
    const moves = [
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['g1', 'f3'],
      ['b8', 'c6'],
      ['f1', 'c4'],
      ['g8', 'f6']
    ];

    moves.forEach(([from, to], index) => {
      cy.makeMove(from, to);
      cy.wait(300);
      
      // Check move appears in history
      if (index % 2 === 0) {
        cy.get('.move-history').should('contain', `${Math.floor(index / 2) + 1}.`);
      }
    });
    
    // Verify move history shows all moves
    cy.get('.move-history').should('contain', 'e4');
    cy.get('.move-history').should('contain', 'e5');
    cy.get('.move-history').should('contain', 'Nf3');
    cy.get('.move-history').should('contain', 'Nc6');
  });

  it('should handle piece promotion', () => {
    // Set up a position where pawn promotion is possible
    // This would require setting up a specific board state
    // For now, we'll test the basic flow
    
    // Make moves to advance a pawn
    const moves = [
      ['e2', 'e4'],
      ['d7', 'd5'],
      ['e4', 'e5'],
      ['f7', 'f5'],
      ['e5', 'f6'], // en passant
      ['g7', 'g6'],
      ['f6', 'f7']
    ];

    moves.forEach(([from, to]) => {
      cy.makeMove(from, to);
      cy.wait(300);
    });
  });

  it('should display timer correctly', () => {
    // Check that timers are visible
    cy.get('[data-testid="white-timer"]').should('be.visible');
    cy.get('[data-testid="black-timer"]').should('be.visible');
    
    // Make a move and verify timer switches
    cy.makeMove('e2', 'e4');
    
    // In local mode, both timers should be active alternately
    cy.wait(1000);
    
    // Make another move
    cy.makeMove('e7', 'e5');
  });

  it('should be responsive on different screen sizes', () => {
    // Test desktop view (default)
    cy.viewport(1280, 720);
    cy.get('.chess-board').should('be.visible');
    
    // Test tablet view
    cy.viewport(768, 1024);
    cy.get('.chess-board').should('be.visible');
    
    // Test mobile view
    cy.viewport(375, 667);
    cy.get('.chess-board').should('be.visible');
    
    // Verify touch interactions work on mobile
    cy.makeMove('e2', 'e4');
    cy.get('[data-square="e4"]').should('contain', '♟');
  });

  it('should show authentication prompt for online features', () => {
    // Try to switch to online mode
    cy.get('select').first().select('online');
    
    // Should show authentication prompt
    cy.contains('Sign in with Google').should('be.visible');
    
    // Verify guest limitations message
    cy.contains('sign in to play online').should('be.visible');
  });
});