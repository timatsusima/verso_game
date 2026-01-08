'use client';

import { cn } from '@/lib/utils';

interface Option {
  value: string | number;
  label: string;
}

interface SelectProps {
  options: Option[];
  value: string | number;
  onChange: (value: string | number) => void;
  label?: string;
  className?: string;
}

export function Select({ options, value, onChange, label, className }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-tg-text-secondary mb-2">
          {label}
        </label>
      )}
      <div className={cn('flex gap-2', className)}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 h-12 rounded-xl font-medium transition-all duration-200',
              value === option.value
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                : 'bg-tg-bg-secondary text-tg-text-secondary hover:bg-white/10'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
