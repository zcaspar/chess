import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnalysisResult, getEngine, isEngineSupported } from '../engine/stockfishEngine';
import { GameReview, ReviewMove, engineJudge, reviewGame, terminalVerdict } from '../engine/gameAnalysis';
import { logger } from '../utils/logger';

/** Depth for whole-game review: every position is searched this deep. */
export const REVIEW_DEPTH = 16;
/** Depth for the position on the board, which can afford to look further. */
export const LIVE_DEPTH = 20;
const LIVE_LINES = 3;

export type ReviewStatus = 'idle' | 'running' | 'done' | 'error';

export interface EngineAnalysis {
  /** False where the engine cannot run; the UI hides the feature. */
  supported: boolean;
  review: GameReview | null;
  reviewStatus: ReviewStatus;
  /** Positions analysed so far and in total, while a review runs. */
  reviewProgress: { done: number; total: number };
  reviewError: string | null;
  startReview: () => void;
  cancelReview: () => void;
  /** Live engine output for the position on the board. */
  live: AnalysisResult | null;
  liveEnabled: boolean;
  setLiveEnabled: (enabled: boolean) => void;
}

const isAbort = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

/**
 * Engine analysis for the replay screen: a whole-game review on request, and
 * live lines for whichever position is on the board.
 *
 * `moves` must be the game from the standard starting position; `gameKey`
 * identifies the game so results are dropped when a different game is shown.
 */
export const useEngineAnalysis = (
  moves: ReviewMove[],
  currentFen: string,
  gameKey: string,
): EngineAnalysis => {
  const supported = useMemo(() => isEngineSupported(), []);
  const [review, setReview] = useState<GameReview | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('idle');
  const [reviewProgress, setReviewProgress] = useState({ done: 0, total: 0 });
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [live, setLive] = useState<AnalysisResult | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(false);

  const reviewAbort = useRef<AbortController | null>(null);
  const movesRef = useRef(moves);
  movesRef.current = moves;

  const cancelReview = useCallback(() => {
    reviewAbort.current?.abort();
    reviewAbort.current = null;
    setReviewStatus((status) => (status === 'running' ? 'idle' : status));
  }, []);

  // A different game: whatever was computed belongs to the old one.
  useEffect(() => {
    reviewAbort.current?.abort();
    reviewAbort.current = null;
    setReview(null);
    setReviewStatus('idle');
    setReviewError(null);
    setReviewProgress({ done: 0, total: 0 });
    return () => {
      reviewAbort.current?.abort();
    };
  }, [gameKey]);

  const startReview = useCallback(() => {
    const engine = getEngine();
    const gameMoves = movesRef.current;
    if (!engine || gameMoves.length === 0) {
      setReviewError('The analysis engine is not available in this browser.');
      setReviewStatus('error');
      return;
    }

    reviewAbort.current?.abort();
    const controller = new AbortController();
    reviewAbort.current = controller;
    setReview(null);
    setReviewError(null);
    setReviewStatus('running');
    setReviewProgress({ done: 0, total: gameMoves.length + 1 });

    reviewGame(gameMoves, engineJudge(engine, REVIEW_DEPTH), {
      signal: controller.signal,
      onProgress: (done, total) => {
        if (!controller.signal.aborted) setReviewProgress({ done, total });
      },
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setReview(result);
        setReviewStatus('done');
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        logger.error('Game review failed:', error);
        setReviewError('The engine could not analyse this game. Please try again.');
        setReviewStatus('error');
      });
  }, []);

  // Live analysis of the position on the board. Paused while a review runs:
  // the engine does one search at a time and the review should not be slowed.
  const reviewRunning = reviewStatus === 'running';
  useEffect(() => {
    if (!supported || !liveEnabled || reviewRunning) {
      setLive(null);
      return;
    }

    const terminal = terminalVerdict(currentFen);
    if (terminal) {
      setLive({
        fen: currentFen,
        depth: 0,
        lines: [{ rank: 1, depth: 0, evaluation: terminal.evaluation, pv: [] }],
        bestMove: null,
      });
      return;
    }

    const engine = getEngine();
    if (!engine) return;

    const controller = new AbortController();
    setLive(null);
    engine
      .analyse(currentFen, {
        depth: LIVE_DEPTH,
        multiPv: LIVE_LINES,
        signal: controller.signal,
        onUpdate: (partial) => {
          if (!controller.signal.aborted) setLive(partial);
        },
      })
      .then((result) => {
        if (!controller.signal.aborted) setLive(result);
      })
      .catch((error) => {
        if (!isAbort(error)) logger.warn('Live analysis failed:', error);
      });

    return () => controller.abort();
  }, [supported, liveEnabled, reviewRunning, currentFen]);

  return {
    supported,
    review,
    reviewStatus,
    reviewProgress,
    reviewError,
    startReview,
    cancelReview,
    live,
    liveEnabled,
    setLiveEnabled,
  };
};
