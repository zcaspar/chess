import React from 'react';
import { useGame } from '../../contexts/GameContext';

const MoveHistory: React.FC = () => {
  const { gameState } = useGame();
  const { history, currentMoveIndex } = gameState;

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
      <h3 className="font-bold text-lg mb-3">Move History</h3>
      
      <div className="max-h-96 overflow-y-auto">
        {movePairs.length === 0 ? (
          <p className="text-gray-500 text-sm">No moves yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1 px-2 w-12">#</th>
                <th className="text-left py-1 px-2">White</th>
                <th className="text-left py-1 px-2">Black</th>
              </tr>
            </thead>
            <tbody>
              {movePairs.map((pair, index) => (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="py-1 px-2 font-semibold">{pair.moveNumber}.</td>
                  <td className="py-1 px-2">
                    <span className={index * 2 === currentMoveIndex ? 'font-bold text-blue-600' : ''}>
                      {pair.white}
                    </span>
                  </td>
                  <td className="py-1 px-2">
                    {pair.black && (
                      <span className={index * 2 + 1 === currentMoveIndex ? 'font-bold text-blue-600' : ''}>
                        {pair.black}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
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