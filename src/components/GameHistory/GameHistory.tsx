import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';

interface GameHistoryEntry {
  id: number;
  gameId: string;
  opponentName: string;
  playerColor: 'w' | 'b';
  gameResult: string;
  gameOutcome: 'win' | 'loss' | 'draw';
  finalFen: string;
  pgn: string;
  moveCount: number;
  gameDuration?: number;
  timeControl?: {
    initial: number;
    increment: number;
  };
  gameMode: 'human-vs-human' | 'human-vs-ai';
  aiDifficulty?: string;
  createdAt: string;
}

interface GameHistoryProps {
  onReplayGame?: (game: GameHistoryEntry) => void;
}

const GameHistory: React.FC<GameHistoryProps> = ({ onReplayGame }) => {
  const [games, setGames] = useState<GameHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const { user } = useAuth();

  const GAMES_PER_PAGE = 20;

  const fetchGames = async (page: number = 0, append: boolean = false) => {
    if (!user) {
      setError('Please sign in to view your game history');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3005';
      const token = await user.getIdToken();
      
      const response = await fetch(
        `${backendUrl}/api/game-history?limit=${GAMES_PER_PAGE}&offset=${page * GAMES_PER_PAGE}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Game history fetch failed:', response.status, errorText);
        
        // Try to parse error response
        try {
          const errorData = JSON.parse(errorText);
          if (response.status === 503) {
            throw new Error(errorData.message || 'Game history feature is temporarily unavailable.');
          }
          throw new Error(errorData.message || `Failed to fetch game history: ${response.status}`);
        } catch (parseError) {
          throw new Error(`Failed to fetch game history: ${response.status} ${response.statusText}`);
        }
      }

      const data = await response.json();
      
      if (append) {
        setGames(prev => [...prev, ...data.games]);
      } else {
        setGames(data.games);
      }
      
      setHasMore(data.games.length === GAMES_PER_PAGE);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames(0, false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    fetchGames(nextPage, true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'win': return 'text-green-600 bg-green-100';
      case 'loss': return 'text-red-600 bg-red-100';
      case 'draw': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getColorIcon = (color: 'w' | 'b') => {
    return color === 'w' ? '♔' : '♚';
  };

  if (!user) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <h2 className="text-2xl font-bold mb-4">Game History</h2>
        <p className="text-gray-600">Please sign in to view your game history.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Game History</h2>
        <button
          onClick={() => fetchGames(0, false)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {games.length === 0 && !loading ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-lg">No games found.</p>
          <p className="text-gray-400 mt-2">Complete some games to see your history here!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {games.map((game) => (
            <div
              key={game.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-2xl">{getColorIcon(game.playerColor)}</span>
                    <div>
                      <h3 className="font-semibold text-lg">
                        vs {game.opponentName}
                      </h3>
                      <p className="text-gray-600 text-sm">
                        {game.gameMode === 'human-vs-ai' ? `AI (${game.aiDifficulty})` : 'Human vs Human'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                    <span>{formatDate(game.createdAt)}</span>
                    <span>•</span>
                    <span>{game.moveCount} moves</span>
                    {game.gameDuration && (
                      <>
                        <span>•</span>
                        <span>{formatDuration(game.gameDuration)}</span>
                      </>
                    )}
                    {game.timeControl && (
                      <>
                        <span>•</span>
                        <span>
                          {Math.floor(game.timeControl.initial / 60)}min
                          {game.timeControl.increment > 0 && `+${game.timeControl.increment}s`}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getOutcomeColor(game.gameOutcome)}`}
                    >
                      {game.gameOutcome.toUpperCase()}
                    </span>
                    <span className="text-gray-600 text-sm">{game.gameResult}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {onReplayGame && (
                    <button
                      onClick={() => onReplayGame(game)}
                      className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
                    >
                      Replay
                    </button>
                  )}
                  <button
                    onClick={() => {
                      // Copy PGN to clipboard
                      navigator.clipboard.writeText(game.pgn);
                      // Could show a toast notification here
                    }}
                    className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 transition-colors"
                    title="Copy PGN"
                  >
                    Copy PGN
                  </button>
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="text-center pt-4">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GameHistory;