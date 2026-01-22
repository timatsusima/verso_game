/**
 * Telegram authentication utilities
 * Handles getting initData and re-authenticating with Telegram
 */

/**
 * Gets Telegram initData, waiting for it to become available if needed
 * @returns initData string or null if not available
 */
export async function getTelegramInitData(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  // Call ready() best-effort
  try {
    window.Telegram?.WebApp?.ready?.();
  } catch (e) {
    // Ignore errors
  }

  // Check if initData is already available
  let initData = window.Telegram?.WebApp?.initData;
  if (initData && initData.length > 20) {
    return initData;
  }

  // Poll for initData (wait up to 3000ms, check every 100ms)
  const maxWait = 3000;
  const pollInterval = 100;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    initData = window.Telegram?.WebApp?.initData;
    if (initData && initData.length > 20) {
      return initData;
    }
  }

  return null;
}

/**
 * Re-authenticates with Telegram and returns auth data
 * @throws Error with message 'NO_TELEGRAM_INITDATA' or 'EXPIRED_INITDATA'
 */
export async function reauthWithTelegram(): Promise<{
  token: string;
  user: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string;
    language: 'ru' | 'en';
  };
}> {
  const initData = await getTelegramInitData();
  
  if (!initData) {
    throw new Error('NO_TELEGRAM_INITDATA');
  }

  const response = await fetch('/api/auth/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });

  const data = await response.json().catch(() => ({ ok: false, error: 'Unknown error' }));

  if (!response.ok || !data.ok) {
    // Check if initData expired
    if (data.code === 'EXPIRED_INITDATA') {
      throw new Error('EXPIRED_INITDATA');
    }
    
    throw new Error(data.error || 'Authentication failed');
  }

  return {
    token: data.token,
    user: data.user,
  };
}
