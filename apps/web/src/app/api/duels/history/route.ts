import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, extractToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const token = extractToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const userId = payload.userId;

    // Get last 50 duels where user participated
    const duels = await prisma.duel.findMany({
      where: {
        OR: [
          { creatorId: userId },
          { opponentId: userId },
        ],
        status: 'finished',
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            username: true,
          },
        },
        opponent: {
          select: {
            id: true,
            firstName: true,
            username: true,
          },
        },
        matchResult: true,
      },
      orderBy: {
        finishedAt: 'desc',
      },
      take: 50,
    });

    // Format history entries
    const history = duels.map((duel) => {
      const isCreator = duel.creatorId === userId;
      const opponent = isCreator ? duel.opponent : duel.creator;
      
      // Get display name for opponent
      const opponentDisplayName = opponent
        ? (opponent.firstName || opponent.username || 'Opponent')
        : 'Opponent';

      // Determine outcome
      let outcome: 'win' | 'lose' | 'draw' = 'draw';
      if (duel.winnerId === userId) {
        outcome = 'win';
      } else if (duel.winnerId && duel.winnerId !== userId) {
        outcome = 'lose';
      }

      // Get scores from matchResult
      const myScore = isCreator
        ? (duel.matchResult?.creatorCorrectCount ?? 0)
        : (duel.matchResult?.opponentCorrectCount ?? 0);
      const oppScore = isCreator
        ? (duel.matchResult?.opponentCorrectCount ?? 0)
        : (duel.matchResult?.creatorCorrectCount ?? 0);

      // Get SR changes if ranked
      let srBefore: number | null = null;
      let srAfter: number | null = null;
      let srDelta: number | null = null;

      if (duel.isRanked && duel.matchResult) {
        if (isCreator) {
          srBefore = duel.matchResult.creatorSrBefore;
          srAfter = duel.matchResult.creatorSrAfter;
          srDelta = duel.matchResult.creatorDelta;
        } else {
          srBefore = duel.matchResult.opponentSrBefore;
          srAfter = duel.matchResult.opponentSrAfter;
          srDelta = duel.matchResult.opponentDelta;
        }
      }

      return {
        duelId: duel.id,
        createdAt: duel.createdAt,
        finishedAt: duel.finishedAt,
        topic: duel.topic,
        isRanked: duel.isRanked,
        outcome,
        myScore,
        oppScore,
        opponentName: opponentDisplayName,
        srBefore,
        srAfter,
        srDelta,
      };
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error('History error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
