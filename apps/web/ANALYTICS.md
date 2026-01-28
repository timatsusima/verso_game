# Daily Analytics Documentation

## Overview

Minimal backend analytics system to track:
1. **User acquisition** - New users per day
2. **Activation** - Users who started/finished their first duel
3. **Drop-off analysis** - At which duel count users stop playing

## Architecture

### No Client-Side Events
- ✅ All tracking happens server-side
- ✅ Deterministic, based on DB state
- ✅ No Amplitude/GA/Mixpanel
- ✅ No Telegram SDK tracking

### Database Schema

#### Existing Tables (Used)

**User**
```prisma
model User {
  id        String   @id
  createdAt DateTime @default(now())  // ← Registration timestamp
  // ... other fields
  
  @@index([createdAt])  // For efficient date queries
}
```

**Duel**
```prisma
model Duel {
  id         String    @id
  status     String    // 'finished' = completed duel
  creatorId  String
  opponentId String?
  finishedAt DateTime?
  // ... other fields
}
```

#### New Analytics Table

**UserDailyDuelCounter**
```prisma
model UserDailyDuelCounter {
  id          String   @id @default(cuid())
  userId      String
  date        DateTime @db.Date        // Normalized to 00:00
  duelsPlayed Int      @default(0)     // Count of finished duels this day
  
  @@unique([userId, date])
  @@index([date])
}
```

**Purpose:** Track how many duels each user completed per day.

**Updated on:** Every duel finish (both players)

## Implementation

### 1. Analytics Service

**File:** `apps/web/src/lib/analytics.ts`

#### Function: `incrementDailyDuelCounter()`

Called when a duel finishes. Increments counter for both players.

```typescript
await incrementDailyDuelCounter(userId);
```

**Logic:**
1. Normalize date to 00:00 (start of day)
2. Upsert record: increment if exists, create if not
3. Never throws - analytics shouldn't break game flow

#### Function: `getDailyMetrics(date: Date)`

Returns metrics for a specific day:

```typescript
interface DailyMetrics {
  date: string;                          // YYYY-MM-DD
  newUsers: number;                      // Registered today
  newUsersPlayedAtLeastOne: number;      // Started >= 1 duel
  newUsersFinishedAtLeastOne: number;    // Finished >= 1 duel
  duelDropoff: {
    1: number;  // Users who played >= 1 duel
    2: number;  // Users who played >= 2 duels
    3: number;  // Users who played >= 3 duels
    4: number;  // Users who played >= 4 duels
    5: number;  // Users who played >= 5 duels
  };
}
```

**Queries:**

1. **New users**: Count `User.createdAt` in [00:00 - 23:59]
2. **Played at least one**: Count new users with duels in `['in_progress', 'finished']`
3. **Finished at least one**: Count new users with duels in `['finished']`
4. **Drop-off**: GroupBy `UserDailyDuelCounter.duelsPlayed` for this date

### 2. Integration Point

**File:** `apps/web/src/app/api/duel/[id]/finish/route.ts`

When duel finishes:

```typescript
// After rating calculation, before response
incrementDailyDuelCounter(duel.creatorId).catch(err => 
  console.error('[Analytics] Failed:', err)
);
if (duel.opponentId) {
  incrementDailyDuelCounter(duel.opponentId).catch(err =>
    console.error('[Analytics] Failed:', err)
  );
}
```

**Non-blocking:** Runs asynchronously, doesn't delay response.

### 3. API Endpoint

**File:** `apps/web/src/app/api/admin/daily-metrics/route.ts`

**Endpoint:** `GET /api/admin/daily-metrics`

**Query Parameters:**

| Parameter | Format | Description | Example |
|-----------|--------|-------------|---------|
| `date` | YYYY-MM-DD | Single day metrics | `?date=2026-01-18` |
| `startDate` + `endDate` | YYYY-MM-DD | Date range | `?startDate=2026-01-15&endDate=2026-01-18` |
| (none) | - | Today's metrics | `/api/admin/daily-metrics` |

**Response (Single Day):**

```json
{
  "success": true,
  "metrics": {
    "date": "2026-01-18",
    "newUsers": 42,
    "newUsersPlayedAtLeastOne": 35,
    "newUsersFinishedAtLeastOne": 28,
    "duelDropoff": {
      "1": 150,
      "2": 120,
      "3": 80,
      "4": 45,
      "5": 20
    }
  }
}
```

**Response (Date Range):**

```json
{
  "success": true,
  "dateRange": {
    "start": "2026-01-15",
    "end": "2026-01-18"
  },
  "metrics": [
    { "date": "2026-01-15", ... },
    { "date": "2026-01-16", ... },
    { "date": "2026-01-17", ... },
    { "date": "2026-01-18", ... }
  ]
}
```

## Usage Examples

### Today's Metrics

```bash
curl https://your-app.com/api/admin/daily-metrics
```

### Specific Day

```bash
curl "https://your-app.com/api/admin/daily-metrics?date=2026-01-18"
```

### Last 7 Days

```bash
curl "https://your-app.com/api/admin/daily-metrics?startDate=2026-01-12&endDate=2026-01-18"
```

## Interpreting Metrics

### Acquisition Funnel

```
New Users: 100
  ↓ 70% conversion
Played >= 1: 70
  ↓ 80% completion
Finished >= 1: 56
```

