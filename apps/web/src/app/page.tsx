'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { useTranslations } from '@/hooks/use-translations';
import type { Language } from '@tg-duel/shared';

export default function HomePage() {
  const router = useRouter();
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
          initData = 'dev:' + JSON.stringify({
            id: 123456789,
            first_name: 'Dev',
            last_name: 'User',
            username: 'devuser',
            language_code: 'en',
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

  const handleLanguageSelect = (lang: Language) => {
    setLanguage(lang);
    setShowLanguageSelect(false);
  };

  const handleCreateDuel = async () => {
    if (!topic.trim()) {
      setError(language === 'ru' ? 'Введите тему' : 'Enter a topic');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/duel/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
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

  // Language selection
  if (showLanguageSelect || !isAuthenticated) {
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

  return (
    <div className="flex-1 flex flex-col p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">🎯 Duel Quiz</h1>
        <p className="text-tg-text-secondary">
          {language === 'ru' ? `Привет, ${firstName}!` : `Hey, ${firstName}!`}
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
    </div>
  );
}

// Extend Window for Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
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
