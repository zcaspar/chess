/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      getBySel(dataTestAttribute: string): Chainable<JQuery<HTMLElement>>;
      getBySelLike(dataTestPrefixAttribute: string): Chainable<JQuery<HTMLElement>>;
      login(): Chainable<void>;
      makeMove(from: string, to: string): Chainable<void>;
      waitForMove(): Chainable<void>;
      checkGameStatus(status: string): Chainable<void>;
    }
  }
}

// Custom command to select DOM element by data-cy attribute
Cypress.Commands.add('getBySel', (selector) => {
  return cy.get(`[data-cy=${selector}]`);
});

// Custom command to select DOM elements by data-cy attribute prefix
Cypress.Commands.add('getBySelLike', (selector) => {
  return cy.get(`[data-cy*=${selector}]`);
});

// Mock login command for testing
Cypress.Commands.add('login', () => {
  // Mock Firebase authentication
  cy.window().then((win) => {
    // Simulate logged in user
    win.localStorage.setItem('mockAuth', JSON.stringify({
      uid: 'test-user-123',
      email: 'test@example.com',
      displayName: 'Test User'
    }));
  });
});

// Command to make a chess move
Cypress.Commands.add('makeMove', (from: string, to: string) => {
  cy.get(`[data-square="${from}"]`).click();
  cy.get(`[data-square="${to}"]`).click();
});

// Command to wait for AI/opponent move
Cypress.Commands.add('waitForMove', () => {
  cy.wait(1000); // Wait for move animation
});

// Command to check game status
Cypress.Commands.add('checkGameStatus', (status: string) => {
  cy.contains(status).should('be.visible');
});

export {};