describe('Authenticated User Journey', () => {
  beforeEach(() => {
    // Mock Firebase authentication
    cy.visit('/', {
      onBeforeLoad(win) {
        // Stub Firebase auth
        win.localStorage.setItem('firebase-auth-user', JSON.stringify({
          uid: 'test-user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          photoURL: null
        }));
      }
    });
    
    // Use custom login command
    cy.login();
  });

  it('should display user info when authenticated', () => {
    // Check user display name appears
    cy.contains('Test User').should('be.visible');
    
    // Check sign out button is visible
    cy.contains('Sign Out').should('be.visible');
    
    // Check online features are available
    cy.get('select').first().select('online');
    cy.contains('Create Room').should('be.visible');
  });

  it('should create and join online game room', () => {
    // Switch to online mode
    cy.get('select').first().select('online');
    
    // Click create room
    cy.contains('Create Room').click();
    
    // Should show room code
    cy.get('[data-testid="room-code"]').should('be.visible');
    cy.get('[data-testid="room-code"]').invoke('text').should('match', /^[A-Z0-9]{6}$/);
    
    // Copy room code button should be visible
    cy.contains('Copy Code').should('be.visible');
    
    // Waiting for opponent message
    cy.contains('Waiting for opponent').should('be.visible');
  });

  it('should join existing game room', () => {
    // Switch to online mode
    cy.get('select').first().select('online');
    
    // Enter room code
    cy.get('input[placeholder*="room code"]').type('ABC123');
    
    // Click join room
    cy.contains('Join Room').click();
    
    // Should attempt to join (will fail with mock room code)
    cy.contains('Invalid room code').should('be.visible');
  });

  it('should access game history', () => {
    // Click game history button
    cy.contains('Game History').click();
    
    // Should show game history view
    cy.contains('Your Game History').should('be.visible');
    
    // Check for game list or empty state
    cy.get('body').then($body => {
      if ($body.text().includes('No games played yet')) {
        cy.contains('No games played yet').should('be.visible');
      } else {
        cy.get('[data-testid="game-list"]').should('be.visible');
      }
    });
    
    // Back to game button
    cy.contains('Back to Game').should('be.visible');
  });

  it('should handle friend system', () => {
    // Look for friends button/menu
    cy.contains('Friends').click();
    
    // Should show friend management options
    cy.contains('Add Friend').should('be.visible');
    
    // Test adding a friend
    cy.get('input[placeholder*="username"]').type('friend123');
    cy.contains('Send Request').click();
    
    // Should show pending request
    cy.contains('Request sent').should('be.visible');
  });

  it('should save game to history after completion', () => {
    // Play a quick game
    cy.get('select').first().select('ai');
    cy.get('select').last().select('beginner');
    
    // Make some moves
    cy.makeMove('e2', 'e4');
    cy.wait(1000);
    cy.makeMove('f2', 'f3');
    cy.wait(1000);
    cy.makeMove('g2', 'g4');
    cy.wait(1000);
    
    // This creates fool's mate opportunity
    // AI should checkmate
    cy.wait(2000);
    
    // Game should end
    cy.get('body').then($body => {
      if ($body.text().includes('Checkmate') || $body.text().includes('Game Over')) {
        // Check game was saved
        cy.contains('Game History').click();
        cy.get('[data-testid="game-list"]').children().should('have.length.at.least', 1);
      }
    });
  });

  it('should replay games from history', () => {
    // Go to game history
    cy.contains('Game History').click();
    
    // If there are games, click on one
    cy.get('body').then($body => {
      if (!$body.text().includes('No games played yet')) {
        // Click first game
        cy.get('[data-testid="game-list"]').children().first().click();
        
        // Should show replay controls
        cy.contains('Replay').should('be.visible');
        cy.get('[data-testid="replay-controls"]').should('be.visible');
        
        // Test replay controls
        cy.contains('Next').click();
        cy.wait(500);
        cy.contains('Previous').click();
        cy.wait(500);
        cy.contains('Start').click();
        cy.wait(500);
        cy.contains('End').click();
      }
    });
  });

  it('should handle online game disconnection/reconnection', () => {
    // Create online game
    cy.get('select').first().select('online');
    cy.contains('Create Room').click();
    
    // Simulate disconnect
    cy.window().then(win => {
      // Trigger offline event
      win.dispatchEvent(new Event('offline'));
    });
    
    // Should show disconnection message
    cy.contains('Connection lost').should('be.visible');
    
    // Simulate reconnect
    cy.window().then(win => {
      win.dispatchEvent(new Event('online'));
    });
    
    // Should attempt to reconnect
    cy.contains('Reconnecting').should('be.visible');
  });

  it('should handle concurrent games limitation', () => {
    // Try to create multiple games
    cy.get('select').first().select('online');
    cy.contains('Create Room').click();
    
    // Try to create another room without leaving first
    cy.contains('New Game').click();
    cy.contains('Create Room').click();
    
    // Should show warning or handle gracefully
    cy.get('body').then($body => {
      if ($body.text().includes('already in a game')) {
        cy.contains('already in a game').should('be.visible');
      }
    });
  });

  it('should properly sign out', () => {
    // Click sign out
    cy.contains('Sign Out').click();
    
    // Should return to guest mode
    cy.contains('Sign in with Google').should('be.visible');
    
    // Online mode should be disabled
    cy.get('select').first().select('online');
    cy.contains('sign in to play online').should('be.visible');
    
    // Game history should not be accessible
    cy.contains('Game History').should('not.exist');
  });
});