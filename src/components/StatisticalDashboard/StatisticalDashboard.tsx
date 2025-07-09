import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  TimeScale,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  TimeScale,
);

interface DashboardData {
  summary: {
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    avgMovesPerGame: number;
    avgGameDuration: number;
    avgMoveTime: number;
    lastGameDate: string | null;
    aiGames: number;
    humanGames: number;
  };
  recentPerformance: Array<{
    gameDate: string;
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    dailyWinRate: number;
  }>;
  difficultyBreakdown: Array<{
    difficulty: string;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    gamesPlayed: number;
  }>;
  timeControlBreakdown: Array<{
    timeControl: string;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    gamesPlayed: number;
  }>;
  openingStatistics: Array<{
    openingName: string;
    gamesPlayed: number;
    winRate: number;
    color: 'w' | 'b';
  }>;
}

const StatisticalDashboard: React.FC = () => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDashboardData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3005';
      const token = await user.getIdToken();

      const response = await fetch(`${backendUrl}/api/analytics/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Analytics endpoints not deployed yet
          throw new Error('Analytics feature is being deployed. Please try again in a few minutes.');
        }
        throw new Error(`Failed to fetch dashboard data: ${response.status}`);
      }

      const data = await response.json();
      setDashboardData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <h2 className="text-2xl font-bold mb-4">Statistical Dashboard</h2>
        <p className="text-gray-600">Please sign in to view your game statistics.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4">Statistical Dashboard</h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading your statistics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4">Statistical Dashboard</h2>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">Error loading statistics</p>
          <p>{error}</p>
          <button 
            onClick={fetchDashboardData}
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4">Statistical Dashboard</h2>
        <p className="text-gray-600">No data available.</p>
      </div>
    );
  }

  const { summary, recentPerformance, difficultyBreakdown, timeControlBreakdown } = dashboardData;

  // Prepare chart data
  const performanceChartData = {
    labels: recentPerformance.map(item => format(parseISO(item.gameDate), 'MMM dd')),
    datasets: [
      {
        label: 'Win Rate %',
        data: recentPerformance.map(item => item.dailyWinRate),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.1,
      },
      {
        label: 'Games Played',
        data: recentPerformance.map(item => item.gamesPlayed),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.1,
      },
    ],
  };

  const outcomeChartData = {
    labels: ['Wins', 'Losses', 'Draws'],
    datasets: [
      {
        data: [summary.wins, summary.losses, summary.draws],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(156, 163, 175, 0.8)',
        ],
        borderColor: [
          'rgb(34, 197, 94)',
          'rgb(239, 68, 68)',
          'rgb(156, 163, 175)',
        ],
        borderWidth: 2,
      },
    ],
  };

  const difficultyChartData = {
    labels: difficultyBreakdown.map(item => item.difficulty),
    datasets: [
      {
        label: 'Win Rate %',
        data: difficultyBreakdown.map(item => item.winRate),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
      },
    ],
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-2">Statistical Dashboard</h2>
        <p className="text-gray-600">
          Your chess performance analytics and insights
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-700">Total Games</h3>
          <p className="text-3xl font-bold text-blue-600">{summary.totalGames}</p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-700">Win Rate</h3>
          <p className="text-3xl font-bold text-green-600">{summary.winRate.toFixed(1)}%</p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-700">Avg Game Length</h3>
          <p className="text-3xl font-bold text-purple-600">{Math.round(summary.avgMovesPerGame)} moves</p>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-700">Avg Game Duration</h3>
          <p className="text-3xl font-bold text-orange-600">{formatDuration(summary.avgGameDuration)}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Trend Chart */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">Recent Performance (30 days)</h3>
          {recentPerformance.length > 0 ? (
            <Line 
              data={performanceChartData} 
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top' as const,
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100,
                  },
                },
              }}
            />
          ) : (
            <p className="text-gray-500 text-center py-8">No recent games to display</p>
          )}
        </div>

        {/* Game Outcomes Pie Chart */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">Game Outcomes</h3>
          {summary.totalGames > 0 ? (
            <Doughnut 
              data={outcomeChartData}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'bottom' as const,
                  },
                },
              }}
            />
          ) : (
            <p className="text-gray-500 text-center py-8">No games played yet</p>
          )}
        </div>
      </div>

      {/* Difficulty Performance */}
      {difficultyBreakdown.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">Performance vs AI Difficulty</h3>
          <Bar 
            data={difficultyChartData}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  display: false,
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  ticks: {
                    callback: (value) => `${value}%`,
                  },
                },
              },
            }}
          />
        </div>
      )}

      {/* Time Control Breakdown */}
      {timeControlBreakdown.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">Performance by Time Control</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Time Control</th>
                  <th className="text-center py-2">Games</th>
                  <th className="text-center py-2">Win Rate</th>
                  <th className="text-center py-2">W-L-D</th>
                </tr>
              </thead>
              <tbody>
                {timeControlBreakdown.map((item, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2 font-medium">{item.timeControl}</td>
                    <td className="text-center py-2">{item.gamesPlayed}</td>
                    <td className="text-center py-2">{item.winRate.toFixed(1)}%</td>
                    <td className="text-center py-2">{item.wins}-{item.losses}-{item.draws}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Additional Stats */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold mb-4">Additional Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Games vs AI</p>
            <p className="text-xl font-semibold">{summary.aiGames}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Games vs Humans</p>
            <p className="text-xl font-semibold">{summary.humanGames}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Average Time per Move</p>
            <p className="text-xl font-semibold">{summary.avgMoveTime ? `${summary.avgMoveTime.toFixed(1)}s` : 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Last Game</p>
            <p className="text-xl font-semibold">
              {summary.lastGameDate ? format(parseISO(summary.lastGameDate), 'MMM dd, yyyy') : 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatisticalDashboard;