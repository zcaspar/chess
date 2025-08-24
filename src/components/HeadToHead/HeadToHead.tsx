import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';

interface HeadToHeadStats {
  opponentId: string;
  opponentName: string;
  yourWins: number;
  theirWins: number;
  draws: number;
  totalGames: number;
  winRate: number;
  lastGameAt: string;
  lastResult: 'win' | 'loss' | 'draw' | null;
  currentStreak: number;
  streakType: 'winning' | 'losing' | 'none';
}

interface HeadToHeadProps {
  opponentId: string | null;
  opponentName?: string;
  className?: string;
  compact?: boolean;
}

const HeadToHead: React.FC<HeadToHeadProps> = ({ 
  opponentId, 
  opponentName,
  className = '',
  compact = false 
}) => {
  const [stats, setStats] = useState<HeadToHeadStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !opponentId || opponentId === 'ai') {
      setStats(null);
      return;
    }

    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const token = await user.getIdToken();
        const response = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/head-to-head/${opponentId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch head-to-head stats');
        }

        const data = await response.json();
        setStats(data.stats);
      } catch (err) {
        console.error('Error fetching head-to-head stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user, opponentId]);

  // Don't render anything for AI games or when no opponent
  if (!opponentId || opponentId === 'ai' || !user) {
    return null;
  }

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return null; // Silently fail for head-to-head stats
  }

  if (!stats || stats.totalGames === 0) {
    if (compact) {
      return (
        <div className={`text-sm text-gray-500 ${className}`}>
          First game vs {opponentName || 'opponent'}
        </div>
      );
    }
    return (
      <div className={`bg-gray-50 rounded-lg p-4 ${className}`}>
        <p className="text-gray-600 text-center">
          This is your first game against {opponentName || 'this opponent'}
        </p>
      </div>
    );
  }

  const getResultColor = (result: string) => {
    switch (result) {
      case 'win': return 'text-green-600';
      case 'loss': return 'text-red-600';
      case 'draw': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getStreakText = () => {
    if (stats.currentStreak === 0 || stats.streakType === 'none') {
      return null;
    }
    
    const streakClass = stats.streakType === 'winning' 
      ? 'text-green-600' 
      : 'text-red-600';
    
    const streakLabel = stats.streakType === 'winning' 
      ? 'win streak' 
      : 'losing streak';
    
    return (
      <span className={`${streakClass} font-medium`}>
        {stats.currentStreak} {streakLabel}
      </span>
    );
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-4 text-sm ${className}`}>
        <div className="flex gap-2">
          <span className="text-green-600 font-medium">{stats.yourWins}W</span>
          <span className="text-gray-400">-</span>
          <span className="text-red-600 font-medium">{stats.theirWins}L</span>
          <span className="text-gray-400">-</span>
          <span className="text-yellow-600 font-medium">{stats.draws}D</span>
        </div>
        {stats.currentStreak > 1 && (
          <div className="text-xs">{getStreakText()}</div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm p-4 ${className}`}>
      <h3 className="text-lg font-semibold mb-3">
        Head to Head vs {stats.opponentName}
      </h3>
      
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{stats.yourWins}</div>
          <div className="text-xs text-gray-500">Your Wins</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats.draws}</div>
          <div className="text-xs text-gray-500">Draws</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">{stats.theirWins}</div>
          <div className="text-xs text-gray-500">Their Wins</div>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Total Games:</span>
          <span className="font-medium">{stats.totalGames}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Win Rate:</span>
          <span className="font-medium">{stats.winRate.toFixed(1)}%</span>
        </div>

        {stats.lastResult && (
          <div className="flex justify-between">
            <span className="text-gray-600">Last Game:</span>
            <span className={`font-medium ${getResultColor(stats.lastResult)}`}>
              {stats.lastResult === 'win' ? 'Won' : stats.lastResult === 'loss' ? 'Lost' : 'Draw'}
            </span>
          </div>
        )}

        {stats.currentStreak > 1 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Current Streak:</span>
            {getStreakText()}
          </div>
        )}

        {stats.lastGameAt && (
          <div className="text-xs text-gray-500 mt-2">
            Last played: {new Date(stats.lastGameAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
};

export default HeadToHead;