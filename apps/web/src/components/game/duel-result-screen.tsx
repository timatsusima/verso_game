'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type DuelOutcome = 'win' | 'lose' | 'draw';

interface DuelStats {
  correctAnswers: number;
  totalQuestions: number;
  fasterInQuestions: number;
  bestStreak: number;
}

interface DuelResultScreenProps {
  outcome: DuelOutcome;
  myScore: number;
  opponentScore: number;
  opponentName: string;
  topic: string;
  stats?: DuelStats;
  language: 'ru' | 'en';
  onRematch: () => void;
  onNewTopic: () => void;
  onShare?: () => void;
  isLoadingRematch?: boolean;
}

const TRANSLATIONS = {
  ru: {
    win: {
      title: 'Победа!',
      subtitle: 'Ты оказался быстрее и точнее',
      emoji: '🏆',
    },
    lose: {
      title: 'Поражение',
      subtitle: 'Соперник был сильнее',
      emoji: '💪',
    },
    draw: {
      title: 'Ничья!',
      subtitle: 'Бой равных',
      emoji: '⚔️',
    },
    you: 'Ты',
    opponent: 'Соперник',
    correctOf: 'правильных из',
    fasterIn: 'Быстрее в',
    questions: 'вопросах',
    bestStreak: 'Лучшая серия',
    inARow: 'подряд',
    rematch: 'Реванш',
    changeTopic: 'Сменить тему',
    share: 'Поделиться',
    drawChallenge: 'Решит реванш?',
  },
  en: {
    win: {
      title: 'Victory!',
      subtitle: 'You were faster and more accurate',
      emoji: '🏆',
    },
    lose: {
      title: 'Defeat',
      subtitle: 'Opponent was stronger',
      emoji: '💪',
    },
    draw: {
      title: 'Draw!',
      subtitle: 'Battle of equals',
      emoji: '⚔️',
    },
    you: 'You',
    opponent: 'Opponent',
    correctOf: 'correct out of',
    fasterIn: 'Faster in',
    questions: 'questions',
    bestStreak: 'Best streak',
    inARow: 'in a row',
    rematch: 'Rematch',
    changeTopic: 'Change topic',
    share: 'Share',
    drawChallenge: 'Rematch decides?',
  },
};

