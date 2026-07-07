/**
 * Fills API route.
 * Supports both: position-specific fills (symbol param) and paginated fills list (timeRange/page).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRecentFillsForPosition } from '../../../lib/queries/positions';
import { getFills, getFillTotals } from '../../../lib/queries/trades';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Schema for position-specific fills
const PositionFillsSchema = z.object({
  symbol: z.string(),
  strategy: z.string().optional(),
  limit: z.coerce.number().default(10),
});

// Schema for paginated fills list
const PaginatedFillsSchema = z.object({
  timeRange: z.enum(['24H', '7D', '30D', '90D', 'ALL']).default('24H'),
  venue: z.string().default("all"),
  strategy: z.string().default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());

    // Check if this is position-specific (has symbol param)
    if (raw.symbol) {
      const q = PositionFillsSchema.parse(raw);
      const fills = await getRecentFillsForPosition(q.symbol, q.strategy, q.limit);
      return NextResponse.json({
        ok: true,
        query: q,
        data: { fills },
        as_of_ts: new Date().toISOString(),
      });
    }

    // Otherwise, paginated fills list
    const q = PaginatedFillsSchema.parse(raw);
    const venue = q.venue === 'all' ? undefined : q.venue;
    const strategy = q.strategy === 'all' ? undefined : q.strategy;

    const fills = await getFills(q.timeRange, venue, strategy, undefined, undefined, undefined, q.page, q.pageSize);
    const totals = await getFillTotals(q.timeRange, venue, strategy);

    return NextResponse.json({
      ok: true,
      query: q,
      data: { fills, totals },
      as_of_ts: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[api/fills] error", {
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