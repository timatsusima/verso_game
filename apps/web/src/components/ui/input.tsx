'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-tg-text-secondary mb-2">
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            'w-full h-12 px-4 rounded-xl bg-tg-bg-secondary text-tg-text',
            'border border-white/10 outline-none transition-all duration-200',
            'placeholder:text-tg-hint',
            'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
