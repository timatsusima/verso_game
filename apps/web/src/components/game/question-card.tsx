'use client';

import { cn } from '@/lib/utils';
import type { SanitizedQuestion } from '@tg-duel/shared';

interface QuestionCardProps {
  question: SanitizedQuestion;
  selectedAnswer: number | null;
  correctAnswer?: number | null;
  disabled?: boolean;
  onAnswer: (index: number) => void;
  showResult?: boolean;
  isUrgencyMode?: boolean;
}

const optionLabels = ['A', 'B', 'C', 'D'];

export function QuestionCard({
  question,
  selectedAnswer,
  correctAnswer,
  disabled,
  onAnswer,
  showResult = false,
  isUrgencyMode = false,
}: QuestionCardProps) {
  const getOptionState = (index: number) => {
    if (!showResult) {
      return selectedAnswer === index ? 'selected' : 'default';
    }
    
    if (index === correctAnswer) return 'correct';
    if (selectedAnswer === index && index !== correctAnswer) return 'incorrect';
    return 'default';
  };

  return (
    <div className="w-full animate-slide-up">
      {/* Question Text */}
      <div className="mb-6 p-4 bg-white/5 rounded-2xl">
        <p className="text-xl font-medium text-tg-text leading-relaxed">
          {question.text}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {question.options.map((option, index) => {
          const state = getOptionState(index);
          
          return (
            <button
              key={index}
              onClick={() => !disabled && !showResult && onAnswer(index)}
              disabled={disabled || showResult}
              className={cn(
                'w-full p-4 rounded-xl text-left transition-all duration-200',
                'flex items-center gap-4 group',
                state === 'default' && !isUrgencyMode && 'bg-tg-bg-secondary hover:bg-white/10 border border-white/5',
                state === 'default' && isUrgencyMode && 'bg-tg-bg-secondary hover:bg-white/10 border border-orange-500/40 animate-urgency-option-pulse',
                state === 'selected' && 'bg-blue-500/20 border-2 border-blue-500',
                state === 'correct' && 'bg-duel-correct/20 border-2 border-duel-correct animate-scale-in',
                state === 'incorrect' && 'bg-duel-incorrect/20 border-2 border-duel-incorrect animate-shake',
                disabled && !showResult && 'opacity-50 cursor-not-allowed'
              )}
            >
              {/* Option Label */}
              <span
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg shrink-0',
                  state === 'default' && 'bg-white/10 text-tg-text-secondary group-hover:bg-white/20',
                  state === 'selected' && 'bg-blue-500 text-white',
                  state === 'correct' && 'bg-duel-correct text-white',
                  state === 'incorrect' && 'bg-duel-incorrect text-white'
                )}
              >
                {optionLabels[index]}
              </span>

              {/* Option Text */}
              <span
                className={cn(
                  'flex-1 font-medium',
                  state === 'default' && 'text-tg-text',
                  state === 'selected' && 'text-blue-400',
                  state === 'correct' && 'text-duel-correct',
                  state === 'incorrect' && 'text-duel-incorrect'
                )}
              >
                {option}
              </span>

              {/* Result Icon */}
              {showResult && state === 'correct' && (
                <span className="text-duel-correct text-2xl">✓</span>
              )}
              {showResult && state === 'incorrect' && (
                <span className="text-duel-incorrect text-2xl">✗</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
