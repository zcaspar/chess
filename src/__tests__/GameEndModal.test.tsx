import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { Chess, Square } from 'chess.js';
import GameEndModal from '../components/GameEndModal/GameEndModal';
import { useGame } from '../contexts/GameContext';
import { createMockGameContext, createMockGameState } from '../test-utils/mockGameState';

jest.mock('../contexts/GameContext', () => ({
  ...jest.requireActual('../contexts/GameContext'),
  useGame: jest.fn(),
}));

const mockUseGame = useGame as jest.Mock;

/** The modal waits 500ms after the game ends before appearing. */
const revealModal = () => {
  act(() => {
    jest.advanceTimersByTime(600);
  });
};

const finishedHistory = () => {
  const game = new Chess();
  ['f3', 'e5', 'g4', 'Qh4#'].forEach((san) => game.move(san));
  return game.history({ verbose: true });
};

const setGame = (overrides = {}) => {
  mockUseGame.mockReturnValue(
    createMockGameContext({
      gameState: createMockGameState({
        gameResult: 'Checkmate! Player 2 wins!',
        history: finishedHistory() as any,
        currentMoveIndex: 3,
        ...overrides,
      }),
    }),
  );
};

describe('GameEndModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setGame();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('appears once the game has ended', () => {
    render(<GameEndModal />);

    expect(screen.queryByText('Checkmate!')).not.toBeInTheDocument();
    revealModal();
    expect(screen.getByText('Checkmate!')).toBeInTheDocument();
  });

  it('opens the review screen when Review is clicked', () => {
    // The reported bug: this button was wired to the dismiss handler, so it
    // closed the modal and did nothing else.
    const onReview = jest.fn();
    render(<GameEndModal onReview={onReview} />);
    revealModal();

    act(() => {
      screen.getByRole('button', { name: 'Review' }).click();
    });

    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('closes the modal when opening the review', () => {
    const onReview = jest.fn();
    render(<GameEndModal onReview={onReview} />);
    revealModal();

    act(() => {
      screen.getByRole('button', { name: 'Review' }).click();
    });

    expect(screen.queryByText('Checkmate!')).not.toBeInTheDocument();
  });

  it('offers Close instead of Review when there is nothing to review', () => {
    // A game that ended before a move was played has no PGN to replay; the
    // button must not promise a review it cannot deliver.
    setGame({ history: [], currentMoveIndex: -1 });
    const onReview = jest.fn();
    render(<GameEndModal onReview={onReview} />);
    revealModal();

    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    act(() => {
      screen.getByRole('button', { name: 'Close' }).click();
    });

    expect(onReview).not.toHaveBeenCalled();
  });

  it('offers Close when no review handler is supplied', () => {
    render(<GameEndModal />);
    revealModal();

    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('still starts a new game from New Game', () => {
    const resetGame = jest.fn();
    mockUseGame.mockReturnValue(
      createMockGameContext({
        resetGame,
        gameState: createMockGameState({
          gameResult: 'Checkmate! Player 2 wins!',
          history: finishedHistory() as any,
        }),
      }),
    );
    render(<GameEndModal onReview={jest.fn()} />);
    revealModal();

    act(() => {
      screen.getByRole('button', { name: 'New Game' }).click();
    });

    expect(resetGame).toHaveBeenCalledTimes(1);
  });

  it('stays hidden while the game is still in progress', () => {
    setGame({ gameResult: '' });
    render(<GameEndModal onReview={jest.fn()} />);
    revealModal();

    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
  });
});
