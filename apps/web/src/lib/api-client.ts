/**
 * Centralized API client with automatic token refresh on 401
 */

import { useAuthStore } from '@/stores/auth-store';
import { reauthWithTelegram } from './telegram-auth';

export interface ApiError {
  error: string;
  code?: 'EXPIRED_TOKEN' | 'INVALID_TOKEN' | 'MISSING_TOKEN' | 'EXPIRED_INITDATA' | 'INVALID_INITDATA' | 'DB_COLD_START' | 'DB_UNAVAILABLE';
  details?: unknown;
}

export interface ApiClientOptions extends RequestInit {
  skipAuth?: boolean;
  retryOn401?: boolean; // Prevent infinite loops for auth refresh
  retryOnDbColdStart?: boolean; // Prevent infinite loops for DB cold start retries
}

// Custom error class with userMessage
export class ApiClientError extends Error {
  userMessage: string;
  code?: string;

  constructor(message: string, userMessage: string, code?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.userMessage = userMessage;
    this.code = code;
  }
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Refresh auth token using Telegram initData
 */
async function refreshToken(): Promise<string | null> {
  // Prevent concurrent refresh attempts
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const authStore = useAuthStore.getState();
      const authData = await reauthWithTelegram();
      const { token, user } = authData;

      // Update auth store
      authStore.setAuth({
        token,
        userId: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        language: user.language,
      });

      console.log('[API Client] Token refreshed successfully');
      return token;
    } catch (error) {
      console.error('[API Client] Token refresh error:', error);
      
      // If it's a known error, rethrow it
      if (error instanceof Error && (error.message === 'NO_TELEGRAM_INITDATA' || error.message === 'EXPIRED_INITDATA')) {
        throw error;
      }
      
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Centralized API client with automatic token refresh
 */
export async function apiClient<T = unknown>(
  url: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { skipAuth = false, retryOn401 = true, retryOnDbColdStart = true, ...fetchOptions } = options;
  const authStore = useAuthStore.getState();
  
  // Проверка authReady: если bootstrap ещё не завершён, ждём
  if (!skipAuth && !authStore.authReady) {
    const userMessage = authStore.language === 'ru'
      ? 'Идёт авторизация…'
      : 'Authorizing...';
    throw new ApiClientError('Auth not ready', userMessage, 'AUTH_NOT_READY');
  }

  let token = authStore.token;

  // Add Authorization header if not skipped
  const headers = new Headers(fetchOptions.headers);
  if (!skipAuth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && (fetchOptions.method === 'POST' || fetchOptions.method === 'PUT' || fetchOptions.method === 'PATCH')) {
    headers.set('Content-Type', 'application/json');
  }

  // Make request
  let response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  // Handle 401/403: try to refresh token and retry once
  if (!skipAuth && (response.status === 401 || response.status === 403) && retryOn401) {
    const errorData = await response.json().catch(() => ({ error: 'Unauthorized' })) as ApiError;
    
    console.log('[API Client] Received 401/403, clearing auth and re-authenticating...', {
      url,
      error: errorData.error,
      code: errorData.code,
    });

    // Clear auth store
    authStore.clearAuth();

    // Try to refresh token (re-authenticate)
    try {
      const newToken = await refreshToken();

      if (newToken) {
        // Retry original request with new token
        headers.set('Authorization', `Bearer ${newToken}`);
        console.log('[API Client] Retrying request with refreshed token...');
        response = await fetch(url, {
          ...fetchOptions,
          headers,
        });
      } else {
        // Refresh failed
        console.error('[API Client] Token refresh failed after clearing old token');
        const userMessage = authStore.language === 'ru'
          ? 'Сессия устарела. Закройте и откройте мини-приложение в Telegram.'
          : 'Session expired. Please close and reopen the mini app in Telegram.';
        throw new ApiClientError(
          errorData.error || 'Authentication failed',
          userMessage,
          errorData.code || 'AUTH_FAILED'
        );
      }
    } catch (error) {
      // Handle specific reauth errors
      if (error instanceof Error && (error.message === 'NO_TELEGRAM_INITDATA' || error.message === 'EXPIRED_INITDATA')) {
        const userMessage = authStore.language === 'ru'
          ? 'Сессия устарела. Закройте и откройте мини-приложение в Telegram.'
          : 'Session expired. Please close and reopen the mini app in Telegram.';
        throw new ApiClientError(
          error.message,
          userMessage,
          error.message === 'EXPIRED_INITDATA' ? 'EXPIRED_INITDATA' : 'NO_TELEGRAM_INITDATA'
        );
      }
      
      // Re-throw ApiClientError as-is
      if (error instanceof ApiClientError) {
        throw error;
      }
      
      // Other errors
      const userMessage = authStore.language === 'ru'
        ? 'Ошибка авторизации. Попробуйте обновить страницу.'
        : 'Authorization error. Please refresh the page.';
      throw new ApiClientError(
        error instanceof Error ? error.message : 'Authentication failed',
        userMessage,
        errorData.code || 'AUTH_FAILED'
      );
    }
  }

  // Handle 503 DB errors (do not refresh token, but may retry once)
  if (response.status === 503) {
    const errorData = await response.json().catch(() => ({ error: 'Service unavailable' })) as ApiError;
    
    if (errorData.code === 'DB_COLD_START' && retryOnDbColdStart) {
      // DB is waking up, wait a bit and retry once
      console.log('[API Client] DB cold start detected, waiting and retrying...', { url });
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Retry once for DB cold start, but keep auth refresh enabled
      return apiClient<T>(url, { ...options, retryOnDbColdStart: false });
    }
    
    // For other 503 errors or if retry disabled, throw with user-friendly message
    const authStore = useAuthStore.getState();
    const message = errorData.code === 'DB_COLD_START'
      ? (authStore.language === 'ru'
          ? 'Сервер запускается, попробуйте ещё раз через пару секунд'
          : 'Server is starting up, please try again in a few seconds')
      : (authStore.language === 'ru'
          ? 'Сервер временно недоступен'
          : 'Server temporarily unavailable');
    
    throw new Error(message);
  }

  // Parse response
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as ApiError;
    console.error('[API Client] Request failed:', {
      url,
      status: response.status,
      error: errorData.error,
      code: errorData.code,
    });
    
    // For session-related errors, show user-friendly message based on error code
    const authStore = useAuthStore.getState();
    let userMessage = errorData.error || `Request failed with status ${response.status}`;
    
    if (errorData.code === 'EXPIRED_INITDATA') {
      userMessage = authStore.language === 'ru'
        ? 'Сессия устарела. Закройте и откройте мини-приложение в Telegram.'
        : 'Session expired. Please close and reopen the mini app in Telegram.';
    } else if (errorData.code === 'INVALID_INITDATA') {
      userMessage = authStore.language === 'ru'
        ? 'Ошибка авторизации Telegram. Откройте мини-приложение заново.'
        : 'Telegram authorization error. Please reopen the mini app.';
    } else if (errorData.code === 'DB_COLD_START' || errorData.code === 'DB_UNAVAILABLE') {
      userMessage = authStore.language === 'ru'
        ? 'Сервер недоступен, попробуйте ещё раз.'
        : 'Server unavailable, please try again.';
    }
    
    throw new ApiClientError(
      errorData.error || `Request failed with status ${response.status}`,
      userMessage,
      errorData.code
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Convenience methods for common HTTP methods
 */
export const api = {
  get: <T = unknown>(url: string, options?: ApiClientOptions) =>
    apiClient<T>(url, { ...options, method: 'GET' }),
  
  post: <T = unknown>(url: string, body?: unknown, options?: ApiClientOptions) =>
    apiClient<T>(url, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  
  put: <T = unknown>(url: string, body?: unknown, options?: ApiClientOptions) =>
    apiClient<T>(url, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  
  delete: <T = unknown>(url: string, options?: ApiClientOptions) =>
    apiClient<T>(url, { ...options, method: 'DELETE' }),
};
