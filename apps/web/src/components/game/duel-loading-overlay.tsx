'use client';

import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface DuelLoadingOverlayProps {
  isLoading: boolean;
  isComplete: boolean;
  language: 'ru' | 'en';
  topic?: string;
}

const PHASES = {
  ru: [
    'Подбираем вопросы по теме',
    'Настраиваем сложность',
    'Проверяем баланс',
    'Готовим дуэль ⚔️',
  ],
  en: [
    'Selecting questions',
    'Adjusting difficulty',
    'Balancing the duel',
    'Preparing the duel ⚔️',
  ],
};

const TITLES = {
  ru: 'Подготовка дуэли…',
  en: 'Preparing the duel…',
};

export function DuelLoadingOverlay({ 
  isLoading, 
  isComplete, 
  language, 
  topic 
}: DuelLoadingOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const phases = PHASES[language];
  const title = TITLES[language];

  // Handle visibility
  useEffect(() => {
    if (isLoading) {
      setIsVisible(true);
      setProgress(0);
      setPhaseIndex(0);
      startTimeRef.current = Date.now();
    } else if (!isLoading && !isComplete) {
      // Reset if loading cancelled
      setIsVisible(false);
      setProgress(0);
    }
  }, [isLoading, isComplete]);

  // Auto-progress animation (0% to 90%)
  useEffect(() => {
    if (!isLoading || isComplete) return;

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      // Takes ~8 seconds to reach 90%
      // Using easeOutQuad for natural slow-down
      const duration = 8000;
      const t = Math.min(elapsed / duration, 1);
      const eased = t * (2 - t); // easeOutQuad
      const targetProgress = eased * 90;
      
      setProgress(targetProgress);

      if (t < 1 && !isComplete) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isLoading, isComplete]);

  // Complete to 100% when server responds
  useEffect(() => {
    if (isComplete && isVisible) {
      // Animate from current progress to 100%
      const startProgress = progress;
      const startTime = Date.now();
      const duration = 400;

      const animateToComplete = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const newProgress = startProgress + (100 - startProgress) * t;
        setProgress(newProgress);

        if (t < 1) {
          requestAnimationFrame(animateToComplete);
        } else {
          // Hide after brief delay to show 100%
          setTimeout(() => {
            setIsVisible(false);
            setProgress(0);
          }, 300);
        }
      };

      requestAnimationFrame(animateToComplete);
    }
  }, [isComplete, isVisible, progress]);

  // Cycle through phases
  useEffect(() => {
    if (!isLoading || isComplete) return;

    const interval = setInterval(() => {
      setPhaseIndex(prev => (prev + 1) % phases.length);
    }, 900); // Change every 900ms

    return () => clearInterval(interval);
  }, [isLoading, isComplete, phases.length]);

  if (!isVisible) return null;

  return (
    <div 
      className={cn(
        'fixed inset-0 z-50',
        'flex flex-col items-center justify-center',
        'bg-gradient-to-b from-tg-bg via-tg-bg to-tg-bg-secondary',
        'animate-fade-in'
      )}
    >
      {/* Icon with pulse */}
      <div className="mb-8 animate-loading-pulse">
        <span className="text-7xl">⚔️</span>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-white mb-2">
        {title}
      </h1>

      {/* Topic (if provided) */}
      {topic && (
        <p className="text-tg-text-secondary mb-8 text-center px-8 truncate max-w-[280px]">
          «{topic}»
        </p>
      )}

      {/* Progress bar container */}
      <div className="w-64 mb-6">
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={cn(
              'h-full rounded-full transition-all duration-200 ease-out',
              'bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500',
              'animate-shimmer'
            )}
            style={{ 
              width: `${progress}%`,
              backgroundSize: '200% 100%',
            }}
          />
        </div>
        {/* Progress percentage */}
        <p className="text-right text-xs text-tg-hint mt-1 tabular-nums">
          {Math.round(progress)}%
        </p>
      </div>

      {/* Phase text with fade animation */}
      <div className="h-6 relative">
        <p 
          key={phaseIndex}
          className="text-tg-text-secondary animate-phase-fade"
        >
          {phases[phaseIndex]}
        </p>
      </div>

      {/* Decorative dots */}
      <div className="flex gap-2 mt-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              'w-2 h-2 rounded-full bg-white/30',
              'animate-loading-dot'
            )}
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}
