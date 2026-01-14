'use client';

import { cn } from '@/lib/utils';
import { useTranslations } from '@/hooks/use-translations';

export type PlayerStatus = 'thinking' | 'answered' | 'didntAnswer';

interface PlayerInfo {
  id: string;
  name: string;
  score: number;
  status: PlayerStatus;
  isFirst?: boolean;
  timeMs?: number | null;
}

interface DuelHeaderProps {
  creator: PlayerInfo;
  opponent: PlayerInfo;
  myId: string;
  showResult?: boolean;
  className?: string;
}

export function DuelHeader({ creator, opponent, myId, showResult, className }: DuelHeaderProps) {
  const { t } = useTranslations();
  
  const isCreator = myId === creator.id;
  const me = isCreator ? creator : opponent;
  const rival = isCreator ? opponent : creator;

  const getStatusText = (status: PlayerStatus) => {
    switch (status) {
      case 'thinking': return t('thinking');
      case 'answered': return t('answered');
      case 'didntAnswer': return t('didntAnswer');
    }
  };

  const getStatusColor = (status: PlayerStatus) => {
    switch (status) {
      case 'thinking': return 'text-yellow-400';
      case 'answered': return 'text-green-400';
      case 'didntAnswer': return 'text-red-400';
    }
  };

  const formatTime = (ms: number | null | undefined) => {
    if (ms === null || ms === undefined) return t('noAnswer');
    return `${(ms / 1000).toFixed(1)}с`;
  };

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      {/* My side (left) */}
      <div className="flex-1">
        <div className="bg-gradient-to-r from-blue-500/20 to-transparent rounded-xl p-3 border border-blue-500/30">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-blue-400">{me.score}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-white truncate">{me.name}</span>
                {me.isFirst && (
                  <span className="flex items-center gap-0.5 text-xs text-yellow-400 animate-pulse">
                    <span>⚡</span>
                    <span className="hidden sm:inline">{t('answeredFirst')}</span>
                  </span>
                )}
              </div>
              <div className={cn('text-xs', getStatusColor(me.status))}>
                {showResult && me.timeMs !== undefined ? formatTime(me.timeMs) : getStatusText(me.status)}
              </div>
            </div>
          </div>
          {/* Animated border when answered */}
          {me.status === 'answered' && !showResult && (
            <div className="absolute inset-0 rounded-xl border-2 border-green-400/50 animate-ping pointer-events-none" />
          )}
        </div>
      </div>
      
      {/* VS badge */}
      <div className="flex flex-col items-center px-2">
        <span className="text-xs font-bold text-tg-hint">VS</span>
      </div>
      
      {/* Rival side (right) */}
      <div className="flex-1">
        <div className={cn(
          'bg-gradient-to-l from-red-500/20 to-transparent rounded-xl p-3 border border-red-500/30 relative overflow-hidden',
          rival.status === 'answered' && !showResult && 'rival-answered-pulse'
        )}>
          <div className="flex items-center gap-2 flex-row-reverse">
            <span className="text-2xl font-bold text-red-400">{rival.score}</span>
            <div className="flex-1 min-w-0 text-right">
              <div className="flex items-center gap-1.5 justify-end">
                {rival.isFirst && (
                  <span className="flex items-center gap-0.5 text-xs text-yellow-400 animate-pulse">
                    <span className="hidden sm:inline">{t('answeredFirst')}</span>
                    <span>⚡</span>
                  </span>
                )}
                <span className="font-semibold text-white truncate">{rival.name}</span>
              </div>
              <div className={cn('text-xs', getStatusColor(rival.status))}>
                {showResult && rival.timeMs !== undefined ? formatTime(rival.timeMs) : getStatusText(rival.status)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
