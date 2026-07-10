/**
 * Position lifecycles API route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getPositionLifecycles,
  getPositionLifecycleCount,
  timeRangeToTimestamps,
} from '../../../lib/queries/trades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PositionLifecyclesParamsSchema = z.object({
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
    const q = PositionLifecyclesParamsSchema.parse(raw);

    const { from_ts, to_ts } = timeRangeToTimestamps(q.timeRange);
    const venue = q.venue === 'all' ? undefined : q.venue;
    const strategy = q.strategy === 'all' ? undefined : q.strategy;

    const lifecycles = await getPositionLifecycles(
      from_ts,
      to_ts,
      venue,
      strategy,
      q.symbol,
      q.page,
      q.pageSize
    );
    const totalRows = await getPositionLifecycleCount(from_ts, to_ts, venue, strategy, q.symbol);

    return NextResponse.json({
      ok: true,
      query: q,
      data: { lifecycles, totalRows },
      as_of_ts: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[api/position-lifecycles] error', {
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
