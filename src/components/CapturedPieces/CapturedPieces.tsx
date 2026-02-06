import React, { useMemo } from 'react';
import { useGame } from '../../contexts/GameContext';

// Piece values for material advantage calculation
const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9,
};

// Unicode piece symbols
const PIECE_SYMBOLS: Record<string, { w: string; b: string }> = {
  p: { w: '\u2659', b: '\u265F' },
  n: { w: '\u2658', b: '\u265E' },
  b: { w: '\u2657', b: '\u265D' },
  r: { w: '\u2656', b: '\u265C' },
  q: { w: '\u2655', b: '\u265B' },
};

// Sort order: Q, R, B, N, P (highest value first)
const SORT_ORDER = ['q', 'r', 'b', 'n', 'p'];

interface CapturedPiecesProps {
  /** Which side's captured pieces to show ('w' = pieces white captured = black pieces taken) */
  color: 'w' | 'b';
}

const CapturedPieces: React.FC<CapturedPiecesProps> = ({ color }) => {
  const { gameState } = useGame();

  const { pieces, advantage } = useMemo(() => {
    const whiteCaptured: string[] = []; // pieces white captured (black pieces)
    const blackCaptured: string[] = []; // pieces black captured (white pieces)

    for (const move of gameState.history) {
      if (move.captured) {
        if (move.color === 'w') {
          whiteCaptured.push(move.captured);
        } else {
          blackCaptured.push(move.captured);
        }
      }
    }

    // Sort by value (highest first)
    const sortFn = (a: string, b: string) => SORT_ORDER.indexOf(a) - SORT_ORDER.indexOf(b);
    whiteCaptured.sort(sortFn);
    blackCaptured.sort(sortFn);

    // Calculate material advantage
    const whiteMatValue = whiteCaptured.reduce((sum, p) => sum + (PIECE_VALUES[p] || 0), 0);
    const blackMatValue = blackCaptured.reduce((sum, p) => sum + (PIECE_VALUES[p] || 0), 0);
    const diff = whiteMatValue - blackMatValue;

    return {
      pieces: color === 'w' ? whiteCaptured : blackCaptured,
      // Show advantage only for the side that's ahead
      advantage: color === 'w' ? (diff > 0 ? diff : 0) : (diff < 0 ? -diff : 0),
    };
  }, [gameState.history, color]);

  if (pieces.length === 0 && advantage === 0) {
    return <div className="h-6" />; // Placeholder to maintain layout
  }

  // The captured pieces are opponent-color pieces
  const displayColor = color === 'w' ? 'b' : 'w';

  return (
    <div className="flex items-center gap-0.5 h-6 px-1 select-none">
      {pieces.map((piece, i) => (
        <span
          key={`${piece}-${i}`}
          className="text-base leading-none opacity-80"
          style={{ marginLeft: i > 0 && pieces[i - 1] !== piece ? '2px' : '-2px' }}
        >
          {PIECE_SYMBOLS[piece]?.[displayColor] || ''}
        </span>
      ))}
      {advantage > 0 && (
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 ml-1">
          +{advantage}
        </span>
      )}
    </div>
  );
};

export default CapturedPieces;
