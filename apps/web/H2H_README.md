# Head-to-Head (H2H) Stats - Feature Documentation

## Overview

Personal rivalry tracking between friends. Shows win/loss record, current winning streak, and recent match history.

## User Experience

### Where It Shows

**Location:** `/duel/[id]/play` page, during waiting/ready state (before game starts)

**Conditions:**
- Opponent has joined the duel
- User is authenticated
- At least one finished match exists between players

### What Users See

```
⚔️ Head-to-Head                    5 matches
┌─────────────────────────────────────────┐
│            7        —        5          │
│           You              Friend        │
│                                         │
│              1 draw                     │
│                                         │
│  🔥 You won 3 in a row                 │
│                                         │
│  Last matches:                          │
│  [W] [W] [W] [L] [W]                  │
└─────────────────────────────────────────┘
```

**Elements:**
- **Score**: Your wins — Opponent wins
- **Draws**: Count of tied games (if any)
- **Streak**: Current consecutive wins by one player
- **Last 5**: W/L/D indicators (⭐ = ranked match)

### Graceful Degradation

- **No history**: Component doesn't show
- **API error**: Component doesn't show
- **Loading**: Shows "Loading H2H..." briefly
- **Opponent not joined yet**: Doesn't show (no opponentId)

## API

### Endpoint

```
GET /api/h2h?opponentId={userId}
Authorization: Bearer {jwt_token}
```

### Request

**Query Parameters:**
- `opponentId` (required): User ID of opponent

**Headers:**
- `Authorization`: Bearer token from auth store

### Response

**Success (200):**
```json
{
  "success": true,
  "data": {
    "opponent": {
      "id": "user_xyz",
      "firstName": "Alex",
      "username": "alex123",
      "photoUrl": "https://..."
    },
    "total": {
      "youWins": 7,
      "opponentWins": 5,
      "draws": 1
    },
    "streak": {
      "holder": "you",
      "count": 3
    },
    "lastMatches": [
      {
        "duelId": "duel_abc",
        "date": "2026-01-18T15:30:00.000Z",
        "winner": "you",
        "isRanked": true
      },
      // ... up to 5 matches
    ]
  }
}
```

**No History (200):**
```json
{
  "success": true,
  "data": null,
  "message": "Opponent not found"
}
```

**Errors:**
- `401`: Missing or invalid JWT
- `400`: Missing opponentId or same as current user
- `500`: Internal server error

## Implementation

### Files

| File | Purpose |
|------|---------|
| `src/lib/h2h.ts` | Core logic: aggregation, streak calculation |
| `src/lib/h2h.test.ts` | 13 unit tests (all passing) |
| `src/app/api/h2h/route.ts` | API endpoint handler |
| `src/components/game/h2h-stats.tsx` | UI component |
| `src/app/duel/[id]/play/page.tsx` | Integration point |

### Core Functions

#### `getH2HStats(currentUserId, opponentUserId)`

Aggregates all finished duels between two players.

**Steps:**
1. Fetch opponent info from User table
2. Normalize player pair: `[min(id1, id2), max(id1, id2)]`
3. Query all `status='finished'` duels between pair
4. Count wins/losses/draws
5. Calculate current streak
6. Get last 5 matches
7. Return structured stats

**Database Query:**
```prisma
prisma.duel.findMany({
  where: {
    status: 'finished',
    OR: [
      { creatorId: player1, opponentId: player2 },
      { creatorId: player2, opponentId: player1 }
    ]
  },
  orderBy: { finishedAt: 'desc' }
})
```

#### `calculateStreak(matches, yourId, opponentId)`

Determines current winning streak from most recent matches.

**Algorithm:**
```
1. Start from most recent match (index 0)
2. If draw → return { holder: null, count: 0 }
3. Determine streak holder (who won last match)
4. Count consecutive wins by same player
5. Stop when:
   - Different winner found
   - Draw encountered
   - End of matches array
```

**Examples:**
```typescript
// You won last 3
[{winnerId: you}, {winnerId: you}, {winnerId: you}, {winnerId: opp}]
→ { holder: 'you', count: 3 }

// Alternating
[{winnerId: you}, {winnerId: opp}, {winnerId: you}]
→ { holder: 'you', count: 1 }

// Latest is draw
[{winnerId: null}, {winnerId: you}, {winnerId: you}]
→ { holder: null, count: 0 }
```

#### `normalizePair(userA, userB)`

Ensures consistent player pair ordering for queries.

```typescript
normalizePair('user_zzz', 'user_aaa') 
→ ['user_aaa', 'user_zzz']
```

This prevents duplicate queries like:
- `WHERE creatorId='A' AND opponentId='B'` vs
- `WHERE creatorId='B' AND opponentId='A'`

## Testing

### Run Tests

```bash
cd apps/web
pnpm test -- h2h.test.ts
```

### Test Coverage

