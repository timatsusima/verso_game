'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from '@/hooks/use-translations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RatingDisplay } from '@/components/game/rating-display';

const TRANSLATIONS = {
  ru: {
    title: 'Поиск соперника',
    searching: 'Ищем соперника…',
    searchingNote: 'Ищем игрока с похожим рейтингом',
    srRange: 'Диапазон SR',
    cancel: 'Отмена',
    backToMenu: 'В меню',
  },
  en: {
    title: 'Finding Opponent',
    searching: 'Searching for opponent…',
    searchingNote: 'Looking for player with similar rating',
    srRange: 'SR Range',
    cancel: 'Cancel',
    backToMenu: 'Back to Menu',
  },
};

export default function MatchmakingPage() {
  const router = useRouter();
  const { t, language } = useTranslations();
  const { token, userId } = useAuthStore();
  const [isSearching, setIsSearching] = useState(false);
  const [srRange, setSrRange] = useState<{ min: number; max: number } | null>(null);

  const t_mm = TRANSLATIONS[language];

  // TODO: Connect to Socket.IO matchmaking in Phase 3
  const handleStartSearch = () => {
    setIsSearching(true);
    // Will be implemented in Phase 3
  };

  const handleCancel = () => {
    setIsSearching(false);
    // TODO: Cancel matchmaking in Phase 3
  };

  if (!token || !userId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card variant="glass" className="text-center w-full max-w-sm">
          <p className="text-tg-text-secondary mb-4">
            {language === 'ru' ? 'Необходима авторизация' : 'Authentication required'}
          </p>
          <Button fullWidth onClick={() => router.push('/')}>
            {t('backToMenu')}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold mb-2">⚔️ {t_mm.title}</h1>
      </div>

      {/* Rating Display */}
      <div className="mb-6">
        <RatingDisplay language={language} />
      </div>

      {/* Matchmaking Status */}
      <Card variant="bordered" className="flex-1 flex flex-col items-center justify-center p-8">
        {!isSearching ? (
          <>
            <div className="text-6xl mb-6">🎯</div>
            <p className="text-lg text-tg-text-secondary mb-8 text-center">
              {t_mm.searchingNote}
            </p>
            <Button
              fullWidth
              size="lg"
              onClick={handleStartSearch}
              className="h-14 text-lg font-bold bg-gradient-to-r from-blue-500 to-purple-600"
            >
              {t_mm.searching}
            </Button>
            <Button
              fullWidth
              variant="ghost"
              onClick={() => router.push('/')}
              className="mt-3"
            >
              {t_mm.backToMenu}
            </Button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6" />
            <p className="text-xl font-bold mb-2">{t_mm.searching}</p>
            {srRange && (
              <p className="text-sm text-tg-text-secondary mb-6">
                {t_mm.srRange}: {srRange.min} - {srRange.max}
              </p>
            )}
            <Button
              fullWidth
              variant="secondary"
              onClick={handleCancel}
            >
              {t_mm.cancel}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
