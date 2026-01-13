'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from '@/hooks/use-translations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface DuelData {
  id: string;
  topic: string;
  questionsCount: number;
  language: string;
  status: string;
  creator: { firstName: string };
}

function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <JoinPageContent />
    </Suspense>
  );
}

function JoinPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const devParam = searchParams.get('dev');
  const { t, language } = useTranslations();
  const { token, isAuthenticated, setLanguage, setAuth } = useAuthStore();
  
  const [duel, setDuel] = useState<DuelData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const duelId = params.id as string;

  // Authenticate directly on this page
  useEffect(() => {
    const authenticate = async () => {
      if (isAuthenticated && token) return;
      
      setIsAuthenticating(true);
      try {
        let initData = '';
        
        if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
          initData = window.Telegram.WebApp.initData;
          window.Telegram.WebApp.ready();
          window.Telegram.WebApp.expand();
        }

        // For development
        if (!initData && process.env.NODE_ENV === 'development') {
          const devUserId = devParam === '2' ? 987654321 : 123456789;
          const devUserName = devParam === '2' ? 'Player2' : 'Dev';
          initData = 'dev:' + JSON.stringify({
            id: devUserId,
            first_name: devUserName,
            last_name: 'User',
            username: devUserName.toLowerCase(),
            language_code: 'ru',
          });
        }

        if (!initData) {
          setError('Telegram authorization required');
          setIsLoading(false);
          return;
        }

        const response = await fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });

        if (!response.ok) {
          throw new Error('Authentication failed');
        }

        const data = await response.json();
        setAuth({
          token: data.token,
          userId: data.user.id,
          telegramId: data.user.telegramId,
          username: data.user.username,
          firstName: data.user.firstName,
          language: data.user.language,
        });
      } catch (err) {
        console.error('Auth error:', err);
        setError('Authentication failed');
        setIsLoading(false);
      } finally {
        setIsAuthenticating(false);
      }
    };

    authenticate();
  }, [isAuthenticated, token, setAuth, devParam]);

  // Fetch duel after authentication
  useEffect(() => {
    const fetchDuel = async () => {
      if (!token) return;
      
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading duel');
      } finally {
        setIsLoading(false);
      }
    };

    if (token && !isAuthenticating) {
      fetchDuel();
    }
  }, [duelId, token, isAuthenticating]);

  const handleJoin = async () => {
    setIsJoining(true);
    setError(null);

    try {
      const response = await fetch(`/api/duel/${duelId}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to join duel');
      }

      // Set language to match duel
      if (duel?.language) {
        setLanguage(duel.language as 'ru' | 'en');
      }

      // Navigate to play page
      router.push(`/duel/${duelId}/play`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join duel');
      setIsJoining(false);
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
        <Card variant="glass" className="text-center w-full max-w-sm">
          <p className="text-6xl mb-4">😕</p>
          <h2 className="text-xl font-bold mb-2">{t('error')}</h2>
          <p className="text-tg-text-secondary mb-6">{error}</p>
          <Button
            fullWidth
            onClick={() => router.push('/')}
          >
            {t('backToMenu')}
          </Button>
        </Card>
      </div>
    );
  }

  // Check if duel is already started
  if (duel.status !== 'waiting') {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card variant="glass" className="text-center w-full max-w-sm">
          <p className="text-6xl mb-4">⚔️</p>
          <h2 className="text-xl font-bold mb-2">
            {language === 'ru' ? 'Дуэль недоступна' : 'Duel Unavailable'}
          </h2>
          <p className="text-tg-text-secondary mb-6">
            {language === 'ru' 
              ? 'Эта дуэль уже началась или завершена' 
              : 'This duel has already started or finished'}
          </p>
          <Button
            fullWidth
            onClick={() => router.push('/')}
          >
            {t('createDuel')}
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
        <h1 className="text-2xl font-bold mb-2">
          {language === 'ru' ? 'Вас вызвали на дуэль!' : "You've Been Challenged!"}
        </h1>
      </div>

      {/* Duel Info */}
      <Card variant="bordered" className="mb-6 animate-slide-up">
        <div className="text-center py-4">
          <p className="text-tg-text-secondary mb-2">
            {language === 'ru' ? 'Тема:' : 'Topic:'}
          </p>
          <p className="text-2xl font-bold text-tg-text mb-4">{duel.topic}</p>
          
          <div className="flex items-center justify-center gap-6 text-sm text-tg-text-secondary">
            <span>📝 {duel.questionsCount} {language === 'ru' ? 'вопросов' : 'questions'}</span>
            <span>🌐 {duel.language.toUpperCase()}</span>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 mt-4 text-center">
          <p className="text-sm text-tg-text-secondary">
            {language === 'ru' ? 'Создатель:' : 'Created by:'}
          </p>
          <p className="font-medium">{duel.creator.firstName}</p>
        </div>
      </Card>

      {/* Join Button */}
      <Button
        fullWidth
        size="xl"
        onClick={handleJoin}
        isLoading={isJoining}
        className="animate-slide-up"
        style={{ animationDelay: '100ms' }}
      >
        {language === 'ru' ? '🎯 Принять вызов!' : '🎯 Accept Challenge!'}
      </Button>

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
