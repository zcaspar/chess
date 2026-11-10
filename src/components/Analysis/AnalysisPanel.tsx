import React from 'react';
import { formatEvaluation, MoveQuality, QUALITY_LABEL } from '../../engine/evaluation';
import { pvToSan, SideSummary } from '../../engine/gameAnalysis';
import type { EngineAnalysis } from '../../hooks/useEngineAnalysis';
import EvalGraph from './EvalGraph';

interface AnalysisPanelProps {
  analysis: EngineAnalysis;
  /** Ply on the board (-1 for the starting position). */
  currentPly: number;
  currentFen: string;
  moveCount: number;
  onSelectPly: (ply: number) => void;
}

export const QUALITY_TEXT_CLASS: Record<MoveQuality, string> = {
  best: 'text-green-700',
  good: 'text-gray-700',
  inaccuracy: 'text-yellow-700',
  mistake: 'text-orange-600',
  blunder: 'text-red-600',
};

const SummaryColumn: React.FC<{ name: string; summary: SideSummary }> = ({ name, summary }) => (
  <div className="flex-1 rounded border border-gray-200 bg-white p-2 text-center">
    <div className="text-xs font-medium text-gray-500">{name}</div>
    <div className="text-2xl font-bold text-gray-900" data-testid={`accuracy-${name.toLowerCase()}`}>
      {summary.accuracy === null ? '–' : `${summary.accuracy.toFixed(1)}%`}
    </div>
    <div className="text-[11px] text-gray-500">accuracy</div>
    <dl className="mt-2 grid grid-cols-3 gap-1 text-xs">
      <div>
        <dt className="text-yellow-700">Inaccuracies</dt>
        <dd className="font-semibold">{summary.inaccuracies}</dd>
      </div>
      <div>
        <dt className="text-orange-600">Mistakes</dt>
        <dd className="font-semibold">{summary.mistakes}</dd>
      </div>
      <div>
        <dt className="text-red-600">Blunders</dt>
        <dd className="font-semibold">{summary.blunders}</dd>
      </div>
    </dl>
  </div>
);

/**
 * Everything the engine has to say about the game on screen: a whole-game
 * review (accuracy, the graph, a verdict on the current move) and live lines
 * for the current position.
 */
const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  analysis,
  currentPly,
  currentFen,
  moveCount,
  onSelectPly,
}) => {
  const {
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
  } = analysis;

  if (!supported) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Engine analysis is not available in this browser.
      </div>
    );
  }

  const currentReview = review && currentPly >= 0 ? review.plies[currentPly] : null;
  const percent =
    reviewProgress.total > 0 ? Math.round((reviewProgress.done / reviewProgress.total) * 100) : 0;

  return (
    <section aria-label="Engine analysis" className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {reviewStatus === 'running' ? (
          <button
            type="button"
            onClick={cancelReview}
            className="px-3 py-1.5 rounded bg-gray-500 text-white text-sm hover:bg-gray-600"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={startReview}
            disabled={moveCount === 0}
            className="px-3 py-1.5 rounded bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {review ? 'Analyse again' : 'Analyse game'}
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={liveEnabled}
            onChange={(event) => setLiveEnabled(event.target.checked)}
            className="rounded"
          />
          Engine lines
        </label>
      </div>

      {reviewStatus === 'running' && (
        <div>
          <div
            role="progressbar"
            aria-label="Analysing game"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 w-full rounded bg-gray-200 overflow-hidden"
          >
            <div className="h-full bg-purple-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Analysing move {Math.min(reviewProgress.done, moveCount)} of {moveCount}…
          </p>
        </div>
      )}

      {reviewError && (
        <p role="alert" className="text-sm text-red-700">
          {reviewError}
        </p>
      )}

      {review && (
        <>
          <div className="flex gap-2">
            <SummaryColumn name="White" summary={review.white} />
            <SummaryColumn name="Black" summary={review.black} />
          </div>

          <EvalGraph
            evaluations={review.evaluations}
            plies={review.plies}
            currentPly={currentPly}
            onSelectPly={onSelectPly}
          />

          <div className="rounded border border-gray-200 bg-white p-2 text-sm" data-testid="move-verdict" aria-live="polite">
            {currentReview ? (
              <>
                <span className={`font-semibold ${QUALITY_TEXT_CLASS[currentReview.quality]}`}>
                  {Math.floor(currentReview.ply / 2) + 1}
                  {currentReview.color === 'w' ? '.' : '…'} {currentReview.san}
                  {' — '}
                  {QUALITY_LABEL[currentReview.quality]}
                </span>
                <span className="text-gray-600">
                  {' '}
                  ({formatEvaluation(currentReview.evalBefore)} → {formatEvaluation(currentReview.evalAfter)})
                </span>
                {currentReview.bestMoveSan && (
                  <div className="text-gray-700">
                    The engine preferred <strong>{currentReview.bestMoveSan}</strong>.
                  </div>
                )}
              </>
            ) : (
              <span className="text-gray-600">Step through the game to see a verdict on each move.</span>
            )}
          </div>
        </>
      )}

      {liveEnabled && (
        <div className="rounded border border-gray-200 bg-white p-2" data-testid="engine-lines">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Stockfish</span>
            <span>
              {reviewStatus === 'running'
                ? 'paused during review'
                : live
                  ? live.depth > 0
                    ? `depth ${live.depth}`
                    : 'game over'
                  : 'thinking…'}
            </span>
          </div>
          {live && live.lines.length > 0 ? (
            <ol className="space-y-1">
              {live.lines.map((line) => (
                <li key={line.rank} className="flex gap-2 text-sm">
                  <span className="w-12 flex-shrink-0 font-mono font-semibold text-gray-900">
                    {formatEvaluation(line.evaluation)}
                  </span>
                  <span className="text-gray-700 break-words">
                    {pvToSan(currentFen, line.pv).join(' ') || '—'}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-500">{reviewStatus === 'running' ? '' : 'Calculating…'}</p>
          )}
        </div>
      )}
    </section>
  );
};

export default AnalysisPanel;
