/**
 * Fills API route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFills, getFillCount, getFillTotals, timeRangeToTimestamps } from '../../../lib/queries/trades';
import { cached } from '../../../lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_TTL_MS = 30_000;

const FillsParamsSchema = z.object({
  timeRange: z.enum(['24H', '7D', '30D', '90D', 'ALL']).default('ALL'),
  venue: z.string().default('all'),
  strategy: z.string().default('all'),
  symbol: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = FillsParamsSchema.parse(raw);

    const { from_ts, to_ts } = timeRangeToTimestamps(q.timeRange);
    const venue = q.venue === 'all' ? undefined : q.venue;
    const strategy = q.strategy === 'all' ? undefined : q.strategy;

    const cacheKey = `fills:${q.timeRange}:${venue ?? 'all'}:${strategy ?? 'all'}:${q.symbol ?? 'all'}:${q.page}:${q.pageSize}`;
    const [fills, totalRows, totals] = await cached(cacheKey, CACHE_TTL_MS, () =>
      Promise.all([
        getFills(from_ts, to_ts, venue, strategy, q.symbol, q.page, q.pageSize),
        getFillCount(from_ts, to_ts, venue, strategy, q.symbol),
        getFillTotals(from_ts, to_ts, venue, strategy, q.symbol),
      ])
    );

    return NextResponse.json(
      {
        ok: true,
        query: q,
        data: { fills, totals, totalRows },
        as_of_ts: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
        },
      }
    );
  } catch (err: any) {
    console.error('[api/fills] error', {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Internal server error', code: err?.code ?? null },
      { status: 500 }
    );
  }
}