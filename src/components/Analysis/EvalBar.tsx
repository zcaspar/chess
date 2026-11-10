import React from 'react';
import { Evaluation, formatEvaluation, winPercent } from '../../engine/evaluation';

interface EvalBarProps {
  /** From White's point of view; null while nothing has been evaluated. */
  evaluation: Evaluation | null;
  /** Which side is at the bottom of the board next to this bar. */
  orientation: 'white' | 'black';
}

/**
 * The vertical bar beside the board: the more of it is white, the better
 * White stands. It follows the board, so the side at the bottom of the board
 * is at the bottom of the bar.
 */
const EvalBar: React.FC<EvalBarProps> = ({ evaluation, orientation }) => {
  const whiteShare = evaluation ? winPercent(evaluation) : 50;
  const label = evaluation ? formatEvaluation(evaluation) : '–';
  const whiteAhead = whiteShare >= 50;
  const whiteAtBottom = orientation === 'white';

  const description = evaluation
    ? evaluation.type === 'mate'
      ? `${evaluation.winner === 'w' ? 'White' : 'Black'} ${evaluation.in === 0 ? 'has won' : `mates in ${evaluation.in}`}`
      : Math.abs(evaluation.cp) < 5
        ? 'The position is equal'
        : `${evaluation.cp > 0 ? 'White' : 'Black'} is better by ${(Math.abs(evaluation.cp) / 100).toFixed(1)}`
    : 'Not evaluated yet';

  return (
    <div
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(whiteShare)}
      aria-valuetext={description}
      title={description}
      data-testid="eval-bar"
      className="relative w-6 flex-shrink-0 rounded overflow-hidden bg-gray-800 border border-gray-300 select-none"
    >
      <div
        data-testid="eval-bar-white"
        className="absolute left-0 right-0 bg-white transition-all duration-300 ease-out"
        style={{
          height: `${whiteShare}%`,
          ...(whiteAtBottom ? { bottom: 0 } : { top: 0 }),
        }}
      />
      {/* The number sits at the end belonging to the side that is ahead. */}
      <span
        className={`absolute left-0 right-0 text-center text-[10px] font-semibold leading-4 ${
          whiteAhead ? 'text-gray-800' : 'text-white'
        }`}
        style={whiteAhead === whiteAtBottom ? { bottom: 2 } : { top: 2 }}
      >
        {label}
      </span>
    </div>
  );
};

export default EvalBar;
