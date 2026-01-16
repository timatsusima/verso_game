import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken } from '@/lib/auth';
import { getUserRating } from '@/lib/rating';

// Force dynamic rendering (uses request.headers)
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

    // Get user rating
    const rating = await getUserRating(payload.userId);

    if (!rating) {
      // Return default rating for new users
      return NextResponse.json({
        sr: 1000,
        rd: 350,
        gamesPlayed: 0,
        leagueName: 'Bronze',
      });
    }

    return NextResponse.json(rating);
  } catch (error) {
    console.error('Get rating error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
