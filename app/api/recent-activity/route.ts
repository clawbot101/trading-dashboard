/**
 * Recent Activity API route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRecentActivityPage } from '../../../lib/queries/overview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  tab: z.enum(['all', 'fills', 'rebalance']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = ParamsSchema.parse(raw);

    const result = await getRecentActivityPage(q.tab, q.page, q.pageSize);

    return NextResponse.json({
      ok: true,
      query: q,
      data: result,
      as_of_ts: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[api/recent-activity] error', {
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

