import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getH2HStats } from '@/lib/h2h';

/**
 * GET /api/h2h?opponentId=...
 * 
 * Returns head-to-head statistics between current user and opponent
 */
export async function GET(request: NextRequest) {
  try {
    // Extract and verify JWT
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Missing authentication token' },
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

    const currentUserId = payload.userId;

    // Get opponentId from query params
    const { searchParams } = new URL(request.url);
    const opponentId = searchParams.get('opponentId');

    if (!opponentId) {
      return NextResponse.json(
        { error: 'Missing opponentId parameter' },
        { status: 400 }
      );
    }

    // Can't get H2H with yourself
    if (opponentId === currentUserId) {
      return NextResponse.json(
        { error: 'Cannot get H2H stats with yourself' },
        { status: 400 }
      );
    }

    // Get H2H stats
    const stats = await getH2HStats(currentUserId, opponentId);

    if (!stats) {
      // Opponent not found, return empty stats
      return NextResponse.json({
        success: true,
        data: null,
        message: 'Opponent not found',
      });
    }

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[H2H] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
