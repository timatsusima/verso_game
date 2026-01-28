-- Analytics Migration: Add UserDailyDuelCounter table
-- Apply this manually if Vercel auto-migration fails

-- 1. Add index to User.createdAt for faster queries
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

-- 2. Create UserDailyDuelCounter table
CREATE TABLE IF NOT EXISTS "UserDailyDuelCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "duelsPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDailyDuelCounter_pkey" PRIMARY KEY ("id")
);

-- 3. Add unique constraint on userId + date
CREATE UNIQUE INDEX IF NOT EXISTS "UserDailyDuelCounter_userId_date_key" 
ON "UserDailyDuelCounter"("userId", "date");

-- 4. Add index on date for fast daily queries
CREATE INDEX IF NOT EXISTS "UserDailyDuelCounter_date_idx" 
ON "UserDailyDuelCounter"("date");

-- 5. Add index on userId
CREATE INDEX IF NOT EXISTS "UserDailyDuelCounter_userId_idx" 
ON "UserDailyDuelCounter"("userId");

-- 6. Add foreign key constraint
ALTER TABLE "UserDailyDuelCounter" 
ADD CONSTRAINT "UserDailyDuelCounter_userId_fkey" 
FOREIGN KEY ("userId") REFERENCES "User"("id") 
ON DELETE CASCADE ON UPDATE CASCADE;

-- Verify migration
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'UserDailyDuelCounter'
ORDER BY ordinal_position;

-- Test query: count existing data
SELECT COUNT(*) as total_counters FROM "UserDailyDuelCounter";

COMMENT ON TABLE "UserDailyDuelCounter" IS 'Tracks daily duel counts per user for drop-off analysis';
