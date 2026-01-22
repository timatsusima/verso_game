'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { DuelLoadingOverlay } from '@/components/game/duel-loading-overlay';
import { RatingDisplay } from '@/components/game/rating-display';
import { useTranslations } from '@/hooks/use-translations';
import { api, ApiClientError } from '@/lib/api-client';
import type { Language, DifficultyLevel } from '@tg-duel/shared';

function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect');
  const devParam = searchParams.get('dev');
  const { t, language } = useTranslations();
  const { 
    isAuthenticated, 
    token, 
    firstName,
    authReady,
    authError,
    setAuth, 
    setLanguage 
  } = useAuthStore();
  
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [topic, setTopic] = useState('');
  const [questionsCount, setQuestionsCount] = useState<10 | 20 | 30>(10);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handle Telegram start_param (deep link) - only once per session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
      const handledKey = `handled_start_param_${startParam}`;
      
      // Check if this start_param was already handled
      if (startParam && !sessionStorage.getItem(handledKey)) {
        // Mark as handled
        sessionStorage.setItem(handledKey, 'true');
        
        // Handle join_DUEL_ID format
        if (startParam.startsWith('join_')) {
          const duelId = startParam.replace('join_', '');
          router.push(`/duel/${duelId}/join`);
          return;
        }
      }
    }
  }, [router]);

  // Handle redirect after authentication
  useEffect(() => {
    if (isAuthenticated && token && redirectUrl) {
      // Preserve dev param in redirect
      const devQuery = devParam && !redirectUrl.includes('dev=') ? 
        (redirectUrl.includes('?') ? `&dev=${devParam}` : `?dev=${devParam}`) : '';
      router.push(redirectUrl + devQuery);
    }
  }, [isAuthenticated, token, redirectUrl, devParam, router]);

  // Wait for auth bootstrap to complete
  useEffect(() => {
    if (authReady) {
      setIsAuthenticating(false);
      
      // Call ready() and expand() if available
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        try {
          window.Telegram.WebApp.ready();
          window.Telegram.WebApp.expand();
        } catch (e) {
          // Ignore errors
        }
      }
    }
  }, [authReady]);

  const handleLanguageSelect = async (lang: Language) => {
    setLanguage(lang);
    setShowLanguageSelect(false);
  };

  const handleRetryAuth = () => {
    // Reload page to trigger bootstrap again
    window.location.reload();
  };

  const handleCreateDuel = async () => {
    if (!topic.trim()) {
      setError(language === 'ru' ? 'Введите тему' : 'Enter a topic');
      return;
    }

    setIsLoading(true);
    setIsLoadingComplete(false);
    setError(null);

    try {
      const data = await api.post<{ duelId: string; inviteLink: string }>('/api/duel/create', {
        topic: topic.trim(),
        questionsCount,
        language,
        difficulty,
      });
      
      // Mark loading as complete to animate progress to 100%
      setIsLoadingComplete(true);
      
      // Wait for animation to finish, then redirect
      setTimeout(() => {
        router.push(`/duel/${data.duelId}/invite`);
      }, 500);
    } catch (err) {
      // Show user-friendly error message
      if (err instanceof ApiClientError) {
        setError(err.userMessage);
      } else {
        setError(
          err instanceof Error 
            ? err.message 
            : (language === 'ru' ? 'Не удалось создать дуэль' : 'Failed to create duel')
        );
      }
      setIsLoading(false);
      setIsLoadingComplete(false);
    }
  };

  // Loading state: waiting for auth bootstrap
  if (!authReady && !authError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-tg-text-secondary">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // Auth error state
  if (authError) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card variant="glass" className="w-full max-w-sm animate-scale-in">
          <h1 className="text-2xl font-bold text-center mb-4">
            🎯 Duel Quiz
          </h1>
          <p className="text-tg-text-secondary text-center mb-6">
            {authError}
          </p>
          <Button
            fullWidth
            size="lg"
            variant="primary"
            onClick={handleRetryAuth}
          >
            {language === 'ru' ? 'Повторить' : 'Retry'}
          </Button>
        </Card>
      </div>
    );
  }

  // Language selection (show only if explicitly needed or first visit)
  if (showLanguageSelect) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card variant="glass" className="w-full max-w-sm animate-scale-in">
          <h1 className="text-2xl font-bold text-center mb-8">
            🎯 Duel Quiz
          </h1>
          <p className="text-tg-text-secondary text-center mb-6">
            {t('selectLanguage')}
          </p>
          <div className="space-y-3">
            <Button
              fullWidth
              size="lg"
              variant={language === 'ru' ? 'primary' : 'secondary'}
              onClick={() => handleLanguageSelect('ru')}
            >
              🇷🇺 Русский
            </Button>
            <Button
              fullWidth
              size="lg"
              variant={language === 'en' ? 'primary' : 'secondary'}
              onClick={() => handleLanguageSelect('en')}
            >
              🇬🇧 English
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Get display name from Telegram or auth store
  const displayName = firstName || 
    (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name) || 
    (language === 'ru' ? 'Игрок' : 'Player');

  return (
    <div className="flex-1 flex flex-col p-6">
      {/* Loading Overlay */}
      <DuelLoadingOverlay
        isLoading={isLoading}
        isComplete={isLoadingComplete}
        language={language}
        topic={topic.trim()}
      />

      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold mb-2">🎯 Duel Quiz</h1>
        <p className="text-tg-text-secondary">
          {language === 'ru' ? `Привет, ${displayName}!` : `Hey, ${displayName}!`}
        </p>
      </div>

      {/* Rating Display - only show if authReady and authenticated */}
      {authReady && isAuthenticated && (
        <div className="mb-6">
          <RatingDisplay language={language} />
        </div>
      )}

      {/* Game Mode Selection */}
      {!showCreateForm && (
        <div className="mb-6 space-y-3">
          <Button
            fullWidth
            size="lg"
            variant="primary"
            onClick={() => router.push('/matchmaking')}
            className="h-16 text-lg font-bold bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 shadow-lg shadow-blue-500/30"
          >
            ⚔️ {language === 'ru' ? 'Играть на рейтинг' : 'Play Ranked'}
          </Button>
          
          <Button
            fullWidth
            size="lg"
            variant="secondary"
            onClick={() => setShowCreateForm(true)}
            className="h-16 text-lg font-medium"
          >
            👥 {language === 'ru' ? 'Дуэль с другом' : 'Duel with Friend'}
          </Button>

          {isAuthenticated && (
            <Button
              fullWidth
              size="lg"
              variant="ghost"
              onClick={() => router.push('/history')}
              className="h-14 text-base"
            >
              📜 {language === 'ru' ? 'История дуэлей' : 'Duel History'}
            </Button>
          )}
        </div>
      )}

      {/* Create Duel Form */}
      {showCreateForm && (
        <Card variant="bordered" className="flex-1 animate-slide-up">
        <h2 className="text-xl font-bold mb-6">{t('createDuel')}</h2>

        <div className="space-y-6">
          {/* Topic Input */}
          <Input
            label={t('topic')}
            placeholder={t('topicPlaceholder')}
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              if (error) setError(null);
            }}
          />

          {/* Questions Count */}
          <Select
            label={t('questionsCount')}
            options={[
              { value: 10, label: '10' },
              { value: 20, label: '20' },
              { value: 30, label: '30' },
            ]}
            value={questionsCount}
            onChange={(v) => setQuestionsCount(v as 10 | 20 | 30)}
          />

          {/* Difficulty */}
          <Select
            label={language === 'ru' ? 'Сложность' : 'Difficulty'}
            options={[
              { value: 'easy', label: language === 'ru' ? '🌱 Легко' : '🌱 Easy' },
              { value: 'medium', label: language === 'ru' ? '📚 Средне' : '📚 Medium' },
              { value: 'hard', label: language === 'ru' ? '🔥 Сложно' : '🔥 Hard' },
            ]}
            value={difficulty}
            onChange={(v) => setDifficulty(v as DifficultyLevel)}
          />

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Create Button */}
          <Button
            fullWidth
            size="lg"
            onClick={handleCreateDuel}
            isLoading={isLoading}
            disabled={!topic.trim()}
          >
            {error ? (language === 'ru' ? 'Повторить' : 'Retry') : t('start')} 🚀
          </Button>
          
          {/* Back to mode selection */}
          <Button
            fullWidth
            variant="ghost"
            onClick={() => {
              setShowCreateForm(false);
              setError(null);
            }}
            className="mt-2"
          >
            {language === 'ru' ? '← Назад' : '← Back'}
          </Button>
        </div>
      </Card>
      )}

      {/* Language Switcher */}
      <div className="mt-4 flex justify-center gap-2">
        <button
          onClick={() => setLanguage('ru')}
          className={`px-3 py-1 rounded-full text-sm ${
            language === 'ru' ? 'bg-blue-500 text-white' : 'bg-white/10 text-tg-text-secondary'
          }`}
        >
          RU
        </button>
        <button
          onClick={() => setLanguage('en')}
          className={`px-3 py-1 rounded-full text-sm ${
            language === 'en' ? 'bg-blue-500 text-white' : 'bg-white/10 text-tg-text-secondary'
          }`}
        >
          EN
        </button>
      </div>

    </div>
  );
}

// Extend Window for Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
          start_param?: string;
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: {
          show: () => void;
          hide: () => void;
          setText: (text: string) => void;
          onClick: (callback: () => void) => void;
        };
      };
    };
  }
}
