'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from '@/hooks/use-translations';
import type { H2HStats } from '@/lib/h2h';

interface H2HStatsProps {
  opponentId: string | null;
}

export function H2HStatsDisplay({ opponentId }: H2HStatsProps) {
  const { t } = useTranslations();
  const { token } = useAuthStore();
  const [stats, setStats] = useState<H2HStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opponentId || !token) {
      return;
    }

    const fetchStats = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/h2h?opponentId=${opponentId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch H2H stats');
        }

        const data = await response.json();
        
        if (data.success && data.data) {
          setStats(data.data);
        } else {
          setStats(null);
        }
      } catch (err) {
        console.error('[H2H] Error fetching stats:', err);
        setError(err instanceof Error ? err.message : 'Error loading stats');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [opponentId, token]);

  if (!opponentId) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="p-3 bg-gray-800/50 border-gray-700">
        <p className="text-sm text-gray-400 text-center">Loading H2H...</p>
      </Card>
    );
  }

  if (error || !stats) {
    return null; // Gracefully hide if no data
  }

  const totalMatches = stats.total.youWins + stats.total.opponentWins + stats.total.draws;

  if (totalMatches === 0) {
    return null; // No history yet
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-purple-900/30 to-blue-900/30 border-purple-500/30">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-purple-300">
            ⚔️ Head-to-Head
          </h3>
          <span className="text-xs text-gray-400">
            {totalMatches} {totalMatches === 1 ? 'match' : 'matches'}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center justify-center gap-4 py-2">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              {stats.total.youWins}
            </div>
            <div className="text-xs text-gray-400">You</div>
          </div>

          <div className="text-xl text-gray-500 font-bold">—</div>

          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">
              {stats.total.opponentWins}
            </div>
            <div className="text-xs text-gray-400">{stats.opponent.firstName}</div>
          </div>
        </div>

        {/* Draws */}
        {stats.total.draws > 0 && (
          <div className="text-center text-xs text-gray-400">
            {stats.total.draws} {stats.total.draws === 1 ? 'draw' : 'draws'}
          </div>
        )}

        {/* Streak */}
        {stats.streak.count > 0 && (
          <div className="text-center py-2 px-3 bg-black/30 rounded-lg">
            <div className="text-xs text-gray-400 mb-1">Current Streak</div>
            <div className="text-sm font-semibold">
              {stats.streak.holder === 'you' ? (
                <span className="text-green-400">
                  🔥 You won {stats.streak.count} in a row
                </span>
              ) : (
                <span className="text-red-400">
                  🔥 {stats.opponent.firstName} won {stats.streak.count} in a row
                </span>
              )}
            </div>
          </div>
        )}

        {/* Last 5 matches */}
        {stats.lastMatches.length > 0 && (
          <div>
            <div className="text-xs text-gray-400 mb-2">Last matches:</div>
            <div className="flex gap-1.5 justify-center">
              {stats.lastMatches.map((match, idx) => (
                <div
                  key={idx}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    match.winner === 'you'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                      : match.winner === 'opponent'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                      : 'bg-gray-500/20 text-gray-400 border border-gray-500/50'
                  }`}
                  title={`${match.winner === 'draw' ? 'Draw' : match.winner === 'you' ? 'Win' : 'Loss'} - ${new Date(match.date).toLocaleDateString()}`}
                >
                  {match.winner === 'you' ? 'W' : match.winner === 'opponent' ? 'L' : 'D'}
                  {match.isRanked && <span className="absolute -top-1 -right-1 text-[8px]">⭐</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
