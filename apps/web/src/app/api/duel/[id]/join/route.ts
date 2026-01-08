import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, extractToken } from '@/lib/auth';

export async function POST(
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

    // Get duel
    const duel = await prisma.duel.findUnique({
      where: { id: duelId },
    });

    if (!duel) {
      return NextResponse.json(
        { error: 'Duel not found' },
        { status: 404 }
      );
    }

    // Check if user is creator
    if (duel.creatorId === payload.userId) {
      return NextResponse.json({
        success: true,
        role: 'creator',
        duelId: duel.id,
      });
    }

    // Check if duel is available to join
    if (duel.status !== 'waiting') {
      return NextResponse.json(
        { error: 'This duel is no longer available' },
        { status: 400 }
      );
    }

    if (duel.opponentId && duel.opponentId !== payload.userId) {
      return NextResponse.json(
        { error: 'This duel already has an opponent' },
        { status: 400 }
      );
    }

    // Join duel
    await prisma.duel.update({
      where: { id: duelId },
      data: {
        opponentId: payload.userId,
        status: 'ready',
      },
    });

    return NextResponse.json({
      success: true,
      role: 'opponent',
      duelId: duel.id,
    });
  } catch (error) {
    console.error('Join duel error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
