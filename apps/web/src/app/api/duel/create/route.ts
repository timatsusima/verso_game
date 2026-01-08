import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, extractToken } from '@/lib/auth';
import { generateQuestions } from '@/lib/openai';
import { generateInviteLink } from '@/lib/utils';
import { CreateDuelSchema } from '@tg-duel/shared';

export async function POST(request: NextRequest) {
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

    // Validate request body
    const body = await request.json();
    const parsed = CreateDuelSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { topic, questionsCount, language } = parsed.data;

    // Validate topic
    if (topic.trim().length === 0) {
      return NextResponse.json(
        { error: 'Topic cannot be empty' },
        { status: 400 }
      );
    }

    // Generate questions using OpenAI
    let pack;
    try {
      pack = await generateQuestions(topic, questionsCount, language);
    } catch (error) {
      console.error('OpenAI error:', error);
      return NextResponse.json(
        { error: 'Failed to generate questions. Please try a different topic.' },
        { status: 500 }
      );
    }

    // Create duel in database
    const duel = await prisma.duel.create({
      data: {
        topic,
        questionsCount,
        language,
        status: 'waiting',
        creatorId: payload.userId,
        pack: {
          create: {
            questions: JSON.stringify(pack.questions),
            seed: pack.seed,
            commitHash: pack.commitHash,
          },
        },
      },
      include: {
        pack: true,
      },
    });

    const inviteLink = generateInviteLink(duel.id);

    return NextResponse.json({
      duelId: duel.id,
      inviteLink,
    });
  } catch (error) {
    console.error('Create duel error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