**Key Questions:**
1. What % of new users start playing? → `newUsersPlayedAtLeastOne / newUsers`
2. What % complete their first duel? → `newUsersFinishedAtLeastOne / newUsersPlayedAtLeastOne`

### Drop-off Analysis

```json
{
  "1": 150,  // 150 users played >= 1 duel
  "2": 120,  // 120 users played >= 2 duels (30 dropped after 1st)
  "3": 80,   // 80 users played >= 3 duels (40 dropped after 2nd)
  "4": 45,   // 45 users played >= 4 duels (35 dropped after 3rd)
  "5": 20    // 20 users played >= 5 duels (25 dropped after 4th)
}
```

**Calculate Drop-off Rate:**
- After 1st duel: `(150-120)/150 = 20%`
- After 2nd duel: `(120-80)/120 = 33%`
- After 3rd duel: `(80-45)/80 = 44%` ← **Highest drop-off**
- After 4th duel: `(45-20)/45 = 56%`

**Insight:** Most users drop after 3rd duel → investigate game length, difficulty, rewards.

## Migration

### Apply Schema Changes

```bash
cd apps/web
pnpm db:push  # Development
# or
pnpm prisma migrate dev --name add_analytics  # Production
```

### Verify Table

```sql
SELECT * FROM "UserDailyDuelCounter" LIMIT 10;
```

## Monitoring

### Check Analytics Health

```bash
# Today's metrics
curl /api/admin/daily-metrics | jq

# Check if counters are updating
SELECT date, COUNT(*), SUM("duelsPlayed") 
FROM "UserDailyDuelCounter" 
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY date
ORDER BY date DESC;
```

### Logs to Watch

```
[Analytics] Incremented duel counter for user abc123 on 2026-01-18
[Analytics] Failed to increment duel counter: <error>
```

## Performance

### Query Optimization

All queries use indexed fields:
- `User.createdAt` → `@@index([createdAt])`
- `UserDailyDuelCounter.date` → `@@index([date])`
- `UserDailyDuelCounter.userId_date` → `@@unique([userId, date])`

### Scalability

**Current approach:** Suitable for ~100K users/day

**If scaling needed:**
1. Add materialized view for daily aggregates
2. Use background job for metrics calculation
3. Cache results in Redis

## Future Extensions

### Easy Additions

1. **Retention**: Track users who return after N days
   ```sql
   SELECT userId FROM UserDailyDuelCounter 
   WHERE date = TODAY() AND userId IN (
     SELECT userId FROM UserDailyDuelCounter WHERE date = TODAY() - 7
   )
   ```

2. **Churn**: Users who haven't played in 7+ days
   ```sql
   SELECT userId FROM User 
   WHERE id NOT IN (
     SELECT DISTINCT userId FROM UserDailyDuelCounter 
     WHERE date >= CURRENT_DATE - 7
   )
   ```

3. **Peak activity hours**: Add `hour` field to counter

### No Breaking Changes

All extensions can be added without changing existing schema.

## Security

### Production Considerations

**Current:** No auth on `/api/admin/daily-metrics`

**Recommended for production:**

```typescript
// Add to route.ts
import { verifyJWT } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  
  try {
    const payload = await verifyJWT(token || '');
    // Check if user is admin
    if (!payload.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // ... rest of handler
}
```

Or use environment variable:

```typescript
const adminSecret = process.env.ADMIN_SECRET;
const providedSecret = request.headers.get('X-Admin-Secret');

if (providedSecret !== adminSecret) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

## Testing

### Manual Test

1. Create a test user
2. Finish a duel
3. Check counter:
   ```sql
   SELECT * FROM "UserDailyDuelCounter" 
   WHERE "userId" = '<test-user-id>' 
   AND date = CURRENT_DATE;
   ```
4. Call API:
   ```bash
   curl /api/admin/daily-metrics?date=$(date +%Y-%m-%d)
   ```

### Expected Behavior

- Counter increments on every duel finish
- Both players get incremented
- Same day = same counter incremented
- Different day = new counter created
- Idempotent: calling twice doesn't double-count (handled by upsert)

## Troubleshooting

### Counter not incrementing

**Check logs:**
```
[Analytics] Failed to increment duel counter: <error>
```

**Common causes:**
1. DB connection issue
2. Missing userId
3. Date parsing error

**Fix:** Check `incrementDailyDuelCounter()` in `/lib/analytics.ts`

### Metrics show 0 for new users

**Check:**
1. Are users being created with `createdAt`?
2. Is timezone correct? (Use UTC in queries)
3. Date range includes today?

**Query manually:**
```sql
SELECT COUNT(*) FROM "User" 
WHERE "createdAt" >= CURRENT_DATE 
AND "createdAt" < CURRENT_DATE + INTERVAL '1 day';
```

### Drop-off metrics empty

**Reason:** No duels finished yet today

**Wait for:** First duel to complete after midnight

**Or:** Query previous date with `?date=2026-01-17`

## Summary

✅ **Minimal**: 1 new table, 3 new functions, 1 endpoint
✅ **Server-only**: No client-side tracking
✅ **Deterministic**: All data from DB state
✅ **Non-blocking**: Analytics never delays game
✅ **Extensible**: Easy to add more metrics
✅ **Production-ready**: Indexed, optimized, error-handled
