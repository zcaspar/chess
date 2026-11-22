// The engine in the browser: reviewing a finished game, and standing in as the
// computer opponent when the engine server cannot be reached (it never can be
// in this test run — there is no backend).

// Morphy's "Opera Game", 1858: 17 moves, ending in mate. Black's 9...b5 is the
// losing mistake every engine agrees on.
const OPERA_GAME = (
  'e2e4 e7e5 g1f3 d7d6 d2d4 c8g4 d4e5 g4f3 d1f3 d6e5 f1c4 g8f6 f3b3 d8e7 b1c3 c7c6 ' +
  'c1g5 b7b5 c3b5 c6b5 c4b5 b8d7 e1c1 a8d8 d1d7 d8d7 h1d1 e7e6 b5d7 f6d7 b3b8 d7b8 d1d8'
).split(' ');

describe('reviewing a game with the engine', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('[data-square="e2"]').should('be.visible');
    cy.playMoves(OPERA_GAME);
    cy.contains('h2', 'Checkmate!').should('be.visible');
    cy.contains('button', 'Review').click();
    cy.contains('h1', 'Game Review').should('be.visible');
  });

  it('analyses the whole game and scores both sides', () => {
    cy.get('[data-testid="eval-bar"]').should('not.exist');

    cy.contains('button', 'Analyse game').click();

    // The engine is downloaded and run for real here, so allow it some time.
    cy.get('[data-testid="accuracy-white"]', { timeout: 120000 })
      .invoke('text')
      .should('match', /^\d{2,3}\.\d%$/);
    cy.get('[data-testid="accuracy-black"]').invoke('text').should('match', /^\d{2,3}\.\d%$/);

    // White won this game cleanly; the engine should not rate Black higher.
    cy.get('[data-testid="accuracy-white"]').invoke('text').then((white) => {
      cy.get('[data-testid="accuracy-black"]').invoke('text').then((black) => {
        expect(parseFloat(white)).to.be.greaterThan(parseFloat(black));
      });
    });

    cy.get('[data-testid="eval-bar"]').should('be.visible');
    cy.get('[data-testid="eval-graph"]').should('be.visible');
    cy.contains('button', 'Analyse again').should('be.visible');
  });

  it('marks the losing mistake and says what was better', () => {
    cy.contains('button', 'Analyse game').click();
    cy.get('[data-testid="accuracy-white"]', { timeout: 120000 }).should('exist');

    // 9...b5 is annotated as a mistake or a blunder in the move list.
    cy.contains('button', /^b5\?\??$/).click();

    cy.get('[data-testid="move-verdict"]')
      .should('contain.text', '9… b5')
      .and('contain.text', 'The engine preferred');
  });

  it('steps through the game with the arrow keys', () => {
    cy.contains('Move 0 of 33').should('be.visible');

    cy.get('body').type('{rightarrow}{rightarrow}');
    cy.contains('Move 2 of 33').should('be.visible');
    cy.pieceOn('e4', 'wP');
    cy.pieceOn('e5', 'bP');

    cy.get('body').type('{end}');
    cy.contains('Move 33 of 33').should('be.visible');
    cy.pieceOn('d8', 'wR');

    cy.get('body').type('{home}');
    cy.contains('Move 0 of 33').should('be.visible');
    cy.pieceOn('e2', 'wP');
  });

  it('shows live engine lines for the position on the board', () => {
    cy.get('body').type('{rightarrow}{rightarrow}');

    cy.contains('label', 'Engine lines').click();

    cy.get('[data-testid="engine-lines"]', { timeout: 60000 })
      .should('contain.text', 'depth')
      .find('li')
      .should('have.length.at.least', 1);
    cy.get('[data-testid="eval-bar"]').should('be.visible');
  });
});

describe('playing the computer with no engine server', () => {
  it('gets a reply from the engine in the browser', () => {
    cy.visit('/');
    cy.get('[data-square="e2"]').should('be.visible');
    cy.contains('Human vs Computer').filter(':visible').first().click();

    cy.makeMove('e2', 'e4');

    // Black has replied once the move list has a second move in its first row.
    cy.contains('Playing on this device', { timeout: 60000 }).should('be.visible');
    cy.get('[data-piece^="b"]').should('have.length.at.least', 15);
    cy.moveList()
      .find('tbody tr')
      .first()
      .find('td')
      .last()
      .invoke('text')
      .should('match', /\S/);
  });
});
