'use client';

import { useState, useRef, useEffect } from 'react';
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
  variant?: 'buttons' | 'dropdown';
}

export function Select({ options, value, onChange, label, className, variant = 'buttons' }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  if (variant === 'dropdown') {
    return (
      <div className="w-full" ref={dropdownRef}>
        {label && (
          <label className="block text-sm font-medium text-tg-text-secondary mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              'w-full h-12 px-4 rounded-xl font-medium transition-all duration-200',
              'bg-tg-bg-secondary text-tg-text flex items-center justify-between',
              'border border-white/10 hover:border-white/20',
              className
            )}
          >
            <span>{selectedOption?.label || 'Select...'}</span>
            <span className={cn('transition-transform', isOpen && 'rotate-180')}>▼</span>
          </button>
          
          {isOpen && (
            <div className="absolute z-50 w-full mt-2 py-2 bg-tg-bg-secondary rounded-xl border border-white/10 shadow-xl animate-scale-in">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full px-4 py-3 text-left transition-colors',
                    'hover:bg-white/10',
                    value === option.value
                      ? 'text-blue-400 bg-blue-500/10'
                      : 'text-tg-text'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default: buttons variant
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
