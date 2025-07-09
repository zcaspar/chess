# Chess App Testing Guide

## Overview

This project implements a comprehensive testing strategy including unit tests, integration tests, and end-to-end (E2E) tests to ensure reliability and quality.

## Test Structure

```
src/
├── components/
│   ├── ChessBoard/
│   │   ├── ChessBoard.tsx
│   │   └── ChessBoard.test.tsx
│   ├── GameControls/
│   │   ├── GameControls.tsx
│   │   └── GameControls.test.tsx
│   └── ...
├── contexts/
│   ├── GameContext.test.tsx
│   └── AuthContext.test.tsx
└── utils/
    └── *.test.ts

cypress/
├── e2e/
│   ├── guest-user.cy.ts
│   ├── authenticated-user.cy.ts
│   └── complete-game-flow.cy.ts
├── support/
│   ├── commands.ts
│   └── e2e.ts
└── tsconfig.json
```

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Run tests for a specific file
npm test -- ChessBoard.test
```

### E2E Tests

```bash
# Open Cypress interactive mode
npm run cypress:open

# Run Cypress tests headlessly
npm run cypress:run

# Run E2E tests with headed browser
npm run test:e2e:headed
```

## Test Coverage

Current test coverage targets:
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 80%
- **Statements**: 80%

### Viewing Coverage Reports

After running `npm run test:coverage`, open `coverage/lcov-report/index.html` in your browser for detailed coverage information.

## Test Categories

### 1. Unit Tests (Jest + React Testing Library)

**Completed Components:**
- ✅ GameContext (28 tests)
- ✅ AuthContext (16 tests)
- ✅ ChessBoard (17 tests)
- ✅ GameControls (25 tests)
- ✅ ChessClock (18 tests)
- ✅ MoveHistory (11 tests)
- ✅ OnlineGameModal (15 tests)
- ✅ GameModeSelector (13 tests)

**Test Focus:**
- Component rendering
- User interactions
- State management
- Event handling
- Error scenarios

### 2. Integration Tests

Located in `cypress/e2e/complete-game-flow.cy.ts`, these tests cover:
- Complete game scenarios (checkmate, draw, resignation)
- Time control behavior
- Special moves (castling, en passant, promotion)
- Game state persistence
- Error handling

### 3. E2E Tests (Cypress)

**Guest User Journey:**
- Landing page and board display
- Local gameplay
- AI opponent interaction
- Game controls
- Responsive design

**Authenticated User Journey:**
- Google authentication flow
- Online game creation/joining
- Game history access
- Friend system
- Multiplayer gameplay

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR:

1. **Test Stage:**
   - Linting
   - Type checking
   - Unit tests with coverage
   - E2E tests
   - Multiple Node.js versions (18.x, 20.x)

2. **Build Stage:**
   - Production build
   - Environment variable injection
   - Artifact generation

3. **Deploy Preview:**
   - PR preview deployments
   - Vercel integration

## Writing New Tests

### Unit Test Example

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('should handle user interaction', () => {
    render(<MyComponent />);
    
    const button = screen.getByRole('button', { name: /click me/i });
    fireEvent.click(button);
    
    expect(screen.getByText('Clicked!')).toBeInTheDocument();
  });
});
```

### E2E Test Example

```typescript
describe('Feature Test', () => {
  it('should complete user flow', () => {
    cy.visit('/');
    cy.contains('Welcome').should('be.visible');
    
    cy.get('[data-cy=start-button]').click();
    cy.url().should('include', '/game');
  });
});
```

## Custom Cypress Commands

Available custom commands in `cypress/support/commands.ts`:

- `cy.getBySel(selector)` - Get element by data-cy attribute
- `cy.login()` - Mock user authentication
- `cy.makeMove(from, to)` - Make a chess move
- `cy.waitForMove()` - Wait for AI/opponent move
- `cy.checkGameStatus(status)` - Verify game status

## Debugging Tests

### Unit Tests
- Use `debug()` from React Testing Library
- Add `screen.debug()` to see component HTML
- Use `console.log()` in test files

### E2E Tests
- Use `cy.pause()` to pause execution
- Enable video recording in cypress.config.ts
- Check screenshots on failure in `cypress/screenshots`

## Best Practices

1. **Test Organization:**
   - Keep tests close to the code they test
   - Use descriptive test names
   - Group related tests with `describe` blocks

2. **Test Quality:**
   - Test user behavior, not implementation details
   - Use proper assertions
   - Clean up after tests (reset mocks, clear state)

3. **Performance:**
   - Mock external dependencies
   - Use `beforeEach` for common setup
   - Avoid unnecessary waits in E2E tests

4. **Maintenance:**
   - Update tests when features change
   - Remove obsolete tests
   - Keep test data realistic

## Troubleshooting

### Common Issues

**Tests timing out:**
- Increase timeout in test config
- Check for unresolved promises
- Verify mock implementations

**Flaky E2E tests:**
- Add proper waits for elements
- Use `cy.intercept()` for network requests
- Check for race conditions

**Coverage not updating:**
- Clear Jest cache: `npm test -- --clearCache`
- Check collectCoverageFrom patterns
- Ensure files are properly imported

## Future Improvements

- [ ] Add visual regression testing
- [ ] Implement performance testing
- [ ] Add accessibility testing
- [ ] Set up mutation testing
- [ ] Create test data factories
- [ ] Add API contract testing