import React, { useEffect, useRef } from 'react';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

interface PromotionPickerProps {
  /** Colour of the pawn being promoted. */
  color: 'w' | 'b';
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

// Solid glyphs for both sides (the outlined set renders unevenly across
// fonts); the button colours say which side is promoting.
const OPTIONS: Array<{ piece: PromotionPiece; name: string; glyph: string }> = [
  { piece: 'q', name: 'Queen', glyph: '♛' },
  { piece: 'r', name: 'Rook', glyph: '♜' },
  { piece: 'b', name: 'Bishop', glyph: '♝' },
  { piece: 'n', name: 'Knight', glyph: '♞' },
];

/**
 * Asks which piece a pawn should become.
 *
 * Every promotion used to become a queen: the board never asked, so
 * underpromotion — a knight fork, or a rook to avoid stalemating — could not
 * be played at all.
 */
const PromotionPicker: React.FC<PromotionPickerProps> = ({ color, onSelect, onCancel }) => {
  const firstButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 rounded-lg"
      onClick={onCancel}
      data-testid="promotion-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a piece to promote to"
        className="bg-white rounded-xl shadow-2xl p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm font-semibold text-gray-700 text-center mb-2">Promote to</p>
        <div className="flex gap-2">
          {OPTIONS.map(({ piece, name, glyph }, index) => (
            <button
              key={piece}
              ref={index === 0 ? firstButton : undefined}
              type="button"
              aria-label={name}
              title={name}
              onClick={() => onSelect(piece)}
              className={`w-14 h-14 sm:w-16 sm:h-16 text-4xl sm:text-5xl leading-none rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                color === 'w'
                  ? 'bg-gray-700 text-white hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              }`}
            >
              <span aria-hidden="true">{glyph}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PromotionPicker;
