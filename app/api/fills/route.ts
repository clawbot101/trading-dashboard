/**
 * Fills API route.
 * GET: returns paginated fills with filters and totals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../lib/db';
import { getFills, getFillTotals, getDistinctStrategies, getDistinctSymbols } from '../../../lib/queries/trades';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Query params schema with defaults
const FillsParamsSchema = z.object({
  venue: z.string().default("all"),
  strategy: z.string().default("all"),
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('24h'),
  symbol: z.string().optional(),
  side: z.enum(['buy', 'sell']).optional(),
  isMaker: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const params = FillsParamsSchema.parse(raw);

    // Convert "all" to undefined for queries
    const venue = params.venue === 'all' ? undefined : params.venue;
    const strategy = params.strategy === 'all' ? undefined : params.strategy;

    // Map range to timeRange format
    const timeRange = params.range.toUpperCase();

    // Run queries sequentially
    const fills = await getFills(
      timeRange,
      venue,
      strategy,
      params.symbol,
      params.side,
      params.isMaker,
      params.page,
      params.pageSize
    );

    const totals = await getFillTotals(
      timeRange,
      venue,
      strategy,
      params.symbol,
      params.side,
      params.isMaker
    );

    // Build response
    const response = {
      ok: true,
      as_of: new Date().toISOString(),
      page: params.page,
      pageSize: params.pageSize,
      data: {
        fills,
        totals,
      },
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("[api/fills] error", {
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

// Separate endpoint for filter options
export async function OPTIONS() {
  try {
    const strategies = await getDistinctStrategies();
    const symbols = await getDistinctSymbols();

    return NextResponse.json({
      ok: true,
      data: {
        strategies,
        symbols,
        venues: ['Hyperliquid', 'Lighter'],
        sides: ['buy', 'sell'],
        isMakerOptions: [true, false],
      },
    });
  } catch (err: any) {
    console.error("[api/fills OPTIONS] error", {
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