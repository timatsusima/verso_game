'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from '@/hooks/use-translations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RatingDisplay } from '@/components/game/rating-display';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import type { ServerToClientEvents } from '@tg-duel/shared';

const TRANSLATIONS = {
  ru: {
    title: 'Поиск соперника',
    searching: 'Ищем соперника…',
    searchingNote: 'Ищем игрока с похожим рейтингом',
    srRange: 'Диапазон SR',
    cancel: 'Отмена',
    backToMenu: 'В меню',
    opponentFound: 'Соперник найден!',
    startingDuel: 'Начинаем дуэль…',
  },
  en: {
    title: 'Finding Opponent',
    searching: 'Searching for opponent…',
    searchingNote: 'Looking for player with similar rating',
    srRange: 'SR Range',
    cancel: 'Cancel',
    backToMenu: 'Back to Menu',
    opponentFound: 'Opponent Found!',
    startingDuel: 'Starting duel…',
  },
};

export default function MatchmakingPage() {
  const router = useRouter();
  const { t, language } = useTranslations();
  const { token, userId } = useAuthStore();
  const [isSearching, setIsSearching] = useState(false);
  const [srRange, setSrRange] = useState<{ min: number; max: number } | null>(null);
  const [matchFound, setMatchFound] = useState<{
    duelId: string;
    opponent: { id: string; name: string; sr: number };
  } | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  const t_mm = TRANSLATIONS[language];

  // Connect to socket on mount
  useEffect(() => {
    if (!token || !userId) return;

    const socket = connectSocket();
    socketRef.current = socket;

    // Authenticate socket on connection
    const handleConnect = () => {
      console.log('[Matchmaking] Socket connected, authenticating...');
      // Store token in socket auth for authentication middleware
      // Note: Socket.IO doesn't have built-in auth, so we'll send it with mm:join
    };

    // Handle matchmaking status updates
    const handleStatus: ServerToClientEvents['mm:status'] = (data) => {
      console.log('[Matchmaking] Status update:', data);
      if (data.state === 'searching' && data.range) {
        setSrRange(data.range);
        setIsSearching(true);
      } else if (data.state === 'error') {
        setIsSearching(false);
        console.error('Matchmaking error:', data.message);
      }
    };

    // Handle match found
    const handleFound: ServerToClientEvents['mm:found'] = (data) => {
      console.log('[Matchmaking] Match found!', data);
      setIsSearching(false);
      setMatchFound({
        duelId: data.duelId,
        opponent: data.opponent,
      });
      
      // Navigate to duel after short delay
      setTimeout(() => {
        router.push(`/duel/${data.duelId}/play`);
      }, 2000);
    };

    socket.on('connect', handleConnect);
    socket.on('mm:status', handleStatus);
    socket.on('mm:found', handleFound);
    socket.on('error', (data) => {
      console.error('[Matchmaking] Socket error:', data);
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('mm:status', handleStatus);
      socket.off('mm:found', handleFound);
      socket.off('error');
    };
  }, [token, userId, router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current && isSearching) {
        socketRef.current.emit('mm:cancel');
      }
    };
  }, [isSearching]);

  const handleStartSearch = () => {
    if (!socketRef.current || !token) {
      console.error('[Matchmaking] Cannot start search: socket or token missing');
      return;
    }

    console.log('[Matchmaking] Starting search, language:', language);
    setIsSearching(true);
    
    // Send token with mm:join for authentication
    socketRef.current.emit('mm:join', { language, token });
  };

  const handleCancel = () => {
    if (socketRef.current) {
      socketRef.current.emit('mm:cancel');
    }
    setIsSearching(false);
    setSrRange(null);
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
        {matchFound ? (
          <>
            <div className="text-6xl mb-6 animate-bounce">🎯</div>
            <p className="text-2xl font-bold mb-2 text-green-400">{t_mm.opponentFound}</p>
            <p className="text-lg text-tg-text-secondary mb-2">
              {matchFound.opponent.name}
            </p>
            <p className="text-sm text-tg-hint mb-6">
              SR: {matchFound.opponent.sr}
            </p>
            <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-tg-text-secondary mt-4">{t_mm.startingDuel}</p>
          </>
        ) : !isSearching ? (
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
