/**
 * Overview API route.
 * GET: returns overview stats, equity curve, strategy leaderboard, venue split, PnL attribution, recent fills.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../lib/db';
import {
  getOverviewStats,
  getEquityCurve,
  getStrategyLeaderboard,
  getVenueSplit,
  getPnlAttribution,
  getRecentFills,
} from '../../../lib/queries/overview';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Query params schema with defaults
const OverviewParamsSchema = z.object({
  venue: z.string().default("all"),
  strategy: z.string().default("all"),
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('24h'),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const params = OverviewParamsSchema.parse(raw);

    // Convert "all" to undefined for queries
    const venue = params.venue === 'all' ? undefined : params.venue;
    const strategy = params.strategy === 'all' ? undefined : params.strategy;

    // Map range to timeRange format
    const timeRange = params.range.toUpperCase();

    // Build strategy filter array
    const strategies = strategy ? [strategy] : undefined;

    // Run queries sequentially
    const stats = await getOverviewStats(timeRange, venue, strategies);
    const equityCurve = await getEquityCurve(timeRange, venue, strategies);
    const strategyLeaderboard = await getStrategyLeaderboard(timeRange, venue);
    const venueSplit = await getVenueSplit();
    const pnlAttribution = await getPnlAttribution(timeRange, venue, strategies);
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

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("[api/overview] error", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });

    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid parameters', details: err.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Internal server error', code: err?.code ?? null },
      { status: 500 }
    );
  }
}