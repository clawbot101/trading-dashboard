/**
 * Order Events API route.
 * GET: returns order events grouped by strategy_order_id with lifecycle.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { getOrderEvents } from '../../../lib/queries/trades';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Query params schema with defaults
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
    const params = OrdersParamsSchema.parse(raw);

    // Convert "all" to undefined for queries
    const venue = params.venue === 'all' ? undefined : params.venue;
    const strategy = params.strategy === 'all' ? undefined : params.strategy;

    // Map range to timeRange format
    const timeRange = params.range.toUpperCase();

    // Run query
    const orderEvents = await getOrderEvents(
      timeRange,
      venue,
      strategy,
      params.symbol,
      params.page,
      params.pageSize
    );

    // Build response
    const response = {
      ok: true,
      as_of: new Date().toISOString(),
      page: params.page,
      pageSize: params.pageSize,
      data: {
        orderEvents,
      },
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("[api/orders] error", {
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