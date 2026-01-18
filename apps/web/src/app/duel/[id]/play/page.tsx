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
import { UrgencyBanner, UrgencyVignette, UrgencyTimer } from '@/components/game/urgency-mode';
import { DuelResultScreen, type DuelOutcome } from '@/components/game/duel-result-screen';
import { DuelLoadingOverlay } from '@/components/game/duel-loading-overlay';
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
  const [isCreatingRematch, setIsCreatingRematch] = useState(false);
  const [isRematchComplete, setIsRematchComplete] = useState(false);
  const [rematchRequest, setRematchRequest] = useState<{ fromPlayerId: string; fromPlayerName: string } | null>(null);
  
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
  
  // Toasts
  const { toasts, addToast, removeToast, clearToasts } = useDuelToasts();

  const isCreator = creator?.id === userId;

  // Handle rematch events
  useEffect(() => {
    if (!socket) return;

    const handleRematchRequest = (data: { fromPlayerId: string; fromPlayerName: string }) => {
      console.log('Rematch request received:', data);
      setRematchRequest({ fromPlayerId: data.fromPlayerId, fromPlayerName: data.fromPlayerName });
    };

    const handleRematchAccepted = (data: { oldDuelId: string; newDuelId: string }) => {
      console.log('Rematch accepted, redirecting to:', data.newDuelId);
      router.push(`/duel/${data.newDuelId}/play`);
    };

    const handleRematchDeclined = () => {
      console.log('Rematch declined');
      setRematchRequest(null);
      addToast({
        id: 'rematch-declined',
        message: language === 'ru' ? 'Соперник отклонил реванш' : 'Opponent declined rematch',
        type: 'info',
      });
    };

    socket.on('duel:rematchRequest', handleRematchRequest);
    socket.on('duel:rematchAccepted', handleRematchAccepted);
    socket.on('duel:rematchDeclined', handleRematchDeclined);

    return () => {
      socket.off('duel:rematchRequest', handleRematchRequest);
      socket.off('duel:rematchAccepted', handleRematchAccepted);
      socket.off('duel:rematchDeclined', handleRematchDeclined);
    };
  }, [socket, router, language, addToast]);

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
          addToast(t('opponentAnsweredFirst'), 'warning');
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
      
      // Show overlay only for second player
      if (data.secondPlayerId === userId) {
        setIsUrgencyMode(true);
        addToast(t('hurryUpToast'), 'danger', 3000);
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
    // Prevent double clicks
    if (isCreatingRematch) return;

    // For ranked/matchmaking duels, use Socket.IO rematch
    if (isRanked) {
      requestRematch();
      setIsCreatingRematch(true);
      return;
    }

    // For invite duels, create new duel via API
    // Instant feedback: vibrate and set loading state
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    
    setIsCreatingRematch(true);
    setIsRematchComplete(false);

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
      
      // Mark as complete to animate progress to 100%
      setIsRematchComplete(true);
      
      // Wait for animation, then redirect
      setTimeout(() => {
        router.push(`/duel/${data.duelId}/invite`);
      }, 500);
    } catch (err) {
      console.error('Rematch error:', err);
      setIsCreatingRematch(false);
      setIsRematchComplete(false);
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
                    setIsCreatingRematch(true);
                  }}
                >
                  {language === 'ru' ? 'Принять' : 'Accept'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Rematch Loading Overlay */}
        <DuelLoadingOverlay
          isLoading={isCreatingRematch}
          isComplete={isRematchComplete}
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
          isLoadingRematch={isCreatingRematch}
          rating={ratingData || undefined}
          isRanked={isRanked || finalResult?.isRanked || false}
        />
      </>
    );
  }

  // Waiting for opponent / Ready to start
  if (status === 'waiting' || status === 'ready') {
    return (
      <div className="flex-1 flex flex-col p-6">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">⚔️</div>
          <h1 className="text-2xl font-bold mb-2">{topic}</h1>
        </div>

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
      {/* Urgency mode effects */}
      <UrgencyVignette isActive={isUrgencyMode && !hasAnswered} />
      
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

      {/* Timer */}
      <div className="flex justify-center mb-4">
        <UrgencyTimer
          seconds={displayTime}
          isUrgencyMode={isUrgencyMode && !hasAnswered}
        />
      </div>

      {/* Urgency banner - non-blocking indicator */}
      {isUrgencyMode && !hasAnswered && (
        <UrgencyBanner
          isActive={isUrgencyMode && !hasAnswered}
          timeRemaining={displayTime}
          language={language}
        />
      )}

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