**Streak Calculation (9 tests):**
- ✅ 3 consecutive wins → streak 3
- ✅ Alternating wins → streak 1
- ✅ Opponent streak
- ✅ Draw breaks streak
- ✅ Draw in middle
- ✅ Empty matches
- ✅ Single match (win/draw)
- ✅ Long streak (10+)

**Pair Normalization (4 tests):**
- ✅ Reorder if needed
- ✅ Keep if already normalized
- ✅ Numeric IDs
- ✅ Same IDs

All 13 tests passing ✅

## Performance

### Database Impact

**Queries per H2H request:** 2
1. `User.findUnique` - opponent info
2. `Duel.findMany` - finished duels (with indexes)

**Indexes used:**
- `Duel.status` (existing)
- `Duel.creatorId` (existing)
- `Duel.opponentId` (existing)

**Optimization:**
- Normalized pair query (single OR clause)
- `SELECT` only needed fields
- `ORDER BY finishedAt DESC` with limit for last 5

### Caching Opportunity

For high-traffic pairs, consider Redis cache:
```typescript
const cacheKey = `h2h:${player1}:${player2}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... calculate stats ...

await redis.setex(cacheKey, 300, JSON.stringify(stats)); // 5min TTL
```

## Security

### Authentication

- JWT required for all requests
- Validates user identity
- Can't access other users' H2H without being one of the pair

### Authorization

- No special permissions needed
- Any authenticated user can view their H2H with any other user
- Data is public (win/loss records)

### Rate Limiting

Consider adding for production:
```typescript
// In API route
import rateLimit from '@/lib/rate-limit';

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

await limiter.check(request, 10, 'H2H_API'); // 10 req/min
```

## Monitoring

### Logs

All H2H requests log structured JSON:
```json
{
  "event": "h2h_stats_calculated",
  "currentUserId": "user_123",
  "opponentUserId": "user_456",
  "matchCount": 13,
  "youWins": 7,
  "opponentWins": 5,
  "draws": 1,
  "streak": { "holder": "you", "count": 3 },
  "timestamp": "2026-01-18T15:30:00.000Z"
}
```

### Metrics to Track

1. **API usage**: Requests per hour/day
2. **Average matches per pair**: Distribution
3. **Streak distribution**: How many pairs have streaks > 5?
4. **Error rate**: Failed requests percentage
5. **Response time**: P50, P95, P99

## Future Enhancements

### Phase 2
- [ ] Win rate percentage
- [ ] Best streak (all-time record)
- [ ] First win date (rivalry start)
- [ ] Most played topic together

### Phase 3
- [ ] Time-based filters (last 30 days)
- [ ] Head-to-head leaderboard (among mutual friends)
- [ ] Achievements (10 wins, 5 streak, etc)
- [ ] Rivalry badges/titles

### Phase 4
- [ ] Share rivalry card to Telegram
- [ ] Challenge rematch from H2H screen
- [ ] Historical streak graph
- [ ] Topic-specific H2H (best at sports, science, etc)

## Troubleshooting

### H2H Not Showing

**Checklist:**
1. Is opponent joined? (check `opponent?.id`)
2. Is user authenticated? (check `token`)
3. API returning 200? (check network tab)
4. Any console errors? (check browser console)
5. Have they played before? (check DB duels)

**Debug:**
```bash
# Check duels between users
psql $DATABASE_URL -c "
SELECT id, status, winnerId, finishedAt 
FROM \"Duel\" 
WHERE status='finished' 
AND ((creatorId='user1' AND opponentId='user2') 
     OR (creatorId='user2' AND opponentId='user1'))
ORDER BY finishedAt DESC;
"
```

### Streak Not Updating

**Cause:** Duel status not 'finished'

**Check:**
```sql
SELECT id, status, winnerId FROM "Duel" WHERE id='duel_xyz';
```

**Fix:** Ensure duel finish flow sets `status='finished'` and `winnerId`

### Performance Issues

**Symptoms:**
- Slow API response (>1s)
- Database timeout

**Solutions:**
1. Add indexes if missing:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_duel_status ON "Duel"(status);
   CREATE INDEX IF NOT EXISTS idx_duel_finished ON "Duel"(finishedAt DESC);
   ```
2. Limit query scope:
   ```typescript
   // Only get last 100 matches max
   take: 100
   ```
3. Add caching (Redis)

## Summary

✅ **Implemented:**
- Server-side H2H aggregation
- Streak calculation with tests
- API endpoint with auth
- UI component on play page
- Graceful error handling

✅ **MVP Criteria Met:**
- Shows wins/losses
- Shows current streak
- Shows last 5 matches
- Works for friend duels
- Minimal UI impact
- No breaking changes

✅ **Quality:**
- 13 passing unit tests
- TypeScript strict mode
- Error-safe implementation
- Structured logging
- Performance optimized

**Ready for production!** 🚀
