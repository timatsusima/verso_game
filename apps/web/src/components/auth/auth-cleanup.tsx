'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { BUILD_ID } from '@/lib/build-config';

const AUTH_STORAGE_KEY = 'tg-duel-auth';
const BUILD_ID_KEY = 'app_build_id';

/**
 * Clears old auth data when BUILD_ID changes
 * Runs on app startup to prevent stale JWT issues
 */
export function AuthCleanup() {
  // No need to use store methods here, we'll use getState() directly

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Skip cleanup in dev mode to avoid interfering with local development
    if (BUILD_ID === 'dev') {
      return;
    }

    const prevBuildId = localStorage.getItem(BUILD_ID_KEY);
    const currentBuildId = BUILD_ID;

    // If build ID changed, clear old auth data
    if (prevBuildId && prevBuildId !== currentBuildId) {
      console.info('[AuthCleanup] Build ID changed, clearing old auth data', {
        prevBuildId,
        currentBuildId,
      });

      // Clear auth store (this also clears localStorage via clearAuth)
      const { clearAuth } = useAuthStore.getState();
      clearAuth();

      // Update build ID
      localStorage.setItem(BUILD_ID_KEY, currentBuildId);

      // Note: Re-authentication will happen automatically via api-client
      // when the first API request is made after clearing auth
      console.log('[AuthCleanup] Auth cleared. Re-authentication will happen on first API request.');
    } else if (!prevBuildId) {
      // First time - just set build ID
      localStorage.setItem(BUILD_ID_KEY, currentBuildId);
    }
  }, []);

  return null; // This component doesn't render anything
}
