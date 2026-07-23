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
  getCashFlowEvents,
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
    const [
      stats,
      equityCurve,
      strategyLeaderboard,
      venueSplit,
      recentFills,
      rebalanceStatus,
    ] = await Promise.all([
      getOverviewStats(timeRange, venue, filters),
      getEquityCurve(timeRange, venue, filters),
      getStrategyLeaderboard(timeRange, venue),
      getVenueSplit(),
      getRecentFills(20),
      getLatestRebalanceStatus(),
    ]);
    const cashFlowStartTs =
      timeRange === 'ALL'
        ? stats?.initial_equity_ts ?? equityCurve?.[0]?.ts ?? '2000-01-01T00:00:00Z'
        : equityCurve?.[0]?.ts ?? stats?.initial_equity_ts ?? '2000-01-01T00:00:00Z';
    const cashFlowEndTs = equityCurve?.[equityCurve.length - 1]?.ts ?? new Date().toISOString();
    const cashFlowEvents = await getCashFlowEvents(cashFlowStartTs, cashFlowEndTs, venue, filters);

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
        cashFlowEvents,
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