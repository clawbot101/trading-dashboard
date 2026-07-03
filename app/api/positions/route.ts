/**
 * Live Positions API route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getLivePositions,
  getPositionSummary,
  getAllOpenOrders,
} from '../../../lib/queries/positions';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PositionsParamsSchema = z.object({
  venue: z.string().default("all"),
  strategy: z.string().default("all"),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = PositionsParamsSchema.parse(raw);

    const venue = q.venue === 'all' ? undefined : q.venue;
    const strategy = q.strategy === 'all' ? undefined : q.strategy;

    const positions = await getLivePositions(venue, strategy);
    const summary = await getPositionSummary(venue, strategy);
    const openOrders = await getAllOpenOrders(venue, strategy);

    return NextResponse.json({
      ok: true,
      query: q,
      data: { positions, summary, openOrders },
      as_of_ts: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[api/positions] error", {
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