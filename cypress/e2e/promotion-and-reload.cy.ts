// Two things that used to be silently wrong: every promotion became a queen,
// and reloading the page threw the game away.

// White's a-pawn walks to b7, with the a8 rook there to be captured.
const TO_THE_SEVENTH = ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6b7', 'b8c6'];

describe('promotion', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('[data-square="e2"]').should('be.visible');
    cy.playMoves(TO_THE_SEVENTH);
    cy.pieceOn('b7', 'wP');
  });

  it('asks which piece to promote to, and plays nothing until one is chosen', () => {
    cy.get('[data-square="b7"]').click();
    cy.get('[data-square="a8"]').click();

    cy.get('[role="dialog"][aria-label="Choose a piece to promote to"]').should('be.visible');
    ['Queen', 'Rook', 'Bishop', 'Knight'].forEach((name) =>
      cy.get(`button[aria-label="${name}"]`).should('be.visible'),
    );
    cy.pieceOn('b7', 'wP');
    cy.pieceOn('a8', 'bR');
  });

  it('promotes to the piece that was chosen', () => {
    cy.get('[data-square="b7"]').click();
    cy.get('[data-square="a8"]').click();
    cy.get('button[aria-label="Knight"]').click();

    cy.pieceOn('a8', 'wN');
    cy.pieceOn('b7', null);
    cy.get('[role="dialog"]').should('not.exist');
    cy.contains('bxa8=N').should('exist');
  });

  it('leaves the pawn where it is when the choice is cancelled', () => {
    cy.get('[data-square="b7"]').click();
    cy.get('[data-square="a8"]').click();
    cy.get('[role="dialog"]').should('be.visible');

    cy.get('body').type('{esc}');

    cy.get('[role="dialog"]').should('not.exist');
    cy.pieceOn('b7', 'wP');
    cy.pieceOn('a8', 'bR');
  });
});

describe('reloading the page', () => {
  it('brings the game in progress back, and it can be carried on', () => {
    cy.visit('/');
    cy.get('[data-square="e2"]').should('be.visible');
    cy.playMoves(['e2e4', 'e7e5', 'g1f3']);

    cy.reload();

    cy.pieceOn('e4', 'wP');
    cy.pieceOn('e5', 'bP');
    cy.pieceOn('f3', 'wN');
    cy.pieceOn('g1', null);
    cy.contains('Nf3').should('exist');

    // Black to move, as it was before the reload.
    cy.playMoves(['b8c6']);
    cy.pieceOn('c6', 'bN');
  });

  it('does not bring back a game that had finished', () => {
    cy.visit('/');
    cy.get('[data-square="e2"]').should('be.visible');
    cy.playMoves(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    cy.contains('h2', 'Checkmate!').should('be.visible');

    cy.reload();

    cy.pieceOn('f2', 'wP');
    cy.pieceOn('d8', 'bQ');
    cy.contains('No moves yet').should('be.visible');
  });
});
