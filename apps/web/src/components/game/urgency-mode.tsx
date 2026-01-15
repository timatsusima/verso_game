'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface UrgencyBannerProps {
  isActive: boolean;
  timeRemaining: number;
  language: 'ru' | 'en';
}

/**
 * Non-blocking banner that shows when opponent answered first.
 * Positioned above the question, doesn't obstruct content.
 */
export function UrgencyBanner({ isActive, timeRemaining, language }: UrgencyBannerProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
      // Vibrate on activation
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([80, 40, 80]);
      }
    } else {
      setIsVisible(false);
    }
  }, [isActive]);

  if (!isVisible) return null;

  const isCritical = timeRemaining <= 5;
  const text = language === 'ru' 
    ? '⚡ Соперник ответил. У тебя' 
    : '⚡ Opponent answered. You have';

  return (
    <div
      className={cn(
        'w-full py-3 px-4 rounded-xl mb-4',
        'flex items-center justify-center gap-3',
        'transition-all duration-300',
        'animate-urgency-slide-in',
        isCritical 
          ? 'bg-gradient-to-r from-red-600/30 to-red-500/30 border border-red-500/50' 
          : 'bg-gradient-to-r from-orange-600/25 to-amber-500/25 border border-orange-500/40'
      )}
    >
      <span className={cn(
        'text-sm font-medium',
        isCritical ? 'text-red-300' : 'text-orange-300'
      )}>
        {text}
      </span>
      <span className={cn(
        'text-xl font-black tabular-nums min-w-[2ch]',
        isCritical ? 'text-red-400 animate-pulse-fast' : 'text-orange-400 animate-pulse'
      )}>
        {timeRemaining}
      </span>
      <span className={cn(
        'text-sm font-medium',
        isCritical ? 'text-red-300' : 'text-orange-300'
      )}>
        {language === 'ru' ? 'сек' : 'sec'}
      </span>
    </div>
  );
}

/**
 * Vignette effect around screen edges.
 * Doesn't obstruct center content, creates focus effect.
 */
export function UrgencyVignette({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;

  return (
    <div 
      className={cn(
        'fixed inset-0 pointer-events-none z-40',
        'animate-fade-in'
      )}
      style={{
        background: `radial-gradient(
          ellipse 80% 70% at 50% 50%,
          transparent 40%,
          rgba(239, 68, 68, 0.08) 70%,
          rgba(239, 68, 68, 0.15) 100%
        )`,
      }}
    />
  );
}

/**
 * Enhanced timer for urgency mode.
 * Large, prominent, with pulsing animation.
 */
interface UrgencyTimerProps {
  seconds: number;
  isUrgencyMode: boolean;
}

export function UrgencyTimer({ seconds, isUrgencyMode }: UrgencyTimerProps) {
  const isCritical = seconds <= 5;
  const isVeryLow = seconds <= 3;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          'font-mono font-black tabular-nums transition-all duration-300',
          // Size based on mode
          isUrgencyMode ? 'text-6xl' : 'text-4xl',
          // Color based on time
          !isUrgencyMode && seconds > 10 && 'text-tg-text',
          !isUrgencyMode && seconds <= 10 && seconds > 5 && 'text-duel-warning animate-pulse',
          isUrgencyMode && !isCritical && 'text-orange-400 animate-urgency-pulse',
          isUrgencyMode && isCritical && !isVeryLow && 'text-red-400 animate-urgency-pulse',
          isUrgencyMode && isVeryLow && 'text-red-400 animate-urgency-shake',
          // Shadow for urgency
          isUrgencyMode && 'drop-shadow-[0_0_15px_rgba(251,146,60,0.5)]',
          isUrgencyMode && isCritical && 'drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]'
        )}
      >
        {seconds}
      </div>
      
      {/* Progress bar */}
      <div className={cn(
        'h-2 rounded-full overflow-hidden transition-all duration-300',
        isUrgencyMode ? 'w-24' : 'w-16',
        'bg-white/10'
      )}>
        <div
          className={cn(
            'h-full transition-all duration-1000 ease-linear rounded-full',
            !isUrgencyMode && seconds > 10 && 'bg-blue-500',
            !isUrgencyMode && seconds <= 10 && 'bg-duel-warning',
            isUrgencyMode && !isCritical && 'bg-orange-500 animate-pulse',
            isUrgencyMode && isCritical && 'bg-red-500 animate-pulse-fast'
          )}
          style={{ width: `${(seconds / (isUrgencyMode ? 10 : 60)) * 100}%` }}
        />
      </div>
    </div>
  );
}
