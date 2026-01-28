import { prisma } from './prisma';

/**
 * Head-to-Head (H2H) Statistics between two players
 */

export interface H2HStats {
  opponent: {
    id: string;
    firstName: string;
    username: string | null;
    photoUrl: string | null;
  };
  total: {
    youWins: number;
    opponentWins: number;
    draws: number;
  };
  streak: {
    holder: 'you' | 'opponent' | null;
    count: number;
  };
  lastMatches: Array<{
    duelId: string;
    date: string;
    winner: 'you' | 'opponent' | 'draw';
    isRanked: boolean;
  }>;
}

/**
 * Calculate current streak from a list of matches (newest first)
 * Returns { holder: 'you' | 'opponent' | null, count: number }
 */
export function calculateStreak(
  matches: Array<{ winnerId: string | null }>,
  yourUserId: string,
  opponentUserId: string
): { holder: 'you' | 'opponent' | null; count: number } {
  if (matches.length === 0) {
    return { holder: null, count: 0 };
  }

  // Check first match to determine who has the streak
  const firstMatch = matches[0];
  
  if (!firstMatch.winnerId) {
    // Draw breaks any streak
    return { holder: null, count: 0 };
  }

  const streakHolder = firstMatch.winnerId === yourUserId ? 'you' : 'opponent';
  let count = 0;

  // Count consecutive wins by the same player
  for (const match of matches) {
    if (!match.winnerId) {
      // Draw breaks streak
      break;
    }

    if (match.winnerId === yourUserId && streakHolder === 'you') {
      count++;
    } else if (match.winnerId === opponentUserId && streakHolder === 'opponent') {
      count++;
    } else {
      // Different winner, streak ends
      break;
    }
  }

  return { holder: streakHolder, count };
}

/**
 * Normalize player pair to ensure consistent ordering
 * Always returns [smaller_id, larger_id]
 */
export function normalizePair(userA: string, userB: string): [string, string] {
  return userA < userB ? [userA, userB] : [userB, userA];
}

/**
 * Get head-to-head statistics between current user and opponent
 */
export async function getH2HStats(
  currentUserId: string,
  opponentUserId: string
): Promise<H2HStats | null> {
  // Get opponent info
  const opponent = await prisma.user.findUnique({
    where: { id: opponentUserId },
    select: {
      id: true,
      firstName: true,
      username: true,
      photoUrl: true,
    },
  });

  if (!opponent) {
    return null;
  }

  // Normalize pair for consistent queries
  const [player1, player2] = normalizePair(currentUserId, opponentUserId);

  // Get all finished duels between these two players
  const duels = await prisma.duel.findMany({
    where: {
      status: 'finished',
      OR: [
        { creatorId: player1, opponentId: player2 },
        { creatorId: player2, opponentId: player1 },
      ],
    },
    select: {
      id: true,
      winnerId: true,
      finishedAt: true,
      createdAt: true,
      isRanked: true,
    },
    orderBy: {
      finishedAt: 'desc',
    },
  });

  // Calculate totals
  let youWins = 0;
  let opponentWins = 0;
  let draws = 0;

  for (const duel of duels) {
    if (!duel.winnerId) {
      draws++;
    } else if (duel.winnerId === currentUserId) {
      youWins++;
    } else if (duel.winnerId === opponentUserId) {
      opponentWins++;
    }
  }

  // Calculate streak from recent matches
  const streak = calculateStreak(duels, currentUserId, opponentUserId);

  // Get last 5 matches
  const lastMatches = duels.slice(0, 5).map(duel => ({
    duelId: duel.id,
    date: (duel.finishedAt || duel.createdAt).toISOString(),
    winner: !duel.winnerId 
      ? 'draw' as const
      : duel.winnerId === currentUserId 
        ? 'you' as const 
        : 'opponent' as const,
    isRanked: duel.isRanked,
  }));

  // Debug log
  console.log(JSON.stringify({
    event: 'h2h_stats_calculated',
    currentUserId,
    opponentUserId,
    matchCount: duels.length,
    youWins,
    opponentWins,
    draws,
    streak,
    timestamp: new Date().toISOString(),
  }));

  return {
    opponent: {
      id: opponent.id,
      firstName: opponent.firstName,
      username: opponent.username,
      photoUrl: opponent.photoUrl,
    },
    total: {
      youWins,
      opponentWins,
      draws,
    },
    streak,
    lastMatches,
  };
}
