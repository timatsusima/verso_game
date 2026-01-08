'use client';

import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'glass';
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-6',
        variant === 'default' && 'bg-tg-bg-secondary',
        variant === 'bordered' && 'bg-tg-bg-secondary border border-white/10',
        variant === 'glass' && 'bg-white/5 backdrop-blur-lg border border-white/10',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
