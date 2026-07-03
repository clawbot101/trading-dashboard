/**
 * Fills API route.
 * GET: returns paginated fills with filters and totals.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../lib/db';

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
    const q = FillsParamsSchema.parse(raw);

    // TODO replace with real query
    return NextResponse.json({ ok: true, query: q, data: {}, as_of_ts: new Date().toISOString() });
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