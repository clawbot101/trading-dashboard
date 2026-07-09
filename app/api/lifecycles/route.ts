/**
 * Position Lifecycles API endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPositionLifecycles, getLifecycleTotals } from '../../../lib/queries/lifecycles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LifecyclesParamsSchema = z.object({
  timeRange: z.enum(['24H', '7D', '30D', '90D', 'ALL']).default('ALL'),
  venue: z.string().default('all'),
  strategy: z.string().default('all'),
  symbol: z.string().optional(),
  status: z.enum(['OPEN', 'CLOSED', 'ALL']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = LifecyclesParamsSchema.parse(raw);

    const venue = q.venue === 'all' ? undefined : q.venue;
    const strategy = q.strategy === 'all' ? undefined : q.strategy;

    const lifecycles = await getPositionLifecycles(
      q.timeRange,
      venue,
      strategy,
      q.symbol,
      q.status
    );
    const totals = await getLifecycleTotals(q.timeRange);

    return NextResponse.json({
      ok: true,
      query: q,
      data: { lifecycles, totals },
      as_of_ts: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[api/lifecycles] error', {
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
