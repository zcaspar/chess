import React from 'react';
import { Evaluation, winPercent } from '../../engine/evaluation';
import type { PlyReview } from '../../engine/gameAnalysis';

interface EvalGraphProps {
  /** One evaluation per position: index 0 is the start, i + 1 is after ply i. */
  evaluations: Evaluation[];
  plies: PlyReview[];
  /** Ply currently on the board (-1 for the starting position). */
  currentPly: number;
  onSelectPly: (ply: number) => void;
}

const WIDTH = 300;
const HEIGHT = 72;

const MARKER_COLOR: Partial<Record<PlyReview['quality'], string>> = {
  mistake: '#f59e0b',
  blunder: '#dc2626',
};

/**
 * The game at a glance: White's winning chances after every move. The white
 * area grows when White is doing well; mistakes and blunders are dotted on
 * the line. Click anywhere to jump to that move.
 */
const EvalGraph: React.FC<EvalGraphProps> = ({ evaluations, plies, currentPly, onSelectPly }) => {
  if (evaluations.length < 2) return null;

  const last = evaluations.length - 1;
  const x = (index: number) => (index / last) * WIDTH;
  const y = (evaluation: Evaluation) => HEIGHT - (winPercent(evaluation) / 100) * HEIGHT;

  const line = evaluations.map((evaluation, index) => `${x(index).toFixed(1)},${y(evaluation).toFixed(1)}`);
  const area = `M0,${HEIGHT} L${line.join(' L')} L${WIDTH},${HEIGHT} Z`;

  const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const position = Math.round(((event.clientX - box.left) / box.width) * last);
    onSelectPly(Math.max(0, Math.min(last, position)) - 1);
  };

  const currentIndex = Math.max(0, Math.min(last, currentPly + 1));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Evaluation over the course of the game"
      data-testid="eval-graph"
      onClick={handleClick}
      className="w-full h-[72px] rounded bg-gray-700 cursor-pointer"
    >
      <path d={area} fill="#f9fafb" />
      <line x1={0} y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="3 3" />
      <polyline points={line.join(' ')} fill="none" stroke="#6b7280" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {plies.map((ply) => {
        const color = MARKER_COLOR[ply.quality];
        if (!color) return null;
        return (
          <circle
            key={ply.ply}
            cx={x(ply.ply + 1)}
            cy={y(evaluations[ply.ply + 1])}
            r={2.5}
            fill={color}
            stroke="#ffffff"
            strokeWidth={0.5}
          />
        );
      })}
      <line
        x1={x(currentIndex)}
        y1={0}
        x2={x(currentIndex)}
        y2={HEIGHT}
        stroke="#2563eb"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export default EvalGraph;
