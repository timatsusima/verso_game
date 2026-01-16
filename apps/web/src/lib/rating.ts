import { prisma } from './prisma';
import { normalizeTopic } from './question-bank';

// ============ Constants ============

const INITIAL_SR = 1000;
const INITIAL_RD = 350;
const MIN_SR = 0;
const MAX_SR = 30000;
const MIN_RD = 80;
const MAX_RD = 350;
const MIN_DELTA = -60;
const MAX_DELTA = 60;

// Anti-abuse: max ranked matches between same pair per 24h
const MAX_RANKED_MATCHES_PER_PAIR = 3;
const RANKED_COOLDOWN_HOURS = 24;

// ============ Types ============

export interface PlayerStats {
  playerId: string;
  correctCount: number;
  fasterCount: number;
  srBefore: number;
  rdBefore: number;
}

export interface RatingResult {
  srAfter: number;
  rdAfter: number;
  delta: number;
}

export interface MatchRatingData {
  creator: RatingResult;
  opponent: RatingResult;
  matchResultId: string;
}

// ============ Rating Calculation ============

/**
 * Calculate Elo expected score
 * expected = 1 / (1 + 10^((oppSR - mySR)/400))
 */
function calculateExpected(mySR: number, oppSR: number): number {
  const exponent = (oppSR - mySR) / 400;
  return 1 / (1 + Math.pow(10, exponent));
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate margin multiplier
 * margin = clamp((myCorrect - oppCorrect) / totalQuestions, -1..1)
 * marginMult = 1 + 0.35 * margin
 */
function calculateMarginMultiplier(
  myCorrect: number,
  oppCorrect: number,
  totalQuestions: number
): number {
  const margin = clamp((myCorrect - oppCorrect) / totalQuestions, -1, 1);
  return 1 + 0.35 * margin;
}

/**
 * Calculate speed multiplier (small impact)
 * speed = clamp((myFaster - oppFaster) / totalQuestions, -1..1)
 * speedMult = 1 + 0.10 * speed
 */
function calculateSpeedMultiplier(
  myFaster: number,
  oppFaster: number,
  totalQuestions: number
): number {
  const speed = clamp((myFaster - oppFaster) / totalQuestions, -1, 1);
  return 1 + 0.10 * speed;
}

/**
 * Calculate K factor
 * K = clamp(16 + (RD/50), 16..48)
 */
function calculateKFactor(rd: number): number {
  return clamp(16 + rd / 50, 16, 48);
}

/**
 * Calculate actual score (1 win, 0.5 draw, 0 lose)
 */
function calculateActualScore(
  myScore: number,
  oppScore: number
): number {
  if (myScore > oppScore) return 1;
  if (myScore < oppScore) return 0;
  return 0.5; // Draw
}

/**
 * Calculate rating delta for a player
 */
function calculateRatingDelta(
  myStats: PlayerStats,
  oppStats: PlayerStats,
  totalQuestions: number
): number {
  const actual = calculateActualScore(
    myStats.correctCount,
    oppStats.correctCount
  );
  const expected = calculateExpected(myStats.srBefore, oppStats.srBefore);
  
  const marginMult = calculateMarginMultiplier(
    myStats.correctCount,
    oppStats.correctCount,
    totalQuestions
  );
  
  const speedMult = calculateSpeedMultiplier(
    myStats.fasterCount,
    oppStats.fasterCount,
    totalQuestions
  );
  
  const k = calculateKFactor(myStats.rdBefore);
  
  const delta = k * (actual - expected) * marginMult * speedMult;
  
  return Math.round(clamp(delta, MIN_DELTA, MAX_DELTA));
}

/**
 * Calculate new rating after match
 */
function calculateNewRating(
  srBefore: number,
  delta: number,
  rdBefore: number
): { srAfter: number; rdAfter: number } {
  const srAfter = clamp(srBefore + delta, MIN_SR, MAX_SR);
  
  // Simple RD decay: max(80, rd - 10)
  // More sophisticated models can be added later
  const rdAfter = Math.max(MIN_RD, rdBefore - 10);
  
  return { srAfter, rdAfter };
}

// ============ Database Operations ============

/**
 * Get or create user rating
 */
async function getOrCreateRating(userId: string): Promise<{
  sr: number;
  rd: number;
  gamesPlayed: number;
}> {
  let rating = await prisma.userRating.findUnique({
    where: { userId },
  });

  if (!rating) {
    rating = await prisma.userRating.create({
      data: {
        userId,
        sr: INITIAL_SR,
        rd: INITIAL_RD,
        gamesPlayed: 0,
      },
    });
  }

  return {
    sr: rating.sr,
    rd: rating.rd,
    gamesPlayed: rating.gamesPlayed,
  };
}

/**
 * Check if ranked match is allowed (anti-abuse)
 */
async function canPlayRanked(
  creatorId: string,
  opponentId: string
): Promise<boolean> {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - RANKED_COOLDOWN_HOURS);

  const recentMatches = await prisma.matchResult.count({
    where: {
      isRanked: true,
      createdAt: { gte: cutoffTime },
      OR: [
        {
          duel: {
            creatorId,
            opponentId,
          },
        },
        {
          duel: {
            creatorId: opponentId,
            opponentId: creatorId,
          },
        },
      ],
    },
  });

  return recentMatches < MAX_RANKED_MATCHES_PER_PAIR;
}

