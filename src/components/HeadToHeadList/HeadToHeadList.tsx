import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import HeadToHead from '../HeadToHead/HeadToHead';

interface HeadToHeadRecord {
  opponentId: string;
  opponentName: string;
  yourWins: number;
  theirWins: number;
  draws: number;
  totalGames: number;
  winRate: number;
  lastGameAt: string;
  lastResult: 'win' | 'loss' | 'draw';
  currentStreak: number;
  streakType: 'winning' | 'losing' | 'none';
}

const HeadToHeadList: React.FC = () => {
  const [records, setRecords] = useState<HeadToHeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchRecords = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/head-to-head`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch head-to-head records');
        }

        const data = await response.json();
        setRecords(data.records || []);
      } catch (err) {
        console.error('Error fetching head-to-head records:', err);
        setError(err instanceof Error ? err.message : 'Failed to load records');
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [user]);

  if (!user) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Head-to-Head Records</h2>
        <p className="text-gray-600">Sign in to see your head-to-head records with other players.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Head-to-Head Records</h2>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-24 bg-gray-200 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Head-to-Head Records</h2>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>Error loading head-to-head records: {error}</p>
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Head-to-Head Records</h2>
        <div className="text-center py-8">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Head-to-Head Records Yet</h3>
          <p className="text-gray-600">
            Your head-to-head records will appear here after playing online games with other players.
          </p>
        </div>
      </div>
    );
  }

  // Sort records by total games played (most active opponents first)
  const sortedRecords = [...records].sort((a, b) => b.totalGames - a.totalGames);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold mb-6">Head-to-Head Records</h2>
      
      {/* Summary Stats */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600">{records.length}</div>
            <div className="text-sm text-gray-600">Opponents Faced</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {records.reduce((sum, r) => sum + r.totalGames, 0)}
            </div>
            <div className="text-sm text-gray-600">Total H2H Games</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-600">
              {records.filter(r => r.streakType === 'winning' && r.currentStreak >= 3).length}
            </div>
            <div className="text-sm text-gray-600">Active Win Streaks (3+)</div>
          </div>
        </div>
      </div>

      {/* Records List */}
      <div className="space-y-4">
        {sortedRecords.map((record) => (
          <div key={record.opponentId} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">{record.opponentName}</h3>
                <HeadToHead 
                  opponentId={record.opponentId}
                  opponentName={record.opponentName}
                  compact={true}
                />
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 text-sm text-gray-600">
                <div className="text-center">
                  <div className="font-medium">{record.totalGames}</div>
                  <div>Games</div>
                </div>
                <div className="text-center">
                  <div className="font-medium">{record.winRate.toFixed(1)}%</div>
                  <div>Win Rate</div>
                </div>
                <div className="text-center">
                  <div className="font-medium">
                    {new Date(record.lastGameAt).toLocaleDateString()}
                  </div>
                  <div>Last Game</div>
                </div>
              </div>
            </div>
            
            {record.currentStreak > 2 && (
              <div className="mt-3 flex items-center gap-2">
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  record.streakType === 'winning' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {record.currentStreak} {record.streakType === 'winning' ? 'win' : 'loss'} streak
                </div>
                {record.streakType === 'winning' && record.currentStreak >= 5 && (
                  <div className="text-yellow-500">🔥</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-6 text-center text-sm text-gray-500">
        <p>Head-to-head records are tracked for online games between registered players.</p>
      </div>
    </div>
  );
};

export default HeadToHeadList;