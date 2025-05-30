import React, { useState } from 'react';
import ChessBoard from './components/ChessBoard';
import './App.css';

function App() {
  const [gameResult, setGameResult] = useState<string>('');

  const handleGameOver = (result: string) => {
    setGameResult(result);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-8 text-gray-800">Chess Game</h1>
      
      {gameResult && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          <p className="text-lg font-semibold">{gameResult}</p>
        </div>
      )}
      
      <ChessBoard onGameOver={handleGameOver} />
    </div>
  );
}

export default App;