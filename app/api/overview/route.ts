/**
 * Overview API route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getOverviewStats,
  getEquityCurve,
  getStrategyLeaderboard,
  getVenueSplit,
  getRecentFills,
  getLatestRebalanceStatus,
  getRebalanceEventsBetween,
  timeRangeToTimestamps,
} from '../../../lib/queries/overview';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OverviewParamsSchema = z.object({
  venue: z.string().default("all"),
  strategy: z.string().default("all"),
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('24h'),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = OverviewParamsSchema.parse(raw);

    const venue = q.venue === 'all' ? undefined : q.venue;
    const strategy = q.strategy === 'all' ? undefined : q.strategy;
    const timeRange = q.range.toUpperCase();
    const filters = strategy ? [strategy] : undefined;
    const { from_ts, to_ts } = timeRangeToTimestamps(timeRange);
    const [
      stats,
      equityCurve,
      strategyLeaderboard,
      venueSplit,
      recentFills,
      rebalanceStatus,
      rebalanceEvents,
    ] = await Promise.all([
      getOverviewStats(timeRange, venue, filters),
      getEquityCurve(timeRange, venue, filters),
      getStrategyLeaderboard(timeRange, venue),
      getVenueSplit(),
      getRecentFills(20),
      getLatestRebalanceStatus(),
      getRebalanceEventsBetween(from_ts, to_ts),
    ]);

    return NextResponse.json({
      ok: true,
      query: q,
      data: {
        stats,
        equityCurve,
        strategyLeaderboard,
        venueSplit,
        recentFills,
        rebalanceStatus,
        rebalanceEvents,
      },
      as_of_ts: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[api/overview] error", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Internal server error", code: err?.code ?? null },
      { status: 500 }
    );
  }
}