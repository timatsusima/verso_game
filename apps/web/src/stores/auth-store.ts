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
  
  // Actions
  setAuth: (data: {
    token: string;
    userId: string;
    telegramId: string;
    username: string | null;
    firstName: string;
    language: Language;
  }) => void;
  setLanguage: (language: Language) => void;
  logout: () => void;
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

      setAuth: (data) =>
        set({
          token: data.token,
          userId: data.userId,
          telegramId: data.telegramId,
          username: data.username,
          firstName: data.firstName,
          language: data.language,
          isAuthenticated: true,
        }),

      setLanguage: (language) => set({ language }),

      logout: () =>
        set({
          token: null,
          userId: null,
          telegramId: null,
          username: null,
          firstName: null,
          isAuthenticated: false,
        }),
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
