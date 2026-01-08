'use client';

import { cn } from '@/lib/utils';

interface TimerProps {
  seconds: number;
  maxSeconds?: number;
  variant?: 'default' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
}

export function Timer({
  seconds,
  maxSeconds = 60,
  variant = 'default',
  size = 'md',
  showProgress = true,
}: TimerProps) {
  const progress = (seconds / maxSeconds) * 100;
  
  const getVariant = () => {
    if (variant !== 'default') return variant;
    if (seconds <= 5) return 'danger';
    if (seconds <= 10) return 'warning';
    return 'default';
  };

  const currentVariant = getVariant();

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          'font-mono font-bold tabular-nums',
          size === 'sm' && 'text-2xl',
          size === 'md' && 'text-4xl',
          size === 'lg' && 'text-6xl',
          currentVariant === 'default' && 'text-tg-text',
          currentVariant === 'warning' && 'text-duel-warning animate-pulse',
          currentVariant === 'danger' && 'text-duel-incorrect animate-pulse-fast'
        )}
      >
        {seconds}
      </div>
      
      {showProgress && (
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-1000 ease-linear rounded-full',
              currentVariant === 'default' && 'bg-blue-500',
              currentVariant === 'warning' && 'bg-duel-warning',
              currentVariant === 'danger' && 'bg-duel-incorrect'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
