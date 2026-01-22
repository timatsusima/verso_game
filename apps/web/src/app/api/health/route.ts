import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDbTransientError, dbErrorToCode } from '@/lib/db-errors';

/**
 * Health check endpoint that warms up DB connection
 * Safe to call frequently (runs SELECT 1)
 */
export async function GET() {
  try {
    // Simple query to warm up DB connection
    await prisma.$queryRaw`SELECT 1`;
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Health] DB check failed:', error);

    // Check if this is a transient DB error
    if (isDbTransientError(error)) {
      const code = dbErrorToCode(error);
      return NextResponse.json(
        { 
          ok: false,
          code,
          message: code === 'DB_COLD_START' ? 'Database waking up' : 'Database temporarily unavailable',
        },
        { status: 503 }
      );
    }

    // For other errors, return 503 with generic code
    return NextResponse.json(
      { 
        ok: false,
        code: 'DB_UNAVAILABLE',
        message: 'Database unavailable',
      },
      { status: 503 }
    );
  }
}
