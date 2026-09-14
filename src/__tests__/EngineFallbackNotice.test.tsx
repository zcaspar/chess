import React from 'react';
import { render, screen } from '@testing-library/react';
import { Chess } from 'chess.js';
import GameStatus from '../components/GameStatus/GameStatus';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../hooks/useAuth';
import { createMockGameContext, createMockGameState } from '../test-utils/mockGameState';
import { ChessAI } from '../utils/chessAI';

jest.mock('../contexts/GameContext', () => ({
  ...jest.requireActual('../contexts/GameContext'),
  useGame: jest.fn(),
}));

jest.mock('../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

// HeadToHead fetches on mount; it is irrelevant to the notice under test.
jest.mock('../components/HeadToHead/HeadToHead', () => () => null);

const mockUseGame = useGame as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

const NOTICE = /offline engine/i;

const renderStatus = (overrides = {}) => {
  mockUseGame.mockReturnValue(
    createMockGameContext({
      gameState: createMockGameState({
        gameMode: 'human-vs-ai',
        aiColor: 'b',
        ...overrides,
      }),
    }),
  );
  return render(<GameStatus />);
};

describe('offline-engine notice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null, profile: null });
  });

  it('warns when the computer fell back to the offline engine', () => {
    // Without this the drop in strength is invisible — it just looks like the
    // computer playing badly, which is exactly how it was first noticed.
    renderStatus({ lastAiEngine: 'fallback' });

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('says nothing while the real engine is answering', () => {
    renderStatus({ lastAiEngine: 'lc0' });

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('says nothing before the computer has moved', () => {
    renderStatus({ lastAiEngine: null });

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('warns during an AI-vs-AI game too', () => {
    renderStatus({ gameMode: 'ai-vs-ai', aiColor: null, lastAiEngine: 'fallback' });

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('stays out of the way in a human-vs-human game', () => {
    renderStatus({ gameMode: 'human-vs-human', aiColor: null, lastAiEngine: 'fallback' });

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('is announced to assistive technology', () => {
    renderStatus({ lastAiEngine: 'fallback' });

    expect(screen.getByRole('status')).toHaveTextContent(NOTICE);
  });
});

describe('SimpleChessAI.getLastMoveSource', () => {
  const START = () => new Chess();

  it('reports lc0 when the backend answered', async () => {
    const backendAI = require('../utils/backendAI');
    jest
      .spyOn(backendAI.BackendAI.prototype, 'getBestMove')
      .mockResolvedValue({ from: 'e2', to: 'e4' });

    const ai = new ChessAI('expert');
    await ai.getBestMove(START());

    expect(ai.getLastMoveSource()).toBe('lc0');
  });

  it('reports fallback when the backend returns nothing', async () => {
    const backendAI = require('../utils/backendAI');
    jest.spyOn(backendAI.BackendAI.prototype, 'getBestMove').mockResolvedValue(null);

    const ai = new ChessAI('expert');
    await ai.getBestMove(START());

    expect(ai.getLastMoveSource()).toBe('fallback');
  });

  it('reports fallback when the backend request throws', async () => {
    const backendAI = require('../utils/backendAI');
    jest
      .spyOn(backendAI.BackendAI.prototype, 'getBestMove')
      .mockRejectedValue(new Error('timed out'));

    const ai = new ChessAI('expert');
    await ai.getBestMove(START());

    expect(ai.getLastMoveSource()).toBe('fallback');
  });

  it('recovers to lc0 once the backend answers again', async () => {
    const backendAI = require('../utils/backendAI');
    const spy = jest.spyOn(backendAI.BackendAI.prototype, 'getBestMove');

    const ai = new ChessAI('expert');

    spy.mockResolvedValueOnce(null);
    await ai.getBestMove(START());
    expect(ai.getLastMoveSource()).toBe('fallback');

    spy.mockResolvedValueOnce({ from: 'e2', to: 'e4' });
    await ai.getBestMove(START());
    expect(ai.getLastMoveSource()).toBe('lc0');
  });
});