export function DuelResultScreen({
  outcome,
  myScore,
  opponentScore,
  opponentName,
  topic,
  stats,
  language,
  onRematch,
  onNewTopic,
  onShare,
  isLoadingRematch,
}: DuelResultScreenProps) {
  const t = TRANSLATIONS[language];
  const outcomeData = t[outcome];
  const [isVisible, setIsVisible] = useState(false);

  // Trigger entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Vibration feedback
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (outcome === 'win') {
        navigator.vibrate([50, 30, 50, 30, 100]); // Victory pattern
      } else if (outcome === 'lose') {
        navigator.vibrate([100, 50, 100]); // Defeat pattern
      } else {
        navigator.vibrate([70, 70]); // Draw pattern
      }
    }
  }, [outcome]);

  // Truncate opponent name
  const displayOpponentName = opponentName.length > 12 
    ? opponentName.slice(0, 10) + '...' 
    : opponentName;

  return (
    <div 
      className={cn(
        'flex-1 flex flex-col p-6 relative overflow-hidden',
        // Background based on outcome
        outcome === 'win' && 'result-bg-win',
        outcome === 'lose' && 'result-bg-lose',
        outcome === 'draw' && 'result-bg-draw',
        // Entrance animation
        'transition-all duration-500 ease-out',
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'
      )}
    >
      {/* Confetti for WIN */}
      {outcome === 'win' && <Confetti />}

      {/* Header with emoji and title */}
      <div className={cn(
        'text-center mb-6 pt-4',
        'animate-result-reveal'
      )}>
        {/* Main emoji with glow */}
        <div className={cn(
          'text-8xl mb-4 inline-block',
          outcome === 'win' && 'animate-trophy-bounce drop-shadow-[0_0_30px_rgba(234,179,8,0.5)]',
          outcome === 'draw' && 'animate-draw-shake',
          outcome === 'lose' && 'opacity-80'
        )}>
          {outcomeData.emoji}
        </div>

        {/* Title */}
        <h1 className={cn(
          'text-4xl font-black mb-2 tracking-tight',
          outcome === 'win' && 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-300 animate-shimmer',
          outcome === 'lose' && 'text-red-400/90',
          outcome === 'draw' && 'text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200'
        )}>
          {outcomeData.title}
        </h1>

        {/* Subtitle */}
        <p className={cn(
          'text-lg',
          outcome === 'win' && 'text-green-300/90',
          outcome === 'lose' && 'text-tg-text-secondary',
          outcome === 'draw' && 'text-amber-200/80'
        )}>
          {outcomeData.subtitle}
        </p>
      </div>

      {/* Score Card */}
      <Card 
        variant="glass" 
        className={cn(
          'mb-5 animate-slide-up',
          outcome === 'win' && 'ring-2 ring-yellow-500/30',
          outcome === 'lose' && 'ring-1 ring-red-500/20',
          outcome === 'draw' && 'ring-2 ring-amber-500/30'
        )}
        style={{ animationDelay: '0.15s' }}
      >
        <div className="py-6">
          <div className="flex items-center justify-center gap-6">
            {/* My Score */}
            <div className="text-center flex-1">
              <p className={cn(
                'text-sm mb-1',
                outcome === 'win' ? 'text-green-400' : 'text-tg-text-secondary'
              )}>
                {t.you}
              </p>
              <p className={cn(
                'text-6xl font-black tabular-nums transition-all',
                outcome === 'win' && 'text-white drop-shadow-[0_0_20px_rgba(34,197,94,0.5)]',
                outcome === 'lose' && 'text-tg-text-secondary',
                outcome === 'draw' && 'text-white'
              )}>
                {myScore}
              </p>
            </div>

            {/* VS Divider */}
            <div className={cn(
              'text-3xl font-bold',
              outcome === 'draw' ? 'text-amber-400' : 'text-tg-hint'
            )}>
              :
            </div>

            {/* Opponent Score */}
            <div className="text-center flex-1">
              <p className={cn(
                'text-sm mb-1 truncate px-2',
                outcome === 'lose' ? 'text-red-400' : 'text-tg-text-secondary'
              )}>
                {displayOpponentName}
              </p>
              <p className={cn(
                'text-6xl font-black tabular-nums transition-all',
                outcome === 'lose' && 'text-white drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]',
                outcome === 'win' && 'text-tg-text-secondary',
                outcome === 'draw' && 'text-white'
              )}>
                {opponentScore}
              </p>
            </div>
          </div>
        </div>

        {/* Topic */}
        <div className="border-t border-white/10 pt-3 pb-1">
          <p className="text-center text-sm text-tg-hint truncate px-4">
            {topic}
          </p>
        </div>
      </Card>

      {/* Quick Stats */}
      {stats && (
        <div 
          className={cn(
            'mb-5 space-y-2 animate-slide-up',
            'text-sm'
          )}
          style={{ animationDelay: '0.25s' }}
        >
          {/* Correct answers */}
          <div className="flex items-center justify-center gap-2 text-tg-text-secondary">
            <span className="text-lg">✅</span>
            <span>
              {stats.correctAnswers} {t.correctOf} {stats.totalQuestions}
            </span>
          </div>

          {/* Faster in X questions */}
          {stats.fasterInQuestions > 0 && (
            <div className="flex items-center justify-center gap-2 text-tg-text-secondary">
              <span className="text-lg">⚡</span>
              <span>
                {t.fasterIn} {stats.fasterInQuestions} {t.questions}
              </span>
            </div>
          )}

          {/* Best streak */}
          {stats.bestStreak >= 2 && (
            <div className="flex items-center justify-center gap-2 text-tg-text-secondary">
              <span className="text-lg">🔥</span>
              <span>
                {t.bestStreak}: {stats.bestStreak} {t.inARow}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Draw special message */}
      {outcome === 'draw' && (
        <div 
          className="text-center mb-4 animate-pulse"
          style={{ animationDelay: '0.3s' }}
        >
          <p className="text-amber-300 font-medium text-lg">
            🤝 {t.drawChallenge}
          </p>
        </div>
      )}

      {/* CTA Buttons */}
      <div 
        className="space-y-3 mt-auto animate-slide-up"
        style={{ animationDelay: '0.35s' }}
      >
        {/* Primary: Rematch */}
        <Button
          fullWidth
          size="lg"
          onClick={onRematch}
          isLoading={isLoadingRematch}
          className={cn(
            'font-bold text-lg h-14 transition-all',
            outcome === 'win' && 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-lg shadow-green-500/30',
            outcome === 'lose' && 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 shadow-lg shadow-orange-500/30',
            outcome === 'draw' && 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 shadow-lg shadow-amber-500/30 text-black'
          )}
        >
          {outcome === 'lose' ? '🔥' : '⚔️'} {t.rematch}
        </Button>

        {/* Secondary: Change Topic */}
        <Button
          fullWidth
          variant="secondary"
          onClick={onNewTopic}
          className="font-medium"
        >
          ✏️ {t.changeTopic}
        </Button>

        {/* Tertiary: Share (optional) */}
        {onShare && (
          <Button
            fullWidth
            variant="ghost"
            onClick={onShare}
            className="text-tg-text-secondary"
          >
            📤 {t.share}
          </Button>
        )}
      </div>
    </div>
  );
}

// CSS Confetti component (pure CSS, lightweight)
function Confetti() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Confetti particles */}
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="confetti-particle"
          style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 0.5}s`,
            backgroundColor: ['#FFD700', '#34D399', '#60A5FA', '#F472B6', '#A78BFA'][i % 5],
          }}
        />
      ))}
    </div>
  );
}
