import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOrGenerateQuestions } from '@/lib/question-bank';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const duelId = params.id;

    // Get duel
    const duel = await prisma.duel.findUnique({
      where: { id: duelId },
      include: { pack: true },
    });

    if (!duel) {
      return NextResponse.json(
        { error: 'Duel not found' },
        { status: 404 }
      );
    }

    // If pack already exists, return success
    if (duel.pack) {
      return NextResponse.json({ success: true, message: 'Questions already generated' });
    }

    // Generate questions
    const pack = await getOrGenerateQuestions(
      duel.topic,
      duel.questionsCount as 10 | 20 | 30,
      duel.language as 'ru' | 'en',
      duel.difficulty as 'easy' | 'medium' | 'hard'
    );

    // Create pack
    await prisma.duelPack.create({
      data: {
        duelId: duel.id,
        questions: JSON.stringify(pack.questions),
        seed: pack.seed,
        commitHash: pack.commitHash,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Generate questions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
