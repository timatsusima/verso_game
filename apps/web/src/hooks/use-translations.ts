'use client';

import { useAuthStore } from '@/stores/auth-store';
import { TRANSLATIONS, type TranslationKey } from '@tg-duel/shared';

export function useTranslations() {
  const language = useAuthStore((state) => state.language);
  
  const t = (key: TranslationKey): string => {
    return TRANSLATIONS[language][key] || key;
  };
  
  return { t, language };
}
