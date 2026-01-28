import { prisma } from './prisma';

/**
 * Increment daily duel counter for a user
 * Called when a duel is finished
 */
export async function incrementDailyDuelCounter(userId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day

  try {
    await prisma.userDailyDuelCounter.upsert({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      update: {
        duelsPlayed: {
          increment: 1,
        },
      },
      create: {
        userId,
        date: today,
        duelsPlayed: 1,
      },
    });

    console.log(`[Analytics] Incremented duel counter for user ${userId} on ${today.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error('[Analytics] Failed to increment duel counter:', error);
    // Don't throw - analytics failure shouldn't break game flow
  }
}

/**
 * Get daily metrics for analytics
 */
export interface DailyMetrics {
  date: string;
  newUsers: number;
  newUsersPlayedAtLeastOne: number;
  newUsersFinishedAtLeastOne: number;
  duelDropoff: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export async function getDailyMetrics(date: Date): Promise<DailyMetrics> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. New users registered today
  const newUsers = await prisma.user.count({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  // 2. Get IDs of new users for further analysis
  const newUserIds = await prisma.user.findMany({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    select: {
      id: true,
    },
  });

  const newUserIdList = newUserIds.map(u => u.id);

  // 3. New users who played at least one duel (as creator or opponent)
  const newUsersPlayedAtLeastOne = await prisma.user.count({
    where: {
      id: {
        in: newUserIdList,
      },
      OR: [
        {
          createdDuels: {
            some: {
              status: {
                in: ['in_progress', 'finished'],
              },
            },
          },
        },
        {
          joinedDuels: {
            some: {
              status: {
                in: ['in_progress', 'finished'],
              },
            },
          },
        },
      ],
    },
  });

  // 4. New users who finished at least one duel
  const newUsersFinishedAtLeastOne = await prisma.user.count({
    where: {
      id: {
        in: newUserIdList,
      },
      OR: [
        {
          createdDuels: {
            some: {
              status: 'finished',
            },
          },
        },
        {
          joinedDuels: {
            some: {
              status: 'finished',
            },
          },
        },
      ],
    },
  });

  // 5. Duel drop-off analysis (for this specific day)
  const dropoffData = await prisma.userDailyDuelCounter.groupBy({
    by: ['duelsPlayed'],
    where: {
      date: startOfDay,
    },
    _count: {
      userId: true,
    },
  });

  // Build duel dropoff object
  const duelDropoff = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  for (const item of dropoffData) {
    const count = item._count.userId;

    // Count users who played >= N duels
    if (item.duelsPlayed >= 1) duelDropoff[1] += count;
    if (item.duelsPlayed >= 2) duelDropoff[2] += count;
    if (item.duelsPlayed >= 3) duelDropoff[3] += count;
    if (item.duelsPlayed >= 4) duelDropoff[4] += count;
    if (item.duelsPlayed >= 5) duelDropoff[5] += count;
  }

  return {
    date: date.toISOString().split('T')[0],
    newUsers,
    newUsersPlayedAtLeastOne,
    newUsersFinishedAtLeastOne,
    duelDropoff,
  };
}

/**
 * Get metrics for multiple days
 */
export async function getMetricsForDateRange(
  startDate: Date,
  endDate: Date
): Promise<DailyMetrics[]> {
  const metrics: DailyMetrics[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayMetrics = await getDailyMetrics(new Date(currentDate));
    metrics.push(dayMetrics);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return metrics;
}
