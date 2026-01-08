'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useDuelStore } from '@/stores/duel-store';
import { useSocket } from '@/hooks/use-socket';
import { useTranslations } from '@/hooks/use-translations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Timer } from '@/components/ui/timer';
import { QuestionCard } from '@/components/game/question-card';
import { ScoreDisplay } from '@/components/game/score-display';
import { ProgressBar } from '@/components/game/progress-bar';
import { cn } from '@/lib/utils';

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
    setMyAnswer,
    reset,
  } = useDuelStore();

  const duelId = params.id as string;
  const { submitAnswer, startDuel } = useSocket(duelId);
  
  const [showResult, setShowResult] = useState(false);
  const [lastResult, setLastResult] = useState<typeof questionResults[0] | null>(null);

  // Handle question results
  useEffect(() => {
    if (questionResults.length > 0) {
      const latest = questionResults[questionResults.length - 1];
      if (latest.questionIndex === currentQuestionIndex) {
        setLastResult(latest);
        setShowResult(true);
        
        // Hide result after 3 seconds
        const timer = setTimeout(() => {
          setShowResult(false);
          setLastResult(null);
        }, 3000);
        
        return () => clearTimeout(timer);
      }
    }
  }, [questionResults, currentQuestionIndex]);

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

  const isCreator = creator?.id === userId;
  const canStart = status === 'ready' && isCreator && opponent;

  // Determine my correct answer for result display
  const getMyCorrectAnswer = () => {
    if (!lastResult) return null;
    if (isCreator) {
      return lastResult.creatorCorrect ? lastResult.correctIndex : null;
    }
    return lastResult.opponentCorrect ? lastResult.correctIndex : null;
  };

  // Loading / Connection state
  if (!isConnected && !finalResult) {
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

    return (
      <div className="flex-1 flex flex-col p-6">
        <div className="text-center mb-8 animate-bounce-in">
          <div className="text-7xl mb-4">
            {isDraw ? '🤝' : isWinner ? '🏆' : '😔'}
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {isDraw ? t('draw') : isWinner ? t('victory') : t('defeat')}
          </h1>
        </div>

        <Card variant="bordered" className="mb-6 animate-slide-up">
          <div className="text-center py-6">
            <div className="flex items-center justify-center gap-8">
              <div>
                <p className="text-tg-text-secondary mb-1">{t('you')}</p>
                <p className={cn(
                  'text-5xl font-bold',
                  isWinner && 'text-duel-gold',
                  !isWinner && !isDraw && 'text-tg-text-secondary'
                )}>
                  {myScore}
                </p>
              </div>
              <div className="text-2xl text-tg-hint">:</div>
              <div>
                <p className="text-tg-text-secondary mb-1">{t('opponent')}</p>
                <p className={cn(
                  'text-5xl font-bold',
                  !isWinner && !isDraw && 'text-duel-gold',
                  isWinner && 'text-tg-text-secondary'
                )}>
                  {theirScore}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="text-center text-sm text-tg-text-secondary">
              {topic}
            </p>
          </div>
        </Card>

        <div className="space-y-3 mt-auto">
          <Button fullWidth size="lg" onClick={() => router.push('/')}>
            {t('playAgain')}
          </Button>
        </div>
      </div>
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

  // Game in progress
  return (
    <div className="flex-1 flex flex-col p-4">
      {/* Score */}
      <ScoreDisplay
        player1={{
          name: creator?.name || 'Player 1',
          score: creator?.score || 0,
          isMe: isCreator,
          hasAnswered: isCreator ? hasAnswered : opponentAnswered,
        }}
        player2={{
          name: opponent?.name || 'Player 2',
          score: opponent?.score || 0,
          isMe: !isCreator,
          hasAnswered: !isCreator ? hasAnswered : opponentAnswered,
        }}
        className="mb-4"
      />

      {/* Progress */}
      <ProgressBar
        current={currentQuestionIndex}
        total={totalQuestions}
        className="mb-4"
      />

      {/* Timer */}
      <div className="flex justify-center mb-6">
        <Timer
          seconds={isLocked && lockTimeRemaining ? lockTimeRemaining : timeRemaining}
          maxSeconds={isLocked ? 10 : 60}
          size="md"
        />
      </div>

      {/* Lock indicator */}
      {isLocked && (
        <div className="text-center mb-4 animate-pulse">
          <p className="text-duel-warning font-medium">
            ⚡ {t('hurryUp')}
          </p>
        </div>
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
        />
      )}

      {/* Answer status */}
      {hasAnswered && !showResult && (
        <div className="mt-4 text-center">
          <p className="text-duel-correct">✓ {t('youAnswered')}</p>
          {!opponentAnswered && (
            <p className="text-tg-text-secondary text-sm mt-1">
              {t('waiting')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
