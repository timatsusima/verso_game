'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/hooks/use-translations';

interface SecondTimerOverlayProps {
  isActive: boolean;
  timeRemaining: number; // in seconds
  onClose?: () => void;
}

export function SecondTimerOverlay({ isActive, timeRemaining, onClose }: SecondTimerOverlayProps) {
  const { t } = useTranslations();
  const [isVisible, setIsVisible] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  useEffect(() => {
    if (isActive && !hasShown) {
      setIsVisible(true);
      setHasShown(true);
      
      // Vibrate to alert user
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100, 50, 100]);
      }

      // Auto-hide the big overlay after 2 seconds, but keep the timer urgent
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isActive, hasShown]);

  // Reset hasShown when no longer active (new question)
  useEffect(() => {
    if (!isActive) {
      setHasShown(false);
      setIsVisible(false);
    }
  }, [isActive]);

  if (!isVisible) return null;

  const isUrgent = timeRemaining <= 3;

  return (
    <div 
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        'bg-black/40 backdrop-blur-sm',
        'animate-fade-in'
      )}
      onClick={onClose}
    >
      <div className={cn(
        'flex flex-col items-center gap-4 p-8 rounded-3xl',
        'bg-gradient-to-b from-orange-600/90 to-red-700/90',
        'border-4',
        isUrgent ? 'border-red-400 animate-shake' : 'border-orange-400',
        'shadow-2xl shadow-red-500/50',
        'animate-scale-in'
      )}>
        {/* Big timer number */}
        <div className={cn(
          'text-8xl font-black tabular-nums',
          isUrgent ? 'text-red-200 animate-pulse' : 'text-white'
        )}>
          {timeRemaining}
        </div>
        
        {/* Message */}
        <div className="text-xl font-bold text-white text-center animate-pulse">
          {t('youHave10Seconds')}
        </div>
        
        {/* Pulsing ring */}
        <div className={cn(
          'absolute inset-0 rounded-3xl border-4',
          isUrgent ? 'border-red-300' : 'border-orange-300',
          'animate-ping opacity-30'
        )} />
      </div>
    </div>
  );
}
