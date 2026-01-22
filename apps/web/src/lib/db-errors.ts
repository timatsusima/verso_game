/**
 * Database error classification utilities
 * Detects transient DB errors (cold start, connection closed, timeouts)
 */

export type DbErrorCode = 'DB_COLD_START' | 'DB_UNAVAILABLE';

/**
 * Checks if error is a transient DB error that can be retried
 */
export function isDbTransientError(error: unknown): boolean {
  if (!error) return false;

  const errorStr = String(error);
  const errorMessage = error instanceof Error ? error.message : errorStr;
  const errorStack = error instanceof Error ? error.stack : '';

  // Check for Prisma error with kind: Closed
  if (errorStr.includes('kind: Closed') || errorStr.includes('Error { kind: Closed')) {
    return true;
  }

  // Check for connection-related errors
  const transientPatterns = [
    'connection terminated',
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    "Can't reach database server",
    'Connection closed',
    'Connection terminated',
    'Connection pool',
    'Connection timeout',
    'Connection refused',
    'ENOTFOUND', // DNS resolution failure
    'ENETUNREACH', // Network unreachable
    'prepared statement',
    'server closed the connection',
    'connection was closed',
    'database server is starting',
    'database is starting',
    'waking up',
    'autosuspend',
  ];

  const combinedText = `${errorMessage} ${errorStack}`.toLowerCase();
  
  for (const pattern of transientPatterns) {
    if (combinedText.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  // Check Prisma error codes
  if (error && typeof error === 'object') {
    // Prisma error structure
    if ('code' in error) {
      const code = String(error.code);
      // P1001: Can't reach database server
      // P1008: Operations timed out
      // P1017: Server has closed the connection
      if (['P1001', 'P1008', 'P1017'].includes(code)) {
        return true;
      }
    }

    // Check for PrismaClientKnownRequestError or PrismaClientUnknownRequestError
    if ('meta' in error || 'clientVersion' in error) {
      // This looks like a Prisma error
      if (errorMessage.includes('closed') || errorMessage.includes('timeout')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Maps DB error to error code
 */
export function dbErrorToCode(error: unknown): DbErrorCode {
  if (!isDbTransientError(error)) {
    return 'DB_UNAVAILABLE';
  }

  const errorStr = String(error);
  const errorMessage = error instanceof Error ? error.message : errorStr;

  // Check for cold start indicators
  const coldStartPatterns = [
    'kind: Closed',
    'connection closed',
    'connection terminated',
    'autosuspend',
    'waking up',
    'database is starting',
    'server closed the connection',
  ];

  const combinedText = `${errorMessage} ${errorStr}`.toLowerCase();
  
  for (const pattern of coldStartPatterns) {
    if (combinedText.includes(pattern.toLowerCase())) {
      return 'DB_COLD_START';
    }
  }

  // Check Prisma error code P1017 (Server has closed the connection)
  if (error && typeof error === 'object' && 'code' in error) {
    if (String(error.code) === 'P1017') {
      return 'DB_COLD_START';
    }
  }

  return 'DB_UNAVAILABLE';
}

/**
 * Wraps a DB operation with retry logic for transient errors
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delayMs?: number } = {}
): Promise<T> {
  const { retries = 1, delayMs = 1200 } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If not a transient error, throw immediately
      if (!isDbTransientError(error)) {
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt >= retries) {
        throw error;
      }

      // Log retry attempt
      console.log(`[DB Retry] Transient error detected, retrying... (attempt ${attempt + 1}/${retries + 1})`, {
        error: error instanceof Error ? error.message : String(error),
        code: dbErrorToCode(error),
      });

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}
