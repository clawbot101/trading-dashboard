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

    const stats = await getOverviewStats(timeRange, venue, strategy ? [strategy] : undefined);
    const equityCurve = await getEquityCurve(timeRange, venue, strategy ? [strategy] : undefined);
    const strategyLeaderboard = await getStrategyLeaderboard(timeRange, venue);
    const venueSplit = await getVenueSplit();
    const recentFills = await getRecentFills(20);
    const rebalanceStatus = await getLatestRebalanceStatus();

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