import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, extractToken } from '@/lib/auth';
import type { QuestionWithAnswer, SanitizedQuestion } from '@tg-duel/shared';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const duelId = params.id;

    // Get duel with pack
    const duel = await prisma.duel.findUnique({
      where: { id: duelId },
      include: {
        pack: true,
        creator: {
          select: { id: true, firstName: true, username: true },
        },
        opponent: {
          select: { id: true, firstName: true, username: true },
        },
      },
    });

    if (!duel) {
      return NextResponse.json(
        { error: 'Duel not found' },
        { status: 404 }
      );
    }

    if (!duel.pack) {
      return NextResponse.json(
        { error: 'Duel pack not found' },
        { status: 404 }
      );
    }

    // Parse questions
    const questionsWithAnswers: QuestionWithAnswer[] = JSON.parse(duel.pack.questions);

    // Sanitize questions (remove correct answers)
    const sanitizedQuestions: SanitizedQuestion[] = questionsWithAnswers.map((q, index) => ({
      id: q.id,
      index,
      text: q.text,
      options: q.options,
      imageSearchQuery: q.imageSearchQuery,
      imageUrl: q.imageUrl,
    }));

    return NextResponse.json({
      duel: {
        id: duel.id,
        topic: duel.topic,
        questionsCount: duel.questionsCount,
        language: duel.language,
        status: duel.status,
        creatorId: duel.creatorId,
        opponentId: duel.opponentId,
        creator: duel.creator,
        opponent: duel.opponent,
        isRanked: duel.isRanked,
      },
      questions: sanitizedQuestions,
      packCommit: duel.pack.commitHash,
    });
  } catch (error) {
    console.error('Get duel error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