/**
 * Count faster answers for a player
 */
function countFasterAnswers(
  results: Array<{
    perPlayer?: Array<{
      playerId: string;
      timeMs: number | null;
    }>;
  }>,
  playerId: string
): number {
  return results.filter(result => {
    const perPlayer = result.perPlayer;
    if (!perPlayer || perPlayer.length < 2) return false;
    
    const myTiming = perPlayer.find(p => p.playerId === playerId);
    const oppTiming = perPlayer.find(p => p.playerId !== playerId);
    
    if (!myTiming || !oppTiming) return false;
    if (myTiming.timeMs === null || oppTiming.timeMs === null) return false;
    
    return myTiming.timeMs < oppTiming.timeMs;
  }).length;
}

// ============ Main API ============

/**
 * Process match result and update ratings
 */
export async function processMatchRating(
  duelId: string,
  creatorId: string,
  opponentId: string | null,
  creatorScore: number,
  opponentScore: number,
  totalQuestions: number,
  topic: string,
  isRanked: boolean,
  questionResults: Array<{
    creatorCorrect: boolean;
    opponentCorrect: boolean;
    perPlayer?: Array<{
      playerId: string;
      timeMs: number | null;
    }>;
  }>
): Promise<MatchRatingData | null> {
  // Need both players for ranked
  if (!opponentId) {
    return null;
  }

  // Check anti-abuse: if too many ranked matches, force unranked
  const allowedRanked = isRanked && await canPlayRanked(creatorId, opponentId);
  const effectiveRanked = allowedRanked;

  // Get current ratings
  const creatorRating = await getOrCreateRating(creatorId);
  const opponentRating = await getOrCreateRating(opponentId);

  // Count faster answers
  const creatorFaster = countFasterAnswers(questionResults, creatorId);
  const opponentFaster = countFasterAnswers(questionResults, opponentId);

  // Prepare stats
  const creatorStats: PlayerStats = {
    playerId: creatorId,
    correctCount: creatorScore,
    fasterCount: creatorFaster,
    srBefore: creatorRating.sr,
    rdBefore: creatorRating.rd,
  };

  const opponentStats: PlayerStats = {
    playerId: opponentId,
    correctCount: opponentScore,
    fasterCount: opponentFaster,
    srBefore: opponentRating.sr,
    rdBefore: opponentRating.rd,
  };

  // Calculate deltas
  const creatorDelta = calculateRatingDelta(
    creatorStats,
    opponentStats,
    totalQuestions
  );
  const opponentDelta = calculateRatingDelta(
    opponentStats,
    creatorStats,
    totalQuestions
  );

  // Calculate new ratings
  const creatorNew = calculateNewRating(
    creatorRating.sr,
    creatorDelta,
    creatorRating.rd
  );
  const opponentNew = calculateNewRating(
    opponentRating.sr,
    opponentDelta,
    opponentRating.rd
  );

  // Update ratings only if ranked
  if (effectiveRanked) {
    await prisma.$transaction([
      // Update creator rating
      prisma.userRating.update({
        where: { userId: creatorId },
        data: {
          sr: creatorNew.srAfter,
          rd: creatorNew.rdAfter,
          gamesPlayed: { increment: 1 },
        },
      }),
      // Update opponent rating
      prisma.userRating.update({
        where: { userId: opponentId },
        data: {
          sr: opponentNew.srAfter,
          rd: opponentNew.rdAfter,
          gamesPlayed: { increment: 1 },
        },
      }),
      // Create match result
      prisma.matchResult.create({
        data: {
          duelId,
          isRanked: effectiveRanked,
          topicNorm: normalizeTopic(topic),
          totalQuestions,
          creatorCorrectCount: creatorScore,
          creatorFasterCount: creatorFaster,
          creatorSrBefore: creatorRating.sr,
          creatorSrAfter: creatorNew.srAfter,
          creatorDelta,
          opponentCorrectCount: opponentScore,
          opponentFasterCount: opponentFaster,
          opponentSrBefore: opponentRating.sr,
          opponentSrAfter: opponentNew.srAfter,
          opponentDelta,
        },
      }),
    ]);
  } else {
    // Unranked: just save stats without updating ratings
    await prisma.matchResult.create({
      data: {
        duelId,
        isRanked: false,
        topicNorm: normalizeTopic(topic),
        totalQuestions,
        creatorCorrectCount: creatorScore,
        creatorFasterCount: creatorFaster,
        creatorSrBefore: creatorRating.sr,
        creatorSrAfter: creatorRating.sr, // No change
        creatorDelta: 0,
        opponentCorrectCount: opponentScore,
        opponentFasterCount: opponentFaster,
        opponentSrBefore: opponentRating.sr,
        opponentSrAfter: opponentRating.sr, // No change
        opponentDelta: 0,
      },
    });
  }

  return {
    creator: {
      srAfter: effectiveRanked ? creatorNew.srAfter : creatorRating.sr,
      rdAfter: effectiveRanked ? creatorNew.rdAfter : creatorRating.rd,
      delta: effectiveRanked ? creatorDelta : 0,
    },
    opponent: {
      srAfter: effectiveRanked ? opponentNew.srAfter : opponentRating.sr,
      rdAfter: effectiveRanked ? opponentNew.rdAfter : opponentRating.rd,
      delta: effectiveRanked ? opponentDelta : 0,
    },
    matchResultId: duelId, // Will be set by Prisma
  };
}

/**
 * Get user rating
 */
export async function getUserRating(userId: string): Promise<{
  sr: number;
  rd: number;
  gamesPlayed: number;
  leagueName: string;
} | null> {
  const rating = await prisma.userRating.findUnique({
    where: { userId },
  });

  if (!rating) {
    return null;
  }

  // Simple league system (can be improved)
  const leagueName = getLeagueName(rating.sr);

  return {
    sr: rating.sr,
    rd: rating.rd,
    gamesPlayed: rating.gamesPlayed,
    leagueName,
  };
}

/**
 * Get league name from SR
 */
function getLeagueName(sr: number): string {
  if (sr >= 2500) return 'Master';
  if (sr >= 2000) return 'Diamond';
  if (sr >= 1500) return 'Platinum';
  if (sr >= 1200) return 'Gold';
  if (sr >= 1000) return 'Silver';
  return 'Bronze';
}
