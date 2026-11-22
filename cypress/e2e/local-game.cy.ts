// A visitor who has not signed in plays on one device. Everything here runs
// against the built app with no backend and no account.

describe('playing a local game', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('[data-square="e2"]').should('be.visible');
  });

  it('starts from the standard position', () => {
    cy.pieceOn('e1', 'wK');
    cy.pieceOn('d8', 'bQ');
    cy.pieceOn('a2', 'wP');
    cy.pieceOn('h7', 'bP');
    cy.pieceOn('e4', null);
    cy.contains('No moves yet').should('be.visible');
  });

  it('plays moves for both sides and lists them', () => {
    cy.playMoves(['e2e4', 'e7e5', 'g1f3', 'b8c6']);

    cy.pieceOn('e4', 'wP');
    cy.pieceOn('e5', 'bP');
    cy.pieceOn('f3', 'wN');
    cy.pieceOn('c6', 'bN');
    cy.moveList().within(() => {
      ['e4', 'e5', 'Nf3', 'Nc6'].forEach((san) => cy.contains('td', san).should('exist'));
    });
  });

  it('refuses an illegal move and a move out of turn', () => {
    // A pawn cannot jump three squares.
    cy.get('[data-square="e2"]').click();
    cy.get('[data-square="e5"]').click();
    cy.pieceOn('e2', 'wP');
    cy.pieceOn('e5', null);

    // It is White's turn: Black's pieces do not move.
    cy.get('[data-square="e7"]').click();
    cy.get('[data-square="e5"]').click();
    cy.pieceOn('e7', 'bP');
  });

  it('takes a move back and plays it again', () => {
    cy.playMoves(['e2e4']);

    cy.contains('button', 'Undo').click();
    cy.pieceOn('e2', 'wP');
    cy.pieceOn('e4', null);

    cy.contains('button', 'Redo').click();
    cy.pieceOn('e4', 'wP');
  });

  it('announces checkmate and offers a review', () => {
    cy.playMoves(['f2f3', 'e7e5', 'g2g4', 'd8h4']); // fool's mate

    cy.contains('h2', 'Checkmate!').should('be.visible');
    cy.contains('button', 'Review').should('be.visible');

    // The game is over: nothing more can be played.
    cy.contains('button', 'Review').click();
    cy.contains('h1', 'Game Review').should('be.visible');
  });

  it('starts a fresh game from the game-over screen', () => {
    cy.playMoves(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    cy.contains('h2', 'Checkmate!').should('be.visible');

    // The game-over dialog has its own New Game button.
    cy.contains('h2', 'Checkmate!').parent().contains('button', 'New Game').click();

    cy.pieceOn('f2', 'wP');
    cy.pieceOn('d8', 'bQ');
    cy.contains('No moves yet').should('be.visible');
  });

  it('resigns for the side to move', () => {
    cy.playMoves(['e2e4']);

    cy.contains('button', 'Resign').click();

    cy.contains('h2', 'Resigned').should('be.visible');
  });
});
