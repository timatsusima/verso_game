'use client';

import { cn } from '@/lib/utils';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Header({ title, subtitle, className, children }: HeaderProps) {
  return (
    <header className={cn('py-4 px-4', className)}>
      <div className="flex items-center justify-between">
        <div>
          {title && (
            <h1 className="text-xl font-bold text-tg-text">{title}</h1>
          )}
          {subtitle && (
            <p className="text-sm text-tg-text-secondary mt-1">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </header>
  );
}
