import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '@tg-duel/shared';

interface AuthState {
  token: string | null;
  userId: string | null;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  language: Language;
  isAuthenticated: boolean;
  authReady: boolean;
  authError: string | null;
  
  // Actions
  setAuth: (data: {
    token: string;
    userId: string;
    telegramId: string;
    username: string | null;
    firstName: string;
    language: Language;
  }) => void;
  setToken: (token: string) => void;
  setUser: (user: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string;
    language: Language;
  }) => void;
  setLanguage: (language: Language) => void;
  setAuthReady: (ready: boolean) => void;
  setAuthError: (error: string | null) => void;
  logout: () => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      telegramId: null,
      username: null,
      firstName: null,
      language: 'en',
      isAuthenticated: false,
      authReady: false,
      authError: null,

      setAuth: (data) =>
        set({
          token: data.token,
          userId: data.userId,
          telegramId: data.telegramId,
          username: data.username,
          firstName: data.firstName,
          language: data.language,
          isAuthenticated: true,
          authReady: true,
          authError: null,
        }),

      setToken: (token) =>
        set({
          token,
          isAuthenticated: !!token,
        }),

      setUser: (user) =>
        set({
          userId: user.id,
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          language: user.language,
        }),

      setLanguage: (language) => set({ language }),

      setAuthReady: (ready) => set({ authReady: ready }),

      setAuthError: (error) => set({ authError: error, authReady: true }),

      logout: () =>
        set({
          token: null,
          userId: null,
          telegramId: null,
          username: null,
          firstName: null,
          isAuthenticated: false,
          authReady: false,
          authError: null,
        }),

      clearAuth: () => {
        // Clear Zustand store
        set({
          token: null,
          userId: null,
          telegramId: null,
          username: null,
          firstName: null,
          isAuthenticated: false,
          authReady: false,
          authError: null,
        });
        
        // Clear localStorage directly
        if (typeof window !== 'undefined') {
          localStorage.removeItem('tg-duel-auth');
        }
      },
    }),
    {
      name: 'tg-duel-auth',
      partialize: (state) => ({
        token: state.token,
        userId: state.userId,
        telegramId: state.telegramId,
        username: state.username,
        firstName: state.firstName,
        language: state.language,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
