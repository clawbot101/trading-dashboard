/**
 * Recent Activity API route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRecentActivityPage } from '../../../lib/queries/overview';
import { cached } from '../../../lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_TTL_MS = 30_000;

const ParamsSchema = z.object({
  tab: z.enum(['all', 'fills', 'rebalance']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = ParamsSchema.parse(raw);

    const cacheKey = `recent-activity:${q.tab}:${q.page}:${q.pageSize}`;
    const result = await cached(cacheKey, CACHE_TTL_MS, () =>
      getRecentActivityPage(q.tab, q.page, q.pageSize)
    );

    return NextResponse.json(
      {
        ok: true,
        query: q,
        data: result,
        as_of_ts: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
        },
      }
    );
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

