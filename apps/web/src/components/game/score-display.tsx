'use client';

import { cn } from '@/lib/utils';

interface Player {
  name: string;
  score: number;
  isMe?: boolean;
  hasAnswered?: boolean;
}

interface ScoreDisplayProps {
  player1: Player;
  player2?: Player | null;
  className?: string;
}

export function ScoreDisplay({ player1, player2, className }: ScoreDisplayProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {/* Player 1 */}
      <div className="flex-1 text-center">
        <div className="text-sm text-tg-text-secondary truncate mb-1">
          {player1.isMe ? '🎯 ' : ''}{player1.name}
        </div>
        <div
          className={cn(
            'text-3xl font-bold transition-all',
            player1.hasAnswered && 'text-duel-correct'
          )}
        >
          {player1.score}
        </div>
      </div>

      {/* VS */}
      <div className="text-xl font-bold text-tg-hint">VS</div>

      {/* Player 2 */}
      <div className="flex-1 text-center">
        {player2 ? (
          <>
            <div className="text-sm text-tg-text-secondary truncate mb-1">
              {player2.isMe ? '🎯 ' : ''}{player2.name}
            </div>
            <div
              className={cn(
                'text-3xl font-bold transition-all',
                player2.hasAnswered && 'text-duel-correct'
              )}
            >
              {player2.score}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-tg-text-secondary mb-1">
              ???
            </div>
            <div className="text-3xl font-bold text-tg-hint">
              -
            </div>
          </>
        )}
      </div>
    </div>
  );
}
