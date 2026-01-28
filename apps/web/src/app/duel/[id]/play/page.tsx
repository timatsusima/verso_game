'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useDuelStore } from '@/stores/duel-store';
import { useSocket } from '@/hooks/use-socket';
import { useTranslations } from '@/hooks/use-translations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { QuestionCard } from '@/components/game/question-card';
import { ScoreDisplay } from '@/components/game/score-display';
import { ProgressBar } from '@/components/game/progress-bar';
import { DuelHeader, type PlayerStatus } from '@/components/game/duel-header';
import { DuelToasts, useDuelToasts } from '@/components/game/duel-toasts';
import { UrgencyHUD, UrgencyTimer } from '@/components/game/urgency-mode';
import { DuelResultScreen, type DuelOutcome } from '@/components/game/duel-result-screen';
import { DuelLoadingOverlay } from '@/components/game/duel-loading-overlay';
import { H2HStatsDisplay } from '@/components/game/h2h-stats';
import { cn } from '@/lib/utils';
import type { PlayerAnswerInfo } from '@tg-duel/shared';

interface PlayerTimingInfo {
  playerId: string;
  timeMs: number | null;
  isFirst: boolean;
}

// Calculate best streak of correct answers
function calculateBestStreak(
  results: Array<{ creatorCorrect: boolean; opponentCorrect: boolean }>,
  myUserId: string,
  amICreator: boolean
): number {
  let bestStreak = 0;
  let currentStreak = 0;

  for (const result of results) {
    const wasCorrect = amICreator ? result.creatorCorrect : result.opponentCorrect;
    if (wasCorrect) {
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return bestStreak;
}

export default function PlayPage() {
  const params = useParams();
  const router = useRouter();
  const { t, language } = useTranslations();
  const { token, userId, firstName } = useAuthStore();
  
  const {
    status,
    topic,
    currentQuestion,
    currentQuestionIndex,
    totalQuestions,
    timeRemaining,
    isLocked,
    lockTimeRemaining,
    myAnswer,
    hasAnswered,
    opponentAnswered,
    creator,
    opponent,
    myPlayerId,
    questionResults,
    finalResult,
    isConnected,
    error,
    isRanked,
    setMyAnswer,
    reset,
  } = useDuelStore();

  const duelId = params.id as string;
  const { submitAnswer, startDuel, socket, requestRematch, acceptRematch, declineRematch } = useSocket(duelId);
  
  // UI State
  const [showResult, setShowResult] = useState(false);
  const [lastResult, setLastResult] = useState<typeof questionResults[0] | null>(null);
  const [showRematchOptions, setShowRematchOptions] = useState(false);
  const [rematchRequest, setRematchRequest] = useState<{ fromPlayerId: string; fromPlayerName: string } | null>(null);
  // SINGLE SOURCE OF TRUTH: только rematchState и rematchNewDuelId
  const [rematchState, setRematchState] = useState<'idle' | 'pending' | 'accepted'>('idle');
  const [rematchNewDuelId, setRematchNewDuelId] = useState<string | null>(null);
  
  // Toasts
  const { toasts, addToast, removeToast, clearToasts } = useDuelToasts();
  
  // Refs to avoid stale closures in socket handlers
  const rematchStateRef = useRef<'idle' | 'pending' | 'accepted'>('idle');
  const rematchNewDuelIdRef = useRef<string | null>(null);
  const rematchStartTimeRef = useRef<number | null>(null); // Track when overlay was shown
  const routerRef = useRef(router);
  const languageRef = useRef(language);
  const addToastRef = useRef(addToast);
  
  // Keep refs in sync
  useEffect(() => {
    rematchStateRef.current = rematchState;
    rematchNewDuelIdRef.current = rematchNewDuelId;
    routerRef.current = router;
    languageRef.current = language;
    addToastRef.current = addToast;
    
    // Track when overlay becomes visible (accepted state)
    if (rematchState === 'accepted' && rematchNewDuelId) {
      rematchStartTimeRef.current = Date.now();
    } else {
      rematchStartTimeRef.current = null;
    }
  }, [rematchState, rematchNewDuelId, router, language, addToast]);
  
  // RUNTIME CHECK: защита от некорректных состояний
  useEffect(() => {
    // Проверка: если accepted, но нет newDuelId → ошибка
    if (rematchState === 'accepted' && !rematchNewDuelId) {
      console.error('[Rematch] INVARIANT VIOLATION: rematchState=accepted but rematchNewDuelId is null. Auto-resetting.');
      setRematchState('idle');
      setRematchNewDuelId(null);
      rematchStateRef.current = 'idle';
      rematchNewDuelIdRef.current = null;
    }
    
    // DEFENSIVE FAIL-SAFE: если overlay активен >25s → принудительный сброс
    if (rematchState === 'accepted' && rematchNewDuelId && rematchStartTimeRef.current) {
      const elapsed = Date.now() - rematchStartTimeRef.current;
      if (elapsed > 25000) {
        console.error('[Rematch] FAIL-SAFE: Overlay active >25s, forcing reset. elapsed=', elapsed);
        setRematchState('idle');
        setRematchNewDuelId(null);
        rematchStateRef.current = 'idle';
        rematchNewDuelIdRef.current = null;
        rematchStartTimeRef.current = null;
        addToastRef.current(
          languageRef.current === 'ru' ? 'Ошибка: автоматический сброс реванша' : 'Error: automatic rematch reset',
          'warning'
        );
      }
    }
  }, [rematchState, rematchNewDuelId]);
  
  // Duel PvP State
  const [myStatus, setMyStatus] = useState<PlayerStatus>('thinking');
  const [rivalStatus, setRivalStatus] = useState<PlayerStatus>('thinking');
  const [isFirstAnswerer, setIsFirstAnswerer] = useState<string | null>(null);
  const [isUrgencyMode, setIsUrgencyMode] = useState(false);
  const [playerTimings, setPlayerTimings] = useState<PlayerTimingInfo[]>([]);
  const [ratingData, setRatingData] = useState<{
    my: { srBefore: number; srAfter: number; delta: number; leagueName: string } | null;
    opponent: { srBefore: number; srAfter: number; delta: number; leagueName: string } | null;
  } | null>(null);
  const questionIndexRef = useRef(currentQuestionIndex);
  
  const isCreator = creator?.id === userId;

  // Handle rematch events - register listeners ONCE, cleanup ONLY on unmount
  useEffect(() => {
    if (!socket) return;

    console.log('[Rematch] Registering socket listeners for rematch events');

    const handleRematchRequest = (data: { fromPlayerId: string; fromPlayerName: string }) => {
      console.log('[Rematch] Request event received:', data);
      setRematchRequest({ fromPlayerId: data.fromPlayerId, fromPlayerName: data.fromPlayerName });
    };

    const handleRematchAccepted = (data: { oldDuelId: string; newDuelId: string }) => {
      const fromState = rematchStateRef.current;
      console.log('[Rematch] Accepted event received, newDuelId:', data.newDuelId, 'current rematchState:', fromState);
      
      // ANALYTICS: state transition log
      console.info(`[Rematch] state_transition: from=${fromState} to=accepted, duelId=${data.oldDuelId}, hasNewDuelId=true, reason=accepted`);
      
      // Clear timeout if exists
      if ((window as any).__rematchTimeoutCleanup) {
        (window as any).__rematchTimeoutCleanup();
        delete (window as any).__rematchTimeoutCleanup;
      }
      // Set accepted state - this will show "Реванш начинается…"
      // ИНВАРИАНТА: overlay показывается ТОЛЬКО если accepted И есть newDuelId
      setRematchState('accepted');
      setRematchNewDuelId(data.newDuelId);
      // Update refs immediately
      rematchStateRef.current = 'accepted';
      rematchNewDuelIdRef.current = data.newDuelId;
      rematchStartTimeRef.current = Date.now();
      // Redirect after short delay
      setTimeout(() => {
        routerRef.current.push(`/duel/${data.newDuelId}/play`);
      }, 500);
    };

    const handleRematchDeclined = (data?: { duelId: string; fromPlayerId: string }) => {
      const fromState = rematchStateRef.current;
      console.log('[Rematch] Declined event received', {
        payload: data,
        currentRematchState: fromState,
        duelId: data?.duelId,
        fromPlayerId: data?.fromPlayerId,
      });
      
      // ANALYTICS: state transition log
      console.info(`[Rematch] state_transition: from=${fromState} to=idle, duelId=${data?.duelId || 'unknown'}, hasNewDuelId=false, reason=declined`);
      
      // ЖЁСТКИЙ СБРОС UI - гарантированно убрать overlay
      // Clear timeout if exists
      if ((window as any).__rematchTimeoutCleanup) {
        (window as any).__rematchTimeoutCleanup();
        delete (window as any).__rematchTimeoutCleanup;
      }
      
      // Reset ALL rematch state
      setRematchRequest(null);
      setRematchState('idle');
      setRematchNewDuelId(null);
      
      // Update refs immediately
      rematchStateRef.current = 'idle';
      rematchNewDuelIdRef.current = null;
      rematchStartTimeRef.current = null;
      
      // Show toast
      addToastRef.current(
        languageRef.current === 'ru' ? 'Соперник отклонил реванш' : 'Opponent declined rematch',
        'info'
      );
      
      console.log('[Rematch] UI reset complete, overlay should be hidden');
    };

    const handleError = (data: { code: string; message: string }) => {
      if (data.code === 'OPPONENT_OFFLINE') {
        const fromState = rematchStateRef.current;
        console.log('[Rematch] Error: OPPONENT_OFFLINE, resetting state');
        
        // ANALYTICS: state transition log
        console.info(`[Rematch] state_transition: from=${fromState} to=idle, duelId=unknown, hasNewDuelId=false, reason=error:OPPONENT_OFFLINE`);
        
        // Clear timeout if exists
        if ((window as any).__rematchTimeoutCleanup) {
          (window as any).__rematchTimeoutCleanup();
          delete (window as any).__rematchTimeoutCleanup;
        }
        setRematchState('idle');
        setRematchNewDuelId(null);
        rematchStateRef.current = 'idle';
        rematchNewDuelIdRef.current = null;
        rematchStartTimeRef.current = null;
        addToastRef.current(
          languageRef.current === 'ru' ? 'Соперник офлайн' : 'Opponent is offline',
          'danger'
        );
      } else if (data.code === 'DUEL_NOT_FOUND' && rematchStateRef.current !== 'idle') {
        const fromState = rematchStateRef.current;
        console.log('[Rematch] Error: DUEL_NOT_FOUND, resetting state');
        
        // ANALYTICS: state transition log
        console.info(`[Rematch] state_transition: from=${fromState} to=idle, duelId=unknown, hasNewDuelId=false, reason=error:DUEL_NOT_FOUND`);
        
        // Clear timeout if exists
        if ((window as any).__rematchTimeoutCleanup) {
          (window as any).__rematchTimeoutCleanup();
          delete (window as any).__rematchTimeoutCleanup;
        }
        setRematchState('idle');
        setRematchNewDuelId(null);
        rematchStateRef.current = 'idle';
        rematchNewDuelIdRef.current = null;
        rematchStartTimeRef.current = null;
        addToastRef.current(
          languageRef.current === 'ru' ? 'Дуэль не найдена' : 'Duel not found',
          'danger'
        );
      }
    };

    // Register listeners ONCE - они НЕ будут пересоздаваться при изменении зависимостей
    socket.on('duel:rematchRequest', handleRematchRequest as any);
    socket.on('duel:rematchAccepted', handleRematchAccepted as any);
    socket.on('duel:rematchDeclined', handleRematchDeclined as any);
    socket.on('error', handleError);

    // Cleanup ТОЛЬКО при unmount компонента
    return () => {
      console.log('[Rematch] Unmounting: removing socket listeners');
      socket.off('duel:rematchRequest', handleRematchRequest as any);
      socket.off('duel:rematchAccepted', handleRematchAccepted as any);
      socket.off('duel:rematchDeclined', handleRematchDeclined as any);
      socket.off('error', handleError);
      // Cleanup timeout if component unmounts
      if ((window as any).__rematchTimeoutCleanup) {
        (window as any).__rematchTimeoutCleanup();
        delete (window as any).__rematchTimeoutCleanup;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]); // ТОЛЬКО socket в зависимостях - listeners не пересоздаются

  // Reset state when question changes
  useEffect(() => {
    if (currentQuestionIndex !== questionIndexRef.current) {
      questionIndexRef.current = currentQuestionIndex;
      setShowResult(false);
      setLastResult(null);
      setMyStatus('thinking');
      setRivalStatus('thinking');
      setIsFirstAnswerer(null);
      setIsUrgencyMode(false);
      setPlayerTimings([]);
      clearToasts(); // Clear all toasts on new question
    }
  }, [currentQuestionIndex, clearToasts]);

  // Update my status when I answer
  useEffect(() => {
    if (hasAnswered) {
      setMyStatus('answered');
    }
  }, [hasAnswered]);

  // Listen for duel events
  useEffect(() => {
    if (!socket) return;

    // Player answered event
    const handlePlayerAnswered = (data: { playerId: string; playerName: string; answeredAt: number; isFirst: boolean }) => {
      console.log('Player answered:', data);
      
      const isMe = data.playerId === userId;
      
      if (isMe) {
        setMyStatus('answered');
        if (data.isFirst) {
          setIsFirstAnswerer(data.playerId);
          addToast(t('youAnsweredFirst'), 'info');
        }
      } else {
        setRivalStatus('answered');
        if (data.isFirst) {
          setIsFirstAnswerer(data.playerId);
          // Don't show toast - UrgencyHUD will show when timer starts
        } else {
          addToast(t('opponentPickedAnswer'), 'info');
        }
      }
    };

    // Second timer started (10s mode)
    const handleSecondTimerStarted = (data: { 
      firstPlayerId: string; 
      secondPlayerId: string; 
      secondDeadlineAt: number;
    }) => {
      console.log('Second timer started:', data);
      
      // Activate urgency mode for second player (no toast - UrgencyHUD will show)
      if (data.secondPlayerId === userId) {
        setIsUrgencyMode(true);
      }
    };

    // Rating updated
    const handleRatingUpdated = (data: {
      creator: { srBefore: number; srAfter: number; delta: number; leagueName: string };
      opponent: { srBefore: number; srAfter: number; delta: number; leagueName: string } | null;
    }) => {
      console.log('Rating updated:', data);
      
      if (isCreator) {
        setRatingData({
          my: data.creator,
          opponent: data.opponent,
        });
      } else {
        setRatingData({
          my: data.opponent || null,
          opponent: data.creator,
        });
      }
    };

    socket.on('duel:playerAnswered', handlePlayerAnswered);
    socket.on('duel:secondTimerStarted', handleSecondTimerStarted);
    socket.on('duel:ratingUpdated', handleRatingUpdated);

    return () => {
      socket.off('duel:playerAnswered', handlePlayerAnswered);
      socket.off('duel:secondTimerStarted', handleSecondTimerStarted);
      socket.off('duel:ratingUpdated', handleRatingUpdated);
    };
  }, [socket, userId, addToast, t, isCreator]);

  // Handle question results
  useEffect(() => {
    if (questionResults.length > 0) {
      const latest = questionResults[questionResults.length - 1];
      if (latest.questionIndex === currentQuestionIndex) {
        setLastResult(latest);
        setShowResult(true);
        setIsUrgencyMode(false);
        
        // Extract player timings if available
        const perPlayer = (latest as unknown as { perPlayer?: PlayerAnswerInfo[] }).perPlayer;
        if (perPlayer) {
          const timings: PlayerTimingInfo[] = perPlayer.map((p, idx) => ({
            playerId: p.playerId,
            timeMs: p.timeMs,
            isFirst: idx === 0 && p.timeMs !== null && perPlayer.every((op, i) => i === idx || op.timeMs === null || p.timeMs! <= op.timeMs!),
          }));
          setPlayerTimings(timings);
        }

        // Update statuses based on answers
        const creatorAnswer = latest.creatorAnswer;
        const opponentAnswer = latest.opponentAnswer;
        
        if (isCreator) {
          setMyStatus(creatorAnswer !== null ? 'answered' : 'didntAnswer');
          setRivalStatus(opponentAnswer !== null ? 'answered' : 'didntAnswer');
        } else {
          setMyStatus(opponentAnswer !== null ? 'answered' : 'didntAnswer');
          setRivalStatus(creatorAnswer !== null ? 'answered' : 'didntAnswer');
        }
        
        // Hide result after 3 seconds
        const timer = setTimeout(() => {
          setShowResult(false);
          setLastResult(null);
        }, 3000);
        
        return () => clearTimeout(timer);
      }
    }
  }, [questionResults, currentQuestionIndex, isCreator]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const handleAnswer = (answerIndex: number) => {
    if (hasAnswered || !currentQuestion) return;
    
    setMyAnswer(answerIndex);
    submitAnswer(currentQuestionIndex, answerIndex);
  };

  const handleStartDuel = () => {
    startDuel();
  };

  const handleRematch = async (sameTopic: boolean) => {
    // Prevent double clicks - проверяем по rematchState
    if (rematchState !== 'idle') return;

    // For ranked/matchmaking duels, use Socket.IO rematch
    if (isRanked) {
      console.log('[Rematch] Initiating rematch request for ranked duel, duelId:', duelId);
      
      // ANALYTICS: state transition log
      console.info(`[Rematch] state_transition: from=idle to=pending, duelId=${duelId}, hasNewDuelId=false, reason=request`);
      
      requestRematch();
      // Set pending state - show "Ожидаем ответа..." NOT "Реванш начинается…"
      setRematchState('pending');
      setRematchNewDuelId(null);
      // Update refs immediately
      rematchStateRef.current = 'pending';
      rematchNewDuelIdRef.current = null;
      rematchStartTimeRef.current = null;
      
      // Timeout fallback: if no accept/decline arrives in 20s, treat as canceled
      const timeoutId = setTimeout(() => {
        const fromState = rematchStateRef.current;
        console.log('[Rematch] TIMEOUT: no response received after 20s, canceling rematch. Current state:', fromState);
        
        // ANALYTICS: state transition log
        console.info(`[Rematch] state_transition: from=${fromState} to=idle, duelId=${duelId}, hasNewDuelId=false, reason=timeout`);
        
        // ЖЁСТКИЙ СБРОС при таймауте
        setRematchState('idle');
        setRematchNewDuelId(null);
        rematchStateRef.current = 'idle';
        rematchNewDuelIdRef.current = null;
        rematchStartTimeRef.current = null;
        addToastRef.current(
          languageRef.current === 'ru' ? 'Нет ответа от соперника. Реванш отменён.' : 'No response from opponent. Rematch canceled.',
          'warning'
        );
        // Clean up timeout reference
        delete (window as any).__rematchTimeoutCleanup;
        console.log('[Rematch] Timeout cleanup complete, overlay should be hidden');
      }, 20000);
      
      // Clear timeout when rematch is accepted or declined
      const cleanup = () => {
        clearTimeout(timeoutId);
        delete (window as any).__rematchTimeoutCleanup;
      };
      
      // Store cleanup function to call it when rematch completes
      (window as any).__rematchTimeoutCleanup = cleanup;
      
      return;
    }

    // For invite duels, create new duel via API
    // Instant feedback: vibrate and set loading state
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    
    // For invite duels, we don't use rematchState (it's only for ranked/matchmaking)
    // Just show loading via API call
    try {
      const response = await fetch('/api/duel/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          topic: sameTopic ? topic : topic,
          questionsCount: totalQuestions || 10,
          language: language,
          difficulty: 'medium',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create rematch');
      }

      const data = await response.json();
      
      // Redirect to invite page
      router.push(`/duel/${data.duelId}/invite`);
    } catch (err) {
      console.error('Rematch error:', err);
      addToast(
        language === 'ru' ? 'Ошибка при создании реванша' : 'Error creating rematch',
        'danger'
      );
    }
  };

  const canStart = status === 'ready' && isCreator && opponent;

  // Get timing for a player
  const getPlayerTiming = (playerId: string) => {
    const timing = playerTimings.find(t => t.playerId === playerId);
    return timing?.timeMs ?? null;
  };

  // Loading / Connection state
  // Show loading if not connected OR if status is pending (matchmaking, generating questions)
  if ((!isConnected || status === 'pending') && !finalResult) {
    // For matchmaking duels or any pending duels, use DuelLoadingOverlay with proper states
    // Matchmaking duels have status 'pending' or isRanked=true
    // Also show for any duel that's not connected yet (initial load)
    const isMatchmaking = isRanked || status === 'pending' || (!isConnected && status === null);
    
    if (isMatchmaking) {
      return (
        <DuelLoadingOverlay
          isLoading={true}
          isComplete={false}
          language={language}
          topic={topic || undefined}
          mode="start"
          playerNames={opponent ? {
            you: firstName || 'You',
            opponent: opponent.name || 'Opponent',
          } : creator ? {
            you: firstName || 'You',
            opponent: creator.name || 'Opponent',
          } : undefined}
        />
      );
    }
    
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-tg-text-secondary">
            {language === 'ru' ? 'Подключение...' : 'Connecting...'}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card variant="glass" className="text-center w-full max-w-sm">
          <p className="text-6xl mb-4">😕</p>
          <h2 className="text-xl font-bold mb-2">{t('error')}</h2>
          <p className="text-tg-text-secondary mb-6">{error}</p>
          <Button fullWidth onClick={() => router.push('/')}>
            {t('backToMenu')}
          </Button>
        </Card>
      </div>
    );
  }

  // Final results
  if (finalResult) {
    const myScore = isCreator ? finalResult.creatorScore : finalResult.opponentScore;
    const theirScore = isCreator ? finalResult.opponentScore : finalResult.creatorScore;
    const isWinner = finalResult.winnerId === userId;
    const isDraw = !finalResult.winnerId;

    // Determine outcome
    const outcome: DuelOutcome = isDraw ? 'draw' : isWinner ? 'win' : 'lose';

    // Calculate stats from question results
    const stats = {
      correctAnswers: myScore,
      totalQuestions: totalQuestions || 10,
      fasterInQuestions: questionResults.filter(qr => {
        const perPlayer = (qr as unknown as { perPlayer?: PlayerAnswerInfo[] }).perPlayer;
        if (!perPlayer || perPlayer.length < 2) return false;
        const myTiming = perPlayer.find(p => p.playerId === userId);
        const opponentTiming = perPlayer.find(p => p.playerId !== userId);
        const myTime = myTiming?.timeMs;
        const opponentTime = opponentTiming?.timeMs;
        return myTime != null && opponentTime != null && myTime < opponentTime;
      }).length,
      bestStreak: calculateBestStreak(questionResults, userId || '', isCreator),
    };

    const opponentName = isCreator 
      ? (opponent?.name || 'Opponent') 
      : (creator?.name || 'Opponent');

    // Get difficulty name for display
    const difficultyName = finalResult.results.length > 0 
      ? 'medium' // We use medium for rematch, could be improved
      : 'medium';

    return (
      <>
        {/* Rematch Request Dialog */}
        {rematchRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card variant="glass" className="max-w-sm w-full p-6">
              <h3 className="text-xl font-bold mb-4 text-center">
                {language === 'ru' ? 'Запрос на реванш' : 'Rematch Request'}
              </h3>
              <p className="text-tg-text-secondary mb-6 text-center">
                {language === 'ru' 
                  ? `${rematchRequest.fromPlayerName} предлагает реванш`
                  : `${rematchRequest.fromPlayerName} wants a rematch`}
              </p>
              <div className="flex gap-3">
                <Button
                  fullWidth
                  variant="secondary"
                  onClick={() => {
                    declineRematch();
                    setRematchRequest(null);
                  }}
                >
                  {language === 'ru' ? 'Отклонить' : 'Decline'}
                </Button>
                <Button
                  fullWidth
                  onClick={() => {
                    acceptRematch();
                    setRematchRequest(null);
                    // State will be set by handleRematchAccepted handler
                  }}
                >
                  {language === 'ru' ? 'Принять' : 'Accept'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Rematch Loading Overlay */}
        {/* ИНВАРИАНТА: overlay показывается ТОЛЬКО если rematchState === 'accepted' И есть rematchNewDuelId */}
        {rematchState === 'accepted' && rematchNewDuelId ? (
          <DuelLoadingOverlay
            isLoading={true}
            isComplete={false}
            language={language}
            topic={topic || ''}
            mode="rematch"
            playerNames={{
              you: firstName || 'You',
              opponent: opponentName,
            }}
            difficulty={difficultyName}
            questionsCount={totalQuestions || 10}
          />
        ) : rematchState === 'pending' ? (
          <DuelLoadingOverlay
            isLoading={true}
            isComplete={false}
            language={language}
            topic={topic || ''}
            mode="rematch-pending"
            playerNames={{
              you: firstName || 'You',
              opponent: opponentName,
            }}
            difficulty={difficultyName}
            questionsCount={totalQuestions || 10}
          />
        ) : null}

        <DuelResultScreen
          outcome={outcome}
          myScore={myScore}
          opponentScore={theirScore}
          opponentName={opponentName}
          topic={topic || ''}
          stats={stats}
          language={language}
          onRematch={() => handleRematch(true)}
          onNewTopic={() => router.push('/')}
          onBackToMenu={() => {
            reset();
            router.push('/');
          }}
          isLoadingRematch={rematchState !== 'idle'}
          rating={ratingData || undefined}
          isRanked={isRanked || finalResult?.isRanked || false}
        />
      </>
    );
  }

  // Waiting for opponent / Ready to start
  if (status === 'waiting' || status === 'ready') {
    const opponentId = opponent?.id || null;

    return (
      <div className="flex-1 flex flex-col p-6 space-y-4">
        <div className="text-center">
          <div className="text-6xl mb-4">⚔️</div>
          <h1 className="text-2xl font-bold mb-2">{topic}</h1>
        </div>

        {/* H2H Stats - show when opponent has joined */}
        {opponentId && (
          <H2HStatsDisplay opponentId={opponentId} />
        )}

        <Card variant="bordered" className="flex-1 flex flex-col items-center justify-center">
          <ScoreDisplay
            player1={{
              name: creator?.name || firstName || 'You',
              score: 0,
              isMe: isCreator,
            }}
            player2={opponent ? {
              name: opponent.name,
              score: 0,
              isMe: !isCreator,
            } : null}
            className="w-full mb-8"
          />

          {status === 'waiting' && (
            <div className="text-center">
              <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse mx-auto mb-4" />
              <p className="text-tg-text-secondary">{t('waitingForOpponent')}</p>
            </div>
          )}

          {canStart && (
            <Button size="lg" onClick={handleStartDuel}>
              {t('startDuel')} 🚀
            </Button>
          )}

          {status === 'ready' && !isCreator && (
            <p className="text-tg-text-secondary">
              {language === 'ru' 
                ? 'Ожидание начала игры...' 
                : 'Waiting for game to start...'}
            </p>
          )}
        </Card>
      </div>
    );
  }

  // Determine display time for timer
  const displayTime = isLocked && lockTimeRemaining !== null ? lockTimeRemaining : timeRemaining;

  // Game in progress
  return (
    <div className={cn(
      'flex-1 flex flex-col p-4 transition-all duration-300'
    )}>
      {/* Toasts */}
      <DuelToasts toasts={toasts} onRemove={removeToast} />

      {/* Duel Header with PvP indicators */}
      <DuelHeader
        creator={{
          id: creator?.id || '',
          name: creator?.name || 'Player 1',
          score: creator?.score || 0,
          status: isCreator ? myStatus : rivalStatus,
          isFirst: isFirstAnswerer === creator?.id,
          timeMs: showResult ? getPlayerTiming(creator?.id || '') : undefined,
        }}
        opponent={{
          id: opponent?.id || '',
          name: opponent?.name || 'Player 2',
          score: opponent?.score || 0,
          status: isCreator ? rivalStatus : myStatus,
          isFirst: isFirstAnswerer === opponent?.id,
          timeMs: showResult ? getPlayerTiming(opponent?.id || '') : undefined,
        }}
        myId={userId || ''}
        showResult={showResult}
        className="mb-4"
      />

      {/* Progress */}
      <ProgressBar
        current={currentQuestionIndex}
        total={totalQuestions}
        className={cn('mb-4', isLocked && 'animate-progress-pulse')}
      />

      {/* Urgency HUD - fixed height container to prevent layout shift */}
      <div className="h-10 mb-2">
        <UrgencyHUD
          isActive={isUrgencyMode && !hasAnswered && displayTime > 0}
          timeRemaining={displayTime}
          language={language}
        />
      </div>

      {/* Timer */}
      <div className="flex justify-center mb-4">
        <UrgencyTimer
          seconds={displayTime}
          isUrgencyMode={isUrgencyMode && !hasAnswered}
        />
      </div>

      {/* Question */}
      {currentQuestion && (
        <QuestionCard
          question={currentQuestion}
          selectedAnswer={myAnswer}
          correctAnswer={showResult && lastResult ? lastResult.correctIndex : undefined}
          disabled={hasAnswered}
          onAnswer={handleAnswer}
          showResult={showResult}
          isUrgencyMode={isUrgencyMode && !hasAnswered}
        />
      )}

      {/* Answer status with timing info */}
      {hasAnswered && !showResult && (
        <div className="mt-4 text-center">
          <p className="text-green-400 font-medium">✓ {t('youAnswered')}</p>
          {!opponentAnswered && (
            <p className="text-tg-text-secondary text-sm mt-1 animate-pulse">
              {t('waitingForOpponentAnswer')}
            </p>
          )}
        </div>
      )}

      {/* Who was faster - show after result */}
      {showResult && playerTimings.length > 0 && (
        <Card variant="glass" className="mt-4 py-3 animate-slide-up">
          <p className="text-center text-xs text-tg-hint mb-2">{t('whoWasFaster')}</p>
          <div className="flex justify-around text-sm">
            <div className="text-center">
              <p className="text-tg-text-secondary">{t('yourTime')}</p>
              <p className={cn(
                'font-bold',
                getPlayerTiming(userId || '') !== null ? 'text-white' : 'text-red-400'
              )}>
                {getPlayerTiming(userId || '') !== null 
                  ? `${(getPlayerTiming(userId || '')! / 1000).toFixed(1)}с`
                  : t('noAnswer')
                }
              </p>
            </div>
            <div className="text-center">
              <p className="text-tg-text-secondary">{t('opponentTime')}</p>
              <p className={cn(
                'font-bold',
                getPlayerTiming(isCreator ? opponent?.id || '' : creator?.id || '') !== null ? 'text-white' : 'text-red-400'
              )}>
                {getPlayerTiming(isCreator ? opponent?.id || '' : creator?.id || '') !== null 
                  ? `${(getPlayerTiming(isCreator ? opponent?.id || '' : creator?.id || '')! / 1000).toFixed(1)}с`
                  : t('noAnswer')
                }
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
