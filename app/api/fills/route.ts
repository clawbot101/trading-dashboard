/**
 * Fills API route for expanded position rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRecentFillsForPosition } from '../../../lib/queries/positions';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FillsParamsSchema = z.object({
  symbol: z.string(),
  strategy: z.string().optional(),
  limit: z.coerce.number().default(10),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = FillsParamsSchema.parse(raw);

    const fills = await getRecentFillsForPosition(q.symbol, q.strategy, q.limit);

    return NextResponse.json({
      ok: true,
      query: q,
      data: { fills },
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