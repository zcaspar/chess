import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { formatRating, formatRatingChange } from '../../utils/rating';
import { logger } from '../../utils/logger';

interface LeaderboardEntry {
  rank: number;
  name: string;
  rating: number;
  provisional: boolean;
  games: number;
}

interface RatingHistoryEntry {
  gameId: string;
  outcome: 'win' | 'loss' | 'draw';
  opponentRating: number;
  ratingBefore: number;
  ratingAfter: number;
  createdAt: string;
}

const OUTCOME_LABEL: Record<RatingHistoryEntry['outcome'], string> = {
  win: 'Won',
  loss: 'Lost',
  draw: 'Drew',
};

const OUTCOME_CLASS: Record<RatingHistoryEntry['outcome'], string> = {
  win: 'text-green-700',
  loss: 'text-red-600',
  draw: 'text-gray-600',
};

/** The player's rating over their recent games, oldest on the left. */
const RatingSparkline: React.FC<{ history: RatingHistoryEntry[] }> = ({ history }) => {
  if (history.length < 2) return null;
  const points = [...history].reverse().map((entry) => entry.ratingAfter);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const width = 240;
  const height = 48;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - 4 - ((value - min) / span) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Rating over the last ${points.length} rated games, from ${points[0]} to ${points[points.length - 1]}`}
      className="w-full h-12"
    >
      <polyline points={path} fill="none" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/**
 * The player's own rating with their recent rated games, and the leaderboard.
 * Ratings come only from online games the server refereed.
 */
const RatingPanel: React.FC = () => {
  const { user, profile } = useAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [history, setHistory] = useState<RatingHistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3005';

    const load = async () => {
      try {
        const boardResponse = await fetch(`${backendUrl}/api/users/leaderboard?limit=20`);
        if (!boardResponse.ok) throw new Error(`leaderboard ${boardResponse.status}`);
        const board = await boardResponse.json();
        if (!cancelled) setLeaderboard(Array.isArray(board.players) ? board.players : []);
      } catch (error) {
        logger.warn('Could not load the leaderboard:', error);
        if (!cancelled) setFailed(true);
      }

      if (!user || user.isAnonymous) return;
      try {
        const token = await user.getIdToken();
        const historyResponse = await fetch(`${backendUrl}/api/users/rating-history?limit=30`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!historyResponse.ok) throw new Error(`rating history ${historyResponse.status}`);
        const data = await historyResponse.json();
        if (!cancelled) setHistory(Array.isArray(data.history) ? data.history : []);
      } catch (error) {
        logger.warn('Could not load rating history:', error);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const rating = profile?.rating;
  const canBeRated = !!profile && !profile.isGuest;

  return (
    <section aria-label="Ratings" className="grid gap-4 md:grid-cols-2 mb-6">
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Your rating</h2>
        {canBeRated && rating ? (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-gray-900" data-testid="own-rating">
                {formatRating(rating.value, rating.provisional)}
              </span>
              <span className="text-sm text-gray-500">
                {rating.games} rated game{rating.games === 1 ? '' : 's'}
              </span>
            </div>
            {rating.provisional && (
              <p className="mt-1 text-sm text-gray-600">
                Provisional — the “?” goes once you have played enough rated games for it to settle.
              </p>
            )}
            {history && history.length > 0 && (
              <>
                <div className="mt-3">
                  <RatingSparkline history={history} />
                </div>
                <ul className="mt-2 divide-y divide-gray-100 text-sm">
                  {history.slice(0, 5).map((entry) => (
                    <li key={entry.gameId} className="flex justify-between py-1">
                      <span className={OUTCOME_CLASS[entry.outcome]}>
                        {OUTCOME_LABEL[entry.outcome]} vs {entry.opponentRating}
                      </span>
                      <span className="font-mono text-gray-800">
                        {entry.ratingAfter} ({formatRatingChange(entry.ratingAfter - entry.ratingBefore)})
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {history && history.length === 0 && (
              <p className="mt-3 text-sm text-gray-600">
                Play an online game against another signed-in player to start your rating.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600">
            Sign in with an account to play rated games. Guest games are always casual.
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Leaderboard</h2>
        {leaderboard === null && !failed && <p className="text-sm text-gray-500">Loading…</p>}
        {failed && <p className="text-sm text-gray-600">The leaderboard is unavailable right now.</p>}
        {leaderboard && leaderboard.length === 0 && (
          <p className="text-sm text-gray-600">
            Nobody is ranked yet. Players appear here after five rated games.
          </p>
        )}
        {leaderboard && leaderboard.length > 0 && (
          <ol className="divide-y divide-gray-100 text-sm">
            {leaderboard.map((entry) => (
              <li key={`${entry.rank}-${entry.name}`} className="flex items-center gap-3 py-1">
                <span className="w-6 text-right text-gray-500">{entry.rank}</span>
                <span className="flex-1 truncate text-gray-900">{entry.name}</span>
                <span className="font-mono font-semibold text-gray-900">
                  {formatRating(entry.rating, entry.provisional)}
                </span>
                <span className="w-16 text-right text-xs text-gray-500">{entry.games} games</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};

export default RatingPanel;
