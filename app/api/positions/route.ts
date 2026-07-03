/**
 * Live Positions API route.
 * GET: returns live positions, summary, and open orders.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../lib/db';
import {
  getLivePositions,
  getPositionSummary,
  getAllOpenOrders,
} from '../../../lib/queries/positions';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Query params schema with defaults
const PositionsParamsSchema = z.object({
  venue: z.string().default("all"),
  strategy: z.string().default("all"),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const params = PositionsParamsSchema.parse(raw);

    // Convert "all" to undefined for queries
    const venue = params.venue === 'all' ? undefined : params.venue;
    const strategy = params.strategy === 'all' ? undefined : params.strategy;

    // Run queries sequentially
    const positions = await getLivePositions(venue, strategy);
    const summary = await getPositionSummary(venue, strategy);
    const openOrders = await getAllOpenOrders(venue, strategy);

    // Build response
    const response = {
      ok: true,
      as_of: new Date().toISOString(),
      data: {
        positions,
        summary,
        openOrders,
      },
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("[api/positions] error", {
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