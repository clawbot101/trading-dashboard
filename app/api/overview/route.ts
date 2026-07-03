/**
 * Overview API route.
 * GET: returns overview stats, equity curve, strategy leaderboard, venue split, PnL attribution, recent fills.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getOverviewStats,
  getEquityCurve,
  getStrategyLeaderboard,
  getVenueSplit,
  getPnlAttribution,
  getRecentFills,
} from '../../../lib/queries/overview';

// Query params schema
const OverviewParamsSchema = z.object({
  timeRange: z.enum(['24H', '7D', '30D', '90D', 'ALL']).default('24H'),
  venue: z.string().optional(),
  strategy: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const params = OverviewParamsSchema.parse({
      timeRange: searchParams.get('timeRange') || '24H',
      venue: searchParams.get('venue'),
      strategy: searchParams.get('strategy'),
    });

    // Build strategy filter array
    const strategies = params.strategy ? [params.strategy] : undefined;

    // Run queries (sequential to avoid connection pool exhaustion)
    const stats = await getOverviewStats(params.timeRange, params.venue, strategies);
    const equityCurve = await getEquityCurve(params.timeRange, params.venue, strategies);
    const strategyLeaderboard = await getStrategyLeaderboard(params.timeRange, params.venue);
    const venueSplit = await getVenueSplit();
    const pnlAttribution = await getPnlAttribution(params.timeRange, params.venue, strategies);
    const recentFills = await getRecentFills(20);

    // Build response
    const response = {
      ok: true,
      as_of: new Date().toISOString(),
      data: {
        stats,
        equityCurve,
        strategyLeaderboard,
        venueSplit,
        pnlAttribution,
        recentFills,
      },
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    console.error('[api/overview] Error:', err);

    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid parameters', details: err.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}