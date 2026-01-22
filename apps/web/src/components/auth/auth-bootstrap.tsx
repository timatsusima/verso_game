'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getTelegramInitData } from '@/lib/telegram-auth';

/**
 * AuthBootstrap: гарантированная авторизация при старте приложения
 * Запускается один раз при mount, получает JWT через /api/auth/telegram
 * и устанавливает authReady=true после успешной авторизации
 */
export function AuthBootstrap() {
  const { setAuth, setAuthReady, setAuthError, clearAuth } = useAuthStore();
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Запускаем только один раз
    if (hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;

    const bootstrap = async () => {
      try {
        console.log('[AuthBootstrap] Starting auth bootstrap...');

        // 1) Дождаться Telegram initData (poll до 3000мс)
        const initData = await getTelegramInitData();

        if (!initData) {
          console.error('[AuthBootstrap] No initData available');
          setAuthError('Откройте мини-приложение внутри Telegram');
          return;
        }

        console.log('[AuthBootstrap] Got initData, length:', initData.length);

        // 2) Вызвать /api/auth/telegram (без Authorization)
        const response = await fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          // Обработка ошибок с кодами
          const code = data.code || 'UNKNOWN_ERROR';
          console.error('[AuthBootstrap] Auth failed:', code, data.error);

          let errorMessage = 'Ошибка авторизации';
          if (code === 'INITDATA_EXPIRED') {
            errorMessage = 'Сессия устарела. Закройте и откройте мини-приложение в Telegram.';
          } else if (code === 'INITDATA_INVALID') {
            errorMessage = 'Ошибка авторизации Telegram. Откройте мини-приложение заново.';
          } else if (code === 'SERVER_ERROR') {
            errorMessage = 'Сервер недоступен, попробуйте ещё раз.';
          }

          setAuthError(errorMessage);
          return;
        }

        // 3) Успешная авторизация: установить token и user
        const { token, user } = data;
        console.log('[AuthBootstrap] Auth successful, userId:', user.id);

        setAuth({
          token,
          userId: user.id,
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          language: user.language,
        });

        // authReady устанавливается автоматически в setAuth
        console.log('[AuthBootstrap] Bootstrap complete');
      } catch (error) {
        console.error('[AuthBootstrap] Bootstrap error:', error);
        setAuthError('Ошибка при авторизации. Попробуйте обновить страницу.');
      }
    };

    bootstrap();
  }, [setAuth, setAuthReady, setAuthError, clearAuth]);

  // Этот компонент не рендерит ничего
  return null;
}
