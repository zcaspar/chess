import React, { useEffect, useRef } from 'react';
import { useGame } from '../../contexts/GameContext';

const MoveHistory: React.FC = () => {
  const { gameState } = useGame();
  const { history, currentMoveIndex } = gameState;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentMoveRef = useRef<HTMLTableRowElement>(null);

  // Auto-scroll to keep current move visible
  useEffect(() => {
    if (currentMoveRef.current && scrollContainerRef.current) {
      currentMoveRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentMoveIndex]);

  // Group moves into pairs (one full turn)
  const movePairs: Array<{ white: string; black?: string; moveNumber: number }> = [];
  
  for (let i = 0; i <= currentMoveIndex; i += 2) {
    const whiteMove = history[i];
    const blackMove = history[i + 1];
    
    movePairs.push({
      white: whiteMove?.san || '',
      black: i + 1 <= currentMoveIndex ? blackMove?.san : undefined,
      moveNumber: Math.floor(i / 2) + 1,
    });
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-lg">Move History</h3>
        {movePairs.length > 10 && (
          <span className="text-xs text-gray-500">
            {movePairs.length} moves (scroll for more)
          </span>
        )}
      </div>
      
      <div ref={scrollContainerRef} className="max-h-[600px] overflow-y-auto border border-gray-200 rounded">
        {movePairs.length === 0 ? (
          <p className="text-gray-500 text-sm p-4">No moves yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b">
              <tr>
                <th className="text-left py-2 px-2 w-12">#</th>
                <th className="text-left py-2 px-2">White</th>
                <th className="text-left py-2 px-2">Black</th>
              </tr>
            </thead>
            <tbody>
              {movePairs.map((pair, index) => {
                const isCurrentMove = index * 2 === currentMoveIndex || index * 2 + 1 === currentMoveIndex;
                return (
                  <tr 
                    key={index} 
                    ref={isCurrentMove ? currentMoveRef : null}
                    className="border-b hover:bg-gray-50"
                  >
                    <td className="py-2 px-2 font-semibold">{pair.moveNumber}.</td>
                    <td className="py-2 px-2">
                      <span className={index * 2 === currentMoveIndex ? 'font-bold text-blue-600 bg-blue-50 px-1 rounded' : ''}>
                        {pair.white}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      {pair.black && (
                        <span className={index * 2 + 1 === currentMoveIndex ? 'font-bold text-blue-600 bg-blue-50 px-1 rounded' : ''}>
                          {pair.black}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      
      {history.length > currentMoveIndex + 1 && (
        <p className="text-xs text-gray-500 mt-2">
          {history.length - currentMoveIndex - 1} move(s) ahead in history
        </p>
      )}
    </div>
  );
};

export default MoveHistory;