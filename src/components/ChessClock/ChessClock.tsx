import React, { useState, useRef } from 'react';
import { useGame } from '../../contexts/GameContext';

const ChessClock: React.FC = () => {
  const { gameState, setTimeControl, pauseClock, getPlayerByColor } = useGame();
  const { whiteTime, blackTime, activeColor, timeControl } = gameState;
  const [showTimeSelector, setShowTimeSelector] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('5');
  const inputRef = useRef<HTMLInputElement>(null);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    if (seconds < 10) {
      return `${minutes}:${secs.toString().padStart(2, '0')}.${tenths}`;
    }
    
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = (time: number): boolean => {
    return time < 60 && time > 0; // Less than 1 minute
  };

  const isCriticalTime = (time: number): boolean => {
    return time < 10 && time > 0; // Less than 10 seconds
  };

  const handleTimeControlSelect = (minutes: number) => {
    setTimeControl(minutes, 0);
    setShowTimeSelector(false);
  };

  const handleCustomTimeSet = () => {
    const minutes = Number(customMinutes);
    if (minutes > 0 && minutes <= 180) {
      setTimeControl(minutes, 0);
      setShowTimeSelector(false);
    }
  };

  const resetTimeControl = () => {
    setTimeControl(null, 0);
    setShowTimeSelector(true);
  };

  if (!timeControl || showTimeSelector) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <h3 className="font-bold text-lg mb-3">Time Control</h3>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Select a time control to start playing with a clock:</p>
          
          {/* Preset buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleTimeControlSelect(1)}
              className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm font-semibold"
            >
              1 min
            </button>
            <button
              onClick={() => handleTimeControlSelect(5)}
              className="px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors text-sm font-semibold"
            >
              5 min
            </button>
            <button
              onClick={() => handleTimeControlSelect(10)}
              className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm font-semibold"
            >
              10 min
            </button>
          </div>

          {/* Custom time input */}
          <div className="border-t pt-3">
            <p className="text-sm text-gray-600 mb-2">Or enter custom time (1-180 minutes):</p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={customMinutes}
                onChange={(e) => {
                  const value = e.target.value;
                  // Only allow digits and empty string
                  if (value === '' || /^\d+$/.test(value)) {
                    setCustomMinutes(value);
                  }
                }}
                onBlur={() => {
                  // Ensure valid number on blur
                  const num = Number(customMinutes);
                  if (isNaN(num) || num < 1) {
                    setCustomMinutes('1');
                  } else if (num > 180) {
                    setCustomMinutes('180');
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="Minutes (1-180)"
              />
              <button
                onClick={handleCustomTimeSet}
                disabled={Number(customMinutes) <= 0 || Number(customMinutes) > 180}
                className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-lg">Chess Clock</h3>
        <div className="flex gap-2">
          <button
            onClick={resetTimeControl}
            className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Change Time
          </button>
          {activeColor && (
            <button
              onClick={pauseClock}
              className="text-xs px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Pause
            </button>
          )}
        </div>
      </div>
      
      <div className="space-y-3">
        {/* Black's clock */}
        <div className={`p-3 rounded-lg transition-all ${
          activeColor === 'b' 
            ? 'bg-gray-800 text-white transform scale-105' 
            : 'bg-gray-200 text-gray-800'
        }`}>
          <div className="flex justify-between items-center">
            <span className="font-semibold">{getPlayerByColor('b')}</span>
            <span className={`font-mono text-xl ${
              isCriticalTime(blackTime) 
                ? 'text-red-500 animate-pulse' 
                : isLowTime(blackTime) 
                  ? 'text-yellow-500' 
                  : ''
            }`}>
              {formatTime(blackTime)}
            </span>
          </div>
        </div>

        {/* White's clock */}
        <div className={`p-3 rounded-lg transition-all ${
          activeColor === 'w' 
            ? 'bg-gray-800 text-white transform scale-105' 
            : 'bg-gray-100 text-gray-800'
        }`}>
          <div className="flex justify-between items-center">
            <span className="font-semibold">{getPlayerByColor('w')}</span>
            <span className={`font-mono text-xl ${
              isCriticalTime(whiteTime) 
                ? 'text-red-500 animate-pulse' 
                : isLowTime(whiteTime) 
                  ? 'text-yellow-500' 
                  : ''
            }`}>
              {formatTime(whiteTime)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-600 text-center">
        {timeControl.initial / 60} minute{timeControl.initial !== 60 ? 's' : ''} per side
        {timeControl.increment > 0 && ` + ${timeControl.increment}s increment`}
      </div>
    </div>
  );
};

export default ChessClock;