import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Chess } from 'chess.js';
import EvalBar from '../components/Analysis/EvalBar';
import AnalysisPanel from '../components/Analysis/AnalysisPanel';
import GameReplay, { GameHistoryEntry } from '../components/GameReplay/GameReplay';
import type { EngineAnalysis } from '../hooks/useEngineAnalysis';
import { useEngineAnalysis } from '../hooks/useEngineAnalysis';
import { PositionJudge, reviewGame } from '../engine/gameAnalysis';

jest.mock('react-chessboard', () => ({
  Chessboard: ({ position, customArrows }: any) => (
    <div data-testid="chessboard" data-position={position} data-arrows={JSON.stringify(customArrows || [])} />
  ),
}));

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, profile: null }),
}));

jest.mock('../hooks/useEngineAnalysis', () => ({
  ...jest.requireActual('../hooks/useEngineAnalysis'),
  useEngineAnalysis: jest.fn(),
}));

const mockUseEngineAnalysis = useEngineAnalysis as jest.Mock;

const idleAnalysis = (overrides: Partial<EngineAnalysis> = {}): EngineAnalysis => ({
  supported: true,
  review: null,
  reviewStatus: 'idle',
  reviewProgress: { done: 0, total: 0 },
  reviewError: null,
  startReview: jest.fn(),
  cancelReview: jest.fn(),
  live: null,
  liveEnabled: false,
  setLiveEnabled: jest.fn(),
  ...overrides,
});

// 1.e4 e5 2.Qh5 Ke7 3.Qxe5# — Black's second move is a blunder.
const GAME_SANS = ['e4', 'e5', 'Qh5', 'Ke7', 'Qxe5#'];
const playedGame = () => {
  const game = new Chess();
  GAME_SANS.forEach((san) => game.move(san));
  return game;
};

const buildReview = async () => {
  const verdicts = [
    { cp: 30, best: 'e2e4' },
    { cp: 30, best: 'e7e5' },
    { cp: 30, best: 'g1f3' },
    { cp: 0, best: 'b8c6' },
    { mate: 1, best: 'h5e5' },
    { mate: 0, best: null },
  ];
  let index = 0;
  const judge: PositionJudge = async () => {
    const verdict = verdicts[index];
    index += 1;
    return {
      evaluation:
        verdict.mate !== undefined
          ? { type: 'mate', in: verdict.mate, winner: 'w' }
          : { type: 'cp', cp: verdict.cp as number },
      bestMove: verdict.best,
    };
  };
  return reviewGame(playedGame().history({ verbose: true }), judge);
};

const entry = (): GameHistoryEntry => ({
  id: 1,
  gameId: 'g1',
  opponentName: 'Opponent',
  playerColor: 'w',
  gameResult: 'Checkmate! White wins!',
  gameOutcome: 'win',
  finalFen: playedGame().fen(),
  pgn: playedGame().pgn(),
  moveCount: GAME_SANS.length,
  gameMode: 'human-vs-human',
  createdAt: new Date('2026-11-10T12:00:00Z').toISOString(),
});

describe('EvalBar', () => {
  const whiteHeight = () => parseFloat(screen.getByTestId('eval-bar-white').style.height);

  it('is half white when the position is equal', () => {
    render(<EvalBar evaluation={{ type: 'cp', cp: 0 }} orientation="white" />);

    expect(whiteHeight()).toBe(50);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'The position is equal');
  });

  it('grows white when White is better, and says by how much', () => {
    render(<EvalBar evaluation={{ type: 'cp', cp: 250 }} orientation="white" />);

    expect(whiteHeight()).toBeGreaterThan(65);
    expect(screen.getByText('+2.5')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'White is better by 2.5');
  });

  it('is all black when Black has a forced mate', () => {
    render(<EvalBar evaluation={{ type: 'mate', in: 3, winner: 'b' }} orientation="white" />);

    expect(whiteHeight()).toBe(0);
    expect(screen.getByText('-M3')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'Black mates in 3');
  });

  it('puts White at the top when the board is flipped', () => {
    render(<EvalBar evaluation={{ type: 'cp', cp: 250 }} orientation="black" />);

    expect(screen.getByTestId('eval-bar-white').style.top).toBe('0px');
  });
});

