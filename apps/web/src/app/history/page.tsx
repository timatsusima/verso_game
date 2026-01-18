'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from '@/hooks/use-translations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SegmentedControl, type SegmentedControlOption } from '@/components/ui/segmented-control';
import { cn } from '@/lib/utils';

interface HistoryEntry {
  duelId: string;
  createdAt: string;
  finishedAt: string | null;
  topic: string;
  isRanked: boolean;
  outcome: 'win' | 'lose' | 'draw';
  myScore: number;
  oppScore: number;
  opponentName: string;
  srBefore: number | null;
  srAfter: number | null;
  srDelta: number | null;
}

type Filter = 'all' | 'ranked' | 'friends';

const TRANSLATIONS = {
  ru: {
    title: 'История дуэлей',
    all: 'Все',
    ranked: 'На рейтинг',
    friends: 'С друзьями',
    noHistory: 'История пуста',
    noHistoryNote: 'Сыграйте первую дуэль, чтобы увидеть историю',
    backToMenu: 'В меню',
    win: 'Победа',
    lose: 'Поражение',
    draw: 'Ничья',
    vs: 'против',
    sr: 'SR',
    date: 'Дата',
    topic: 'Тема',
  },
  en: {
    title: 'Duel History',
    all: 'All',
    ranked: 'Ranked',
    friends: 'Friends',
    noHistory: 'No history',
    noHistoryNote: 'Play your first duel to see history',
    backToMenu: 'Back to Menu',
    win: 'Win',
    lose: 'Lose',
    draw: 'Draw',
    vs: 'vs',
    sr: 'SR',
    date: 'Date',
    topic: 'Topic',
  },
};

export default function HistoryPage() {
  const router = useRouter();
  const { t, language } = useTranslations();
  const { token } = useAuthStore();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t_h = TRANSLATIONS[language];

  useEffect(() => {
    const fetchHistory = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/duels/history', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch history');
        }

        const data = await response.json();
        setHistory(data.history || []);
      } catch (err) {
        console.error('History fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [token]);

  const filteredHistory = history.filter((entry) => {
    if (filter === 'ranked') return entry.isRanked;
    if (filter === 'friends') return !entry.isRanked;
    return true;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return language === 'ru' ? 'Только что' : 'Just now';
    if (diffMins < 60) return `${diffMins}${language === 'ru' ? ' мин назад' : 'm ago'}`;
    if (diffHours < 24) return `${diffHours}${language === 'ru' ? ' ч назад' : 'h ago'}`;
    if (diffDays < 7) return `${diffDays}${language === 'ru' ? ' дн назад' : 'd ago'}`;
    
    return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });
  };

  if (!token) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card variant="glass" className="text-center w-full max-w-sm">
          <p className="text-tg-text-secondary mb-4">
            {language === 'ru' ? 'Необходима авторизация' : 'Authentication required'}
          </p>
          <Button fullWidth onClick={() => router.push('/')}>
            {t_h.backToMenu}
          </Button>
        </Card>
      </div>
    );
  }

  const filterOptions: SegmentedControlOption<Filter>[] = [
    { value: 'all', label: t_h.all },
    { value: 'ranked', label: t_h.ranked },
    { value: 'friends', label: t_h.friends },
  ];

  return (
    <div className="flex-1 flex flex-col">
      {/* Level A: Navigation + Header */}
      <div className="flex items-center gap-3 px-6 pt-4 pb-3">
        <button
          onClick={() => router.push('/')}
          className="text-tg-text-secondary hover:text-tg-text transition-colors p-1 -ml-1"
          aria-label={language === 'ru' ? 'Назад' : 'Back'}
        >
          <span className="text-2xl">←</span>
        </button>
        <h1 className="text-xl font-bold flex-1">{t_h.title}</h1>
      </div>

      {/* Level B: Segmented Control */}
      <div className="px-6 pb-4">
        <SegmentedControl
          options={filterOptions}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto px-6">
      {isLoading ? (
        <Card variant="bordered" className="flex-1 flex items-center justify-center p-8 min-h-[400px]">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </Card>
      ) : error ? (
        <Card variant="bordered" className="flex-1 flex items-center justify-center p-8">
          <p className="text-tg-text-secondary">{error}</p>
        </Card>
      ) : filteredHistory.length === 0 ? (
        <Card variant="bordered" className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-6xl mb-4">📜</div>
          <p className="text-lg font-bold mb-2">{t_h.noHistory}</p>
          <p className="text-sm text-tg-text-secondary text-center mb-6">
            {t_h.noHistoryNote}
          </p>
          <Button onClick={() => router.push('/')}>
            {t_h.backToMenu}
          </Button>
        </Card>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3">
          {filteredHistory.map((entry) => (
            <Card
              key={entry.duelId}
              variant="bordered"
              className={cn(
                'p-4 transition-all',
                entry.outcome === 'win' && 'border-green-500/30 bg-green-500/5',
                entry.outcome === 'lose' && 'border-red-500/30 bg-red-500/5',
                entry.outcome === 'draw' && 'border-amber-500/30 bg-amber-500/5'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-2xl',
                    entry.outcome === 'win' && 'text-green-400',
                    entry.outcome === 'lose' && 'text-red-400',
                    entry.outcome === 'draw' && 'text-amber-400'
                  )}>
                    {entry.outcome === 'win' ? '🏆' : entry.outcome === 'lose' ? '💪' : '⚔️'}
                  </span>
                  <span className={cn(
                    'font-bold text-sm',
                    entry.outcome === 'win' && 'text-green-400',
                    entry.outcome === 'lose' && 'text-red-400',
                    entry.outcome === 'draw' && 'text-amber-400'
                  )}>
                    {entry.outcome === 'win' ? t_h.win : entry.outcome === 'lose' ? t_h.lose : t_h.draw}
                  </span>
                  {entry.isRanked && (
                    <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                      {t_h.ranked}
                    </span>
                  )}
                </div>
                <span className="text-xs text-tg-hint">
                  {formatDate(entry.finishedAt || entry.createdAt)}
                </span>
              </div>

              <div className="mb-2">
                <p className="text-sm font-medium text-tg-text-secondary mb-1 truncate">
                  {entry.topic}
                </p>
                <p className="text-xs text-tg-hint truncate">
                  {entry.myScore} {t_h.vs} {entry.oppScore} • {entry.opponentName}
                </p>
              </div>

              {entry.isRanked && entry.srDelta !== null && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-tg-hint">{t_h.sr}:</span>
                  <span className="font-mono">
                    {entry.srBefore} → {entry.srAfter}
                  </span>
                  <span className={cn(
                    'font-bold',
                    entry.srDelta > 0 && 'text-green-400',
                    entry.srDelta < 0 && 'text-red-400',
                    entry.srDelta === 0 && 'text-tg-text-secondary'
                  )}>
                    ({entry.srDelta > 0 ? '+' : ''}{entry.srDelta})
                  </span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
