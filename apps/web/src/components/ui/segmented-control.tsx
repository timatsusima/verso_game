'use client';

import { cn } from '@/lib/utils';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex((opt) => opt.value === value);

  return (
    <div
      className={cn(
        'relative flex rounded-xl bg-white/5 p-1',
        className
      )}
      role="tablist"
    >
      {/* Active indicator */}
      <div
        className="absolute top-1 bottom-1 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-200 ease-out"
        style={{
          left: `${(activeIndex * 100) / options.length + 1}%`,
          width: `${100 / options.length - 2}%`,
        }}
      />
      
      {/* Segments */}
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative z-10 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200',
            'h-9 flex items-center justify-center',
            value === option.value
              ? 'text-white'
              : 'text-tg-text-secondary hover:text-tg-text'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
