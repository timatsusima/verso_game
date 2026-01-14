'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { useTranslations } from '@/hooks/use-translations';
import type { Language } from '@tg-duel/shared';

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
    setAuth, 
    setLanguage 
  } = useAuthStore();
  
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);
  const [topic, setTopic] = useState('');
  const [questionsCount, setQuestionsCount] = useState<10 | 20 | 30>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Handle Telegram start_param (deep link)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
      const hasWebApp = !!window.Telegram?.WebApp;
      
      // Visual debug info
      setDebugInfo(`WebApp: ${hasWebApp}, start_param: ${startParam || 'none'}`);
      
      console.log('[HomePage] start_param:', startParam);
      
      if (startParam) {
        // Handle join_DUEL_ID format
        if (startParam.startsWith('join_')) {
          const duelId = startParam.replace('join_', '');
          console.log('[HomePage] Redirecting to join duel:', duelId);
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

  // Authenticate with Telegram on mount
  useEffect(() => {
    const authenticate = async () => {
      // Check if already authenticated
      if (isAuthenticated && token) {
        setIsAuthenticating(false);
        return;
      }

      try {
        // Get initData from Telegram WebApp
        let initData = '';
        
        if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
          initData = window.Telegram.WebApp.initData;
          window.Telegram.WebApp.ready();
          window.Telegram.WebApp.expand();
        }

        // For development without Telegram
        if (!initData && process.env.NODE_ENV === 'development') {
          // Use URL param ?dev=2 to create second test user
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
          setShowLanguageSelect(true);
          setIsAuthenticating(false);
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
        setShowLanguageSelect(true);
      } finally {
        setIsAuthenticating(false);
      }
    };

    authenticate();
  }, [isAuthenticated, token, setAuth]);

  const handleLanguageSelect = async (lang: Language) => {
    setLanguage(lang);
    setShowLanguageSelect(false);
    
    // Try to authenticate with Telegram after language selection
    if (!isAuthenticated) {
      setIsAuthenticating(true);
      try {
        let initData = '';
        
        if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
          initData = window.Telegram.WebApp.initData;
        }
        
        if (initData) {
          const response = await fetch('/api/auth/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData }),
          });

          if (response.ok) {
            const data = await response.json();
            setAuth({
              token: data.token,
              userId: data.user.id,
              telegramId: data.user.telegramId,
              username: data.user.username,
              firstName: data.user.firstName,
              language: lang,
            });
          }
        }
      } catch (err) {
        console.error('Auth error after language select:', err);
      } finally {
        setIsAuthenticating(false);
      }
    }
  };

  const handleCreateDuel = async () => {
    if (!topic.trim()) {
      setError(language === 'ru' ? 'Введите тему' : 'Enter a topic');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // If not authenticated, try to authenticate first
      let authToken = token;
      
      if (!authToken && typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
        const authResponse = await fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: window.Telegram.WebApp.initData }),
        });

        if (authResponse.ok) {
          const authData = await authResponse.json();
          authToken = authData.token;
          setAuth({
            token: authData.token,
            userId: authData.user.id,
            telegramId: authData.user.telegramId,
            username: authData.user.username,
            firstName: authData.user.firstName,
            language: language,
          });
        } else {
          throw new Error(language === 'ru' ? 'Ошибка авторизации' : 'Authentication failed');
        }
      }

      if (!authToken) {
        throw new Error(language === 'ru' ? 'Необходима авторизация через Telegram' : 'Telegram authorization required');
      }

      const response = await fetch('/api/duel/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          topic: topic.trim(),
          questionsCount,
          language,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create duel');
      }

      const data = await response.json();
      router.push(`/duel/${data.duelId}/invite`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create duel');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isAuthenticating) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-tg-text-secondary">{t('loading')}</p>
        </div>
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
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">🎯 Duel Quiz</h1>
        <p className="text-tg-text-secondary">
          {language === 'ru' ? `Привет, ${displayName}!` : `Hey, ${displayName}!`}
        </p>
      </div>

      {/* Create Duel Form */}
      <Card variant="bordered" className="flex-1 animate-slide-up">
        <h2 className="text-xl font-bold mb-6">{t('createDuel')}</h2>

        <div className="space-y-6">
          {/* Topic Input */}
          <Input
            label={t('topic')}
            placeholder={t('topicPlaceholder')}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            error={error || undefined}
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

          {/* Create Button */}
          <Button
            fullWidth
            size="lg"
            onClick={handleCreateDuel}
            isLoading={isLoading}
            disabled={!topic.trim()}
          >
            {t('start')} 🚀
          </Button>
        </div>
      </Card>

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

      {/* Debug Info - временно для отладки */}
      {debugInfo && (
        <div className="mt-4 p-2 bg-yellow-500/20 rounded text-xs text-center">
          DEBUG: {debugInfo}
        </div>
      )}
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
