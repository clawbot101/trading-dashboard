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
  timeRangeToTimestamps,
} from '../../../lib/queries/overview';
import { alignCashFlowsToEquityCatchUp } from '../../../lib/pnlCurve';
import { cached } from '../../../lib/cache';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// These aggregates run against a single-CPU database; the default 10s ceiling cut
// them off mid-flight, which is what surfaced in the browser as a connection error.
export const maxDuration = 60;

/** Snapshots are written every 5 minutes, so a 30s cache costs no real freshness. */
const CACHE_TTL_MS = 30_000;

/**
 * Selectable sections. Only `stats` and `curve` depend on the selected strategy;
 * the rest are identical whatever is selected. Letting callers ask for just the
 * sections they render means switching strategy no longer recomputes the shared
 * ones, and the header no longer pulls an entire overview to show two numbers.
 */
const ALL_PARTS = ['stats', 'curve', 'leaderboard', 'venue', 'fills', 'rebalance'] as const;
type Part = (typeof ALL_PARTS)[number];

const OverviewParamsSchema = z.object({
  venue: z.string().default("all"),
  strategy: z.string().default("all"),
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('24h'),
  // Omitted means every section, so existing callers are unaffected.
  parts: z.string().optional(),
});

function parseParts(raw?: string): Part[] {
  if (!raw) return [...ALL_PARTS];
  const requested = new Set(raw.split(',').map((p) => p.trim()));
  const selected = ALL_PARTS.filter((p) => requested.has(p));
  return selected.length ? selected : [...ALL_PARTS];
}

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = OverviewParamsSchema.parse(raw);

    const venue = q.venue === 'all' ? undefined : q.venue;
    const strategy = q.strategy === 'all' ? undefined : q.strategy;
    const timeRange = q.range.toUpperCase();
    const filters = strategy ? [strategy] : undefined;
    const { from_ts, to_ts } = timeRangeToTimestamps(timeRange);
    const parts = parseParts(q.parts);
    const want = (p: Part) => parts.includes(p);

    // Strategy only affects stats/curve, so the key drops it for requests that ask
    // for neither. That is what makes switching strategy reuse the shared sections.
    const strategyScope = want('stats') || want('curve') ? (strategy ?? 'all') : 'n/a';
    const cacheKey = `overview:${timeRange}:${venue ?? 'all'}:${strategyScope}:${parts.join(',')}`;

    const loadCurve = async () => {
      const [equityCurve, cashFlowEventsRaw] = await Promise.all([
        getEquityCurve(timeRange, venue, filters),
        getCashFlowEvents(from_ts, to_ts, venue, filters),
      ]);
      // Align offline deposits onto equity catch-up jumps before the client
      // charts them. Otherwise PnL dips ~-$deposit until the bot resumes
      // (classic 30D -$10k spike), and stale browser bundles that skip client
      // alignment still render the valley.
      return {
        equityCurve,
        cashFlowEvents: alignCashFlowsToEquityCatchUp(equityCurve ?? [], cashFlowEventsRaw ?? []),
      };
    };

    const data = await cached(cacheKey, CACHE_TTL_MS, async () => {
      const [stats, curve, strategyLeaderboard, venueSplit, recentFills, rebalanceStatus] =
        await Promise.all([
          want('stats') ? getOverviewStats(timeRange, venue, filters) : undefined,
          want('curve') ? loadCurve() : undefined,
          want('leaderboard') ? getStrategyLeaderboard(timeRange, venue) : undefined,
          want('venue') ? getVenueSplit() : undefined,
          want('fills') ? getRecentFills(20) : undefined,
          want('rebalance') ? getLatestRebalanceStatus() : undefined,
        ]);

      const out: Record<string, unknown> = {};
      if (want('stats')) out.stats = stats;
      if (want('curve')) {
        out.equityCurve = curve?.equityCurve;
        out.cashFlowEvents = curve?.cashFlowEvents;
      }
      if (want('leaderboard')) out.strategyLeaderboard = strategyLeaderboard;
      if (want('venue')) out.venueSplit = venueSplit;
      if (want('fills')) out.recentFills = recentFills;
      if (want('rebalance')) out.rebalanceStatus = rebalanceStatus;
      return out;
    });

    return NextResponse.json(
      {
        ok: true,
        query: q,
        data,
        as_of_ts: new Date().toISOString(),
      },
      {
        headers: {
          // Let the CDN absorb polling from every open tab so the database sees
          // at most one recomputation per window.
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
        },
      }
    );
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