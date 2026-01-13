'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from '@/hooks/use-translations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { generateTelegramShareLink } from '@/lib/utils';

interface DuelData {
  id: string;
  topic: string;
  questionsCount: number;
  language: string;
  status: string;
  creator: { firstName: string };
  opponent: { firstName: string } | null;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const { t, language } = useTranslations();
  const { token, userId } = useAuthStore();
  
  const [duel, setDuel] = useState<DuelData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const duelId = params.id as string;
  const telegramShareLink = duel ? generateTelegramShareLink(duelId, duel.topic) : '';

  useEffect(() => {
    const fetchDuel = async () => {
      try {
        const response = await fetch(`/api/duel/${duelId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Duel not found');
        }

        const data = await response.json();
        setDuel(data.duel);

        // If opponent joined, redirect to game
        if (data.duel.status === 'ready' || data.duel.status === 'in_progress') {
          router.push(`/duel/${duelId}/play`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading duel');
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchDuel();
      
      // Poll for opponent joining
      const interval = setInterval(fetchDuel, 3000);
      return () => clearInterval(interval);
    }
  }, [duelId, token, router]);

  const handleTelegramShare = () => {
    if (window.Telegram?.WebApp) {
      // Use Telegram's share functionality
      window.open(telegramShareLink, '_blank');
    } else {
      window.open(telegramShareLink, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-tg-text-secondary">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !duel) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card variant="glass" className="text-center">
          <p className="text-xl mb-4">😕</p>
          <p className="text-tg-text-secondary">{error || t('error')}</p>
          <Button
            className="mt-4"
            onClick={() => router.push('/')}
          >
            {t('backToMenu')}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">⚔️</div>
        <h1 className="text-2xl font-bold mb-2">{t('inviteFriend')}</h1>
        <p className="text-tg-text-secondary">{duel.topic}</p>
      </div>

      {/* Waiting Status */}
      <Card variant="bordered" className="mb-6 animate-slide-up">
        <div className="flex items-center justify-center gap-3 py-4">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
          <p className="text-lg">{t('waitingForOpponent')}</p>
        </div>
        
        <div className="flex items-center justify-between text-sm text-tg-text-secondary border-t border-white/10 pt-4 mt-4">
          <span>{language === 'ru' ? 'Вопросов:' : 'Questions:'} {duel.questionsCount}</span>
          <span>{language === 'ru' ? 'Язык:' : 'Language:'} {duel.language.toUpperCase()}</span>
        </div>
      </Card>

      {/* Share Button */}
      <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
        <Button
          fullWidth
          size="lg"
          onClick={handleTelegramShare}
        >
          📤 {language === 'ru' ? 'Пригласить друга' : 'Invite Friend'}
        </Button>
      </div>

      {/* Back Button */}
      <div className="mt-auto pt-6">
        <Button
          fullWidth
          variant="ghost"
          onClick={() => router.push('/')}
        >
          {t('backToMenu')}
        </Button>
      </div>
    </div>
  );
}
