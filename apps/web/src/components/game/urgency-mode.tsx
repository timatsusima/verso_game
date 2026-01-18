'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface UrgencyHUDProps {
  isActive: boolean;
  timeRemaining: number;
  language: 'ru' | 'en';
}

/**
 * Compact HUD bar for urgency mode.
 * Shows when opponent answered first, displays countdown.
 * Fixed height to prevent layout shift.
 */
export function UrgencyHUD({ isActive, timeRemaining, language }: UrgencyHUDProps) {
  useEffect(() => {
    if (isActive && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([80, 40, 80]);
    }
  }, [isActive]);

  const isCritical = timeRemaining <= 5;
  const text = language === 'ru' 
    ? 'Соперник ответил первым — осталось' 
    : 'Opponent answered first —';

  return (
    <div
      className={cn(
        'h-10 flex items-center justify-center gap-2',
        'transition-all duration-300',
        isActive 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 -translate-y-2 pointer-events-none'
      )}
    >
      {isActive && (
        <div
          className={cn(
            'max-w-md mx-auto px-4 py-2 rounded-lg',
            'flex items-center justify-center gap-2',
            'text-sm font-medium',
            isCritical 
              ? 'bg-red-500/20 border border-red-500/40 text-red-300' 
              : 'bg-orange-500/20 border border-orange-500/40 text-orange-300'
          )}
        >
          <span>⚡</span>
          <span>{text}</span>
          <span className={cn(
            'font-black tabular-nums min-w-[2ch]',
            isCritical ? 'text-red-400' : 'text-orange-400'
          )}>
            {timeRemaining}
          </span>
          <span className="text-xs">{language === 'ru' ? 'сек' : 'sec'}</span>
        </div>
      )}
    </div>
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
          // Size - keep consistent, don't change size in urgency mode
          'text-4xl',
          // Color based on mode and time
          !isUrgencyMode && seconds > 10 && 'text-tg-text',
          !isUrgencyMode && seconds <= 10 && seconds > 5 && 'text-duel-warning animate-pulse',
          isUrgencyMode && !isCritical && 'text-orange-400',
          isUrgencyMode && isCritical && !isVeryLow && 'text-red-400',
          isUrgencyMode && isVeryLow && 'text-red-400',
          // Subtle pulse animation for urgency
          isUrgencyMode && 'animate-[pulse_1s_ease-in-out_infinite]',
          // Subtle glow for urgency
          isUrgencyMode && !isCritical && 'drop-shadow-[0_0_10px_rgba(251,146,60,0.4)]',
          isUrgencyMode && isCritical && 'drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]'
        )}
      >
        {seconds}
      </div>
      
      {/* Progress bar */}
      <div className={cn(
        'h-2 rounded-full overflow-hidden transition-all duration-300',
        'w-16',
        'bg-white/10'
      )}>
        <div
          className={cn(
            'h-full transition-all duration-1000 ease-linear rounded-full',
            !isUrgencyMode && seconds > 10 && 'bg-blue-500',
            !isUrgencyMode && seconds <= 10 && 'bg-duel-warning',
            isUrgencyMode && !isCritical && 'bg-orange-500',
            isUrgencyMode && isCritical && 'bg-red-500'
          )}
          style={{ width: `${(seconds / (isUrgencyMode ? 10 : 60)) * 100}%` }}
        />
      </div>
    </div>
  );
}
