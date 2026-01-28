import { NextRequest, NextResponse } from 'next/server';
import { getDailyMetrics, getMetricsForDateRange } from '@/lib/analytics';

/**
 * GET /api/admin/daily-metrics
 * 
 * Query params:
 * - date: YYYY-MM-DD (default: today)
 * - startDate + endDate: for range query
 * 
 * Examples:
 * - /api/admin/daily-metrics - today's metrics
 * - /api/admin/daily-metrics?date=2026-01-18 - specific day
 * - /api/admin/daily-metrics?startDate=2026-01-15&endDate=2026-01-18 - date range
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const dateParam = searchParams.get('date');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    // Range query
    if (startDateParam && endDateParam) {
      const startDate = new Date(startDateParam);
      const endDate = new Date(endDateParam);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD' },
          { status: 400 }
        );
      }

      const metrics = await getMetricsForDateRange(startDate, endDate);
      
      return NextResponse.json({
        success: true,
        dateRange: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
        },
        metrics,
      });
    }

    // Single day query
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const metrics = await getDailyMetrics(targetDate);

    return NextResponse.json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error('[Admin] Daily metrics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
