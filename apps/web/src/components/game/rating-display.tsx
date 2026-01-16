'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

interface RatingData {
  sr: number;
  rd: number;
  gamesPlayed: number;
  leagueName: string;
}

interface RatingDisplayProps {
  language: 'ru' | 'en';
  className?: string;
}

const LEAGUE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Bronze: {
    bg: 'bg-amber-900/20',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
  },
  Silver: {
    bg: 'bg-gray-400/20',
    text: 'text-gray-300',
    border: 'border-gray-400/30',
  },
  Gold: {
    bg: 'bg-yellow-600/20',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
  },
  Platinum: {
    bg: 'bg-cyan-600/20',
    text: 'text-cyan-300',
    border: 'border-cyan-500/30',
  },
  Diamond: {
    bg: 'bg-blue-600/20',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
  },
  Master: {
    bg: 'bg-purple-600/20',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
  },
};

const TRANSLATIONS = {
  ru: {
    yourRating: 'Твой рейтинг',
    skillRating: 'SR',
    league: 'Лига',
    gamesPlayed: 'Игр сыграно',
  },
  en: {
    yourRating: 'Your Rating',
    skillRating: 'SR',
    league: 'League',
    gamesPlayed: 'Games Played',
  },
};

export function RatingDisplay({ language, className }: RatingDisplayProps) {
  const { token, userId } = useAuthStore();
  const [rating, setRating] = useState<RatingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const t = TRANSLATIONS[language];

  useEffect(() => {
    if (!token || !userId) {
      setIsLoading(false);
      return;
    }

    const fetchRating = async () => {
      try {
        const response = await fetch('/api/rating', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setRating(data);
        }
      } catch (error) {
        console.error('Failed to fetch rating:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRating();
  }, [token, userId]);

  if (isLoading || !rating) {
    return (
      <Card variant="glass" className={cn('p-4', className)}>
        <div className="flex items-center justify-between">
          <div className="text-sm text-tg-text-secondary">
            {t.yourRating}
          </div>
          <div className="w-16 h-4 bg-white/10 rounded animate-pulse" />
        </div>
      </Card>
    );
  }

  const leagueColors = LEAGUE_COLORS[rating.leagueName] || LEAGUE_COLORS.Bronze;

  return (
    <Card 
      variant="glass" 
      className={cn(
        'p-4 border-2',
        leagueColors.border,
        className
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-tg-text-secondary">{t.yourRating}</span>
        <span className={cn('text-xs font-medium px-2 py-1 rounded', leagueColors.bg, leagueColors.text)}>
          {rating.leagueName}
        </span>
      </div>
      
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black tabular-nums text-white">
          {rating.sr}
        </span>
        <span className="text-sm text-tg-hint">{t.skillRating}</span>
      </div>
      
      <div className="mt-2 text-xs text-tg-text-secondary">
        {t.gamesPlayed}: {rating.gamesPlayed}
      </div>
    </Card>
  );
}
