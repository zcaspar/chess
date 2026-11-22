/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      /** Play a move by clicking the piece, then its destination. */
      makeMove(from: string, to: string): Chainable<void>;
      /** Play a list of moves written as "e2e4". */
      playMoves(moves: string[]): Chainable<void>;
      /** Assert which piece ("wP", "bQ", ...) stands on a square, or that it is empty. */
      pieceOn(square: string, piece: string | null): Chainable<void>;
      /** The move list card that is on screen. */
      moveList(): Chainable<JQuery<HTMLElement>>;
    }
  }
}

const square = (name: string) => `[data-square="${name}"]`;

Cypress.Commands.add('pieceOn', (name: string, piece: string | null) => {
  if (piece) {
    cy.get(`${square(name)} [data-piece="${piece}"]`).should('exist');
  } else {
    cy.get(`${square(name)} [data-piece]`).should('not.exist');
  }
});

Cypress.Commands.add('moveList', () =>
  cy.contains('h3:visible', 'Move History').parent().parent(),
);

Cypress.Commands.add('makeMove', (from: string, to: string) => {
  cy.get(square(from)).click();
  cy.get(square(to)).click();
  // The move has landed once the piece has left its starting square. Waiting
  // on that, rather than a fixed delay, keeps a fast run from clicking the
  // next piece while the board is still animating the last one.
  cy.get(`${square(from)} [data-piece]`).should('not.exist');
});

Cypress.Commands.add('playMoves', (moves: string[]) => {
  moves.forEach((move) => cy.makeMove(move.slice(0, 2), move.slice(2, 4)));
});

export {};
