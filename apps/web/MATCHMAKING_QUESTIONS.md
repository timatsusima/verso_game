# Matchmaking Question Generation

## Overview

Matchmaking duels use a specialized question selection algorithm that ensures:
1. **No easy questions** - Only medium and hard difficulty
2. **Topic diversity** - Maximum 1 question per subtopic (topicCap=1)
3. **Null topic handling** - Questions without subtopic are treated as 'general'
4. **Random shuffle** - Fair question distribution
5. **Graceful fallback** - Relaxes constraints if needed

## Implementation

### Function: `getMatchmakingQuestions()`

Located in: `apps/web/src/lib/question-bank.ts`

```typescript
export async function getMatchmakingQuestions(
  count: 10 | 20 | 30,
  language: Language
): Promise<GeneratedPack>
```

### Algorithm Steps

1. **Fetch available questions**
   - Filter: `difficulty IN ['medium', 'hard']`
   - Filter: `isActive = true`
   - Filter: `lastServedAt` within rotation period
   - Fetch: `count * 5` questions for diversity

2. **Map subtopic**
   - If `subtopic` is null → `effectiveTopic = 'general'`
   - Otherwise → `effectiveTopic = subtopic`

3. **Apply topicCap=1 constraint**
   - Shuffle questions randomly
   - Select max 1 question per topic
   - Stop when `count` reached

4. **Fallback mechanism**
   - If insufficient questions (< count):
     - Relax to topicCap=2
     - Retry selection
   - If still insufficient:
     - Throw descriptive error with stats

5. **Mark as served**
   - Update `timesServed` counter
   - Set `lastServedAt` timestamp

6. **Build final pack**
   - Final shuffle for extra randomness
   - Generate seed and commitHash
   - Calculate statistics

### Statistics Logged

```json
{
  "event": "matchmaking_questions_generated",
  "count": 10,
  "language": "ru",
  "difficultyDistribution": {
    "medium": 6,
    "hard": 4
  },
  "topicDistribution": {
    "chemistry": 1,
    "physics": 1,
    "math": 1,
    "biology": 1,
    "history": 1,
    "general": 5
  },
  "uniqueTopics": 6,
  "timestamp": "2026-01-18T17:53:00.000Z"
}
```

## Usage

### API Endpoint

`POST /api/duel/[id]/generate-questions`

Automatically detects matchmaking duels via `duel.isRanked` flag:

```typescript
if (duel.isRanked) {
  // Use matchmaking algorithm
  pack = await getMatchmakingQuestions(
    duel.questionsCount as 10 | 20 | 30,
    duel.language as 'ru' | 'en'
  );
} else {
  // Use regular topic-based generation
  pack = await getOrGenerateQuestions(...);
}
```

## Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `topicCap` (primary) | 1 | Max questions per subtopic |
| `topicCap` (fallback) | 2 | Relaxed cap if insufficient |
| `ROTATION_DAYS` | 30 | Don't reuse questions within 30 days |
| Fetch multiplier | 5x | Fetch `count * 5` for diversity |

## Error Handling

If insufficient questions available after fallback:

```
Error: Insufficient questions for matchmaking: need 10, found 7 after topicCap filter. 
Available pool: 45 questions with 7 unique topics. 
Consider: 1) Adding more questions to database, 2) Reducing ROTATION_DAYS, 3) Relaxing topicCap further.
```

## Testing

Unit tests in `apps/web/src/lib/question-bank.unit.test.ts`:

- ✅ No easy difficulty questions
- ✅ topicCap=1 enforcement
- ✅ Null subtopic maps to 'general'
- ✅ Random shuffle implementation
- ✅ Fallback to topicCap=2
- ✅ Error on insufficient questions
- ✅ Statistics calculation

Run tests:
```bash
cd apps/web
pnpm test -- question-bank.unit.test.ts
```

## Database Schema

### QuestionBank Model

```prisma
model QuestionBank {
  id             String    @id @default(cuid())
  topicNorm      String
  subtopic       String?   // ← NULL = 'general' in matchmaking
  language       String    // "ru" | "en"
  difficulty     String    // "easy" | "medium" | "hard"
  questionText   String    @db.Text
  options        String    // JSON array of 4 options
  correctIndex   Int       // 0-3
  fingerprint    String    @unique
  timesServed    Int       @default(0)
  lastServedAt   DateTime?
  isActive       Boolean   @default(true)
  // ...
  @@index([topicNorm, language, difficulty])
}
```

## Example Output

### Request
```typescript
await getMatchmakingQuestions(10, 'ru')
```

### Response
```typescript
{
  questions: [
    { id: 'q-...', text: '...', options: [...], correctIndex: 2 },
    // ... 9 more questions
  ],
  seed: '1a2b3c...',
  commitHash: '9f8e7d...',
  stats: {
    fromCache: 10,
    newlyGenerated: 0,
    difficultyDistribution: { medium: 7, hard: 3 },
    topicDistribution: { chemistry: 1, physics: 1, math: 1, ... }
  }
}
```

## Migration Notes

### Before (Regular Duel)
- Questions filtered by single `topicNorm`
- All difficulties allowed
- No subtopic filtering
- Questions sorted by `lastServedAt` + `timesServed`

### After (Matchmaking)
- Questions from all topics
- Only medium+hard difficulty
- Max 1 question per subtopic
- Random shuffle for fairness