describe('AnalysisPanel', () => {
  const renderPanel = (analysis: EngineAnalysis, currentPly = -1, onSelectPly = jest.fn()) =>
    render(
      <AnalysisPanel
        analysis={analysis}
        currentPly={currentPly}
        currentFen={new Chess().fen()}
        moveCount={GAME_SANS.length}
        onSelectPly={onSelectPly}
      />,
    );

  it('starts a review when asked', () => {
    const analysis = idleAnalysis();
    renderPanel(analysis);

    fireEvent.click(screen.getByRole('button', { name: 'Analyse game' }));

    expect(analysis.startReview).toHaveBeenCalledTimes(1);
  });

  it('shows progress, and can be cancelled, while a review runs', () => {
    const analysis = idleAnalysis({ reviewStatus: 'running', reviewProgress: { done: 3, total: 6 } });
    renderPanel(analysis);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(analysis.cancelReview).toHaveBeenCalledTimes(1);
  });

  it('shows each side\'s accuracy and error counts once reviewed', async () => {
    renderPanel(idleAnalysis({ review: await buildReview(), reviewStatus: 'done' }));

    expect(screen.getByTestId('accuracy-white')).toHaveTextContent(/^9\d\.\d%$|^100\.0%$/);
    const black = parseFloat(screen.getByTestId('accuracy-black').textContent as string);
    expect(black).toBeLessThan(60);
    expect(screen.getByText('Analyse again')).toBeInTheDocument();
  });

  it('explains the move on the board: what it was and what was better', async () => {
    renderPanel(idleAnalysis({ review: await buildReview(), reviewStatus: 'done' }), 3);

    const verdict = screen.getByTestId('move-verdict');
    expect(verdict).toHaveTextContent('2… Ke7 — Blunder');
    expect(verdict).toHaveTextContent('0.0 → M1');
    expect(verdict).toHaveTextContent('The engine preferred Nc6.');
  });

  it('lists the engine\'s lines in standard notation when they are switched on', () => {
    const analysis = idleAnalysis({
      liveEnabled: true,
      live: {
        fen: new Chess().fen(),
        depth: 18,
        bestMove: null,
        lines: [
          { rank: 1, depth: 18, evaluation: { type: 'cp', cp: 31 }, pv: ['e2e4', 'e7e5', 'g1f3'] },
          { rank: 2, depth: 18, evaluation: { type: 'cp', cp: 24 }, pv: ['d2d4', 'd7d5'] },
        ],
      },
    });
    renderPanel(analysis);

    const lines = within(screen.getByTestId('engine-lines'));
    expect(lines.getByText('depth 18')).toBeInTheDocument();
    expect(lines.getByText('+0.3')).toBeInTheDocument();
    expect(lines.getByText('e4 e5 Nf3')).toBeInTheDocument();
    expect(lines.getByText('d4 d5')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Engine lines'));
    expect(analysis.setLiveEnabled).toHaveBeenCalledWith(false);
  });

  it('says so plainly where the engine cannot run', () => {
    renderPanel(idleAnalysis({ supported: false }));

    expect(screen.getByText(/not available in this browser/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analyse game' })).not.toBeInTheDocument();
  });
});

describe('replay with engine analysis', () => {
  const position = () => screen.getByTestId('chessboard').getAttribute('data-position');
  const arrows = () => JSON.parse(screen.getByTestId('chessboard').getAttribute('data-arrows') as string);

  beforeEach(() => {
    mockUseEngineAnalysis.mockReturnValue(idleAnalysis());
  });

  it('steps through the game with the arrow keys, Home and End', () => {
    render(<GameReplay game={entry()} />);
    const start = new Chess().fen();
    expect(position()).toBe(start);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const afterTwo = new Chess();
    afterTwo.move('e4');
    afterTwo.move('e5');
    expect(position()).toBe(afterTwo.fen());

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'End' });
    expect(position()).toBe(playedGame().fen());

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // already at the end
    expect(position()).toBe(playedGame().fen());

    fireEvent.keyDown(window, { key: 'Home' });
    expect(position()).toBe(start);
  });

  it('hides the evaluation bar until there is something to show', () => {
    render(<GameReplay game={entry()} />);

    expect(screen.queryByTestId('eval-bar')).not.toBeInTheDocument();
  });

  it('marks poor moves in the move list and points at the better move', async () => {
    mockUseEngineAnalysis.mockReturnValue(idleAnalysis({ review: await buildReview(), reviewStatus: 'done' }));
    render(<GameReplay game={entry()} />);

    // The blunder is annotated in the list; sound moves are left alone.
    const blunder = screen.getByRole('button', { name: 'Ke7??' });
    expect(blunder).toHaveAttribute('title', 'Blunder — the engine preferred Nc6');
    expect(screen.getByRole('button', { name: 'e4' })).toBeInTheDocument();

    // On the blunder, the bar shows the position after it and an arrow shows Nc6.
    fireEvent.click(blunder);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'White mates in 1');
    expect(arrows()).toEqual([['b8', 'c6', expect.any(String)]]);

    // On a move the engine agreed with, there is nothing to point at.
    fireEvent.click(screen.getByRole('button', { name: 'e4' }));
    expect(arrows()).toEqual([]);
  });

  it('draws the live engine\'s best move for the position on the board', () => {
    const start = new Chess().fen();
    mockUseEngineAnalysis.mockReturnValue(
      idleAnalysis({
        liveEnabled: true,
        live: {
          fen: start,
          depth: 16,
          bestMove: null,
          lines: [{ rank: 1, depth: 16, evaluation: { type: 'cp', cp: 30 }, pv: ['e2e4', 'e7e5'] }],
        },
      }),
    );
    render(<GameReplay game={entry()} />);

    expect(arrows()).toEqual([['e2', 'e4', expect.any(String)]]);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'White is better by 0.3');

    // Step away: those lines were for a different position, so they are not shown.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(arrows()).toEqual([]);
  });
});
