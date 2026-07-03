/**
 * Overview API route.
 * GET: returns overview stats, equity curve, strategy leaderboard, venue split, PnL attribution, recent fills.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../lib/db';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Query params schema with defaults
const OverviewParamsSchema = z.object({
  venue: z.string().default("all"),
  strategy: z.string().default("all"),
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('24h'),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = OverviewParamsSchema.parse(raw);

    // TODO replace with real query
    return NextResponse.json({ ok: true, query: q, data: {}, as_of_ts: new Date().toISOString() });
  } catch (err: any) {
    console.error("[api/overview] error", {
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