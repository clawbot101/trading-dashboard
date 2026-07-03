/**
 * Order Events API route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrderEvents } from '../../../lib/queries/trades';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OrdersParamsSchema = z.object({
  venue: z.string().default("all"),
  strategy: z.string().default("all"),
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('24h'),
  symbol: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = OrdersParamsSchema.parse(raw);

    const venue = q.venue === 'all' ? undefined : q.venue;
    const strategy = q.strategy === 'all' ? undefined : q.strategy;
    const timeRange = q.range.toUpperCase();

    const orderEvents = await getOrderEvents(timeRange, venue, strategy, q.symbol, q.page, q.pageSize);

    return NextResponse.json({
      ok: true,
      query: q,
      data: { orderEvents },
      as_of_ts: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[api/orders] error", {
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