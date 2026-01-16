import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processMatchRating } from '@/lib/rating';
import type { QuestionResult } from '@tg-duel/shared';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const duelId = params.id;
    const body = await request.json();

    // Get duel
    const duel = await prisma.duel.findUnique({
      where: { id: duelId },
      include: {
        pack: true,
        answers: true,
      },
    });

    if (!duel || !duel.pack || duel.status !== 'finished') {
      return NextResponse.json(
        { error: 'Duel not found or not finished' },
        { status: 404 }
      );
    }

    // Calculate scores and build question results with timing
    const creatorScore = duel.answers
      .filter(a => a.playerId === duel.creatorId && a.isCorrect)
      .length;
    const opponentScore = duel.opponentId
      ? duel.answers
          .filter(a => a.playerId === duel.opponentId && a.isCorrect)
          .length
      : 0;

    // Build question results with perPlayer timing data
    const questionResults: Array<{
      creatorCorrect: boolean;
      opponentCorrect: boolean;
      perPlayer?: Array<{
        playerId: string;
        timeMs: number | null;
      }>;
    }> = [];

    const totalQuestions = duel.questionsCount;
    for (let i = 0; i < totalQuestions; i++) {
      const creatorAnswer = duel.answers.find(
        a => a.playerId === duel.creatorId && a.questionIndex === i
      );
      const opponentAnswer = duel.opponentId
        ? duel.answers.find(
            a => a.playerId === duel.opponentId && a.questionIndex === i
          )
        : null;

      const perPlayer: Array<{ playerId: string; timeMs: number | null }> = [
        {
          playerId: duel.creatorId,
          timeMs: creatorAnswer?.responseTimeMs ?? null,
        },
      ];

      if (opponentAnswer) {
        perPlayer.push({
          playerId: duel.opponentId!,
          timeMs: opponentAnswer.responseTimeMs,
        });
      }

      questionResults.push({
        creatorCorrect: creatorAnswer?.isCorrect ?? false,
        opponentCorrect: opponentAnswer?.isCorrect ?? false,
        perPlayer,
      });
    }

    // Process rating
    const ratingData = await processMatchRating(
      duelId,
      duel.creatorId,
      duel.opponentId,
      creatorScore,
      opponentScore,
      duel.questionsCount,
      duel.topic,
      duel.isRanked,
      questionResults
    );

    // Get league names
    const creatorLeague = ratingData
      ? getLeagueName(ratingData.creator.srAfter)
      : null;
    const opponentLeague = ratingData
      ? getLeagueName(ratingData.opponent.srAfter)
      : null;

    return NextResponse.json({
      success: true,
      rating: ratingData
        ? {
            creator: {
              srBefore: ratingData.creator.srAfter - ratingData.creator.delta,
              srAfter: ratingData.creator.srAfter,
              delta: ratingData.creator.delta,
              leagueName: creatorLeague,
            },
            opponent: duel.opponentId
              ? {
                  srBefore: ratingData.opponent.srAfter - ratingData.opponent.delta,
                  srAfter: ratingData.opponent.srAfter,
                  delta: ratingData.opponent.delta,
                  leagueName: opponentLeague,
                }
              : null,
          }
        : null,
    });
  } catch (error) {
    console.error('Finish duel error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getLeagueName(sr: number): string {
  if (sr >= 2500) return 'Master';
  if (sr >= 2000) return 'Diamond';
  if (sr >= 1500) return 'Platinum';
  if (sr >= 1200) return 'Gold';
  if (sr >= 1000) return 'Silver';
  return 'Bronze';
}
