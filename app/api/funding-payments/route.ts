/**
 * Funding Payments API route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRecentFundingPayments } from '../../../lib/queries/positions';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FundingParamsSchema = z.object({
  limit: z.coerce.number().default(20),
});

export async function GET(req: NextRequest) {
  try {
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = FundingParamsSchema.parse(raw);

    const payments = await getRecentFundingPayments(q.limit);

    // Compute totals
    const totalPayment = payments.reduce((sum: number, p: any) => sum + (Number(p.payment_amount) || 0), 0);
    const last24h = payments.filter((p: any) => {
      const diff = Date.now() - new Date(p.ts).getTime();
      return diff < 24 * 60 * 60 * 1000;
    });
    const last24hPayment = last24h.reduce((sum: number, p: any) => sum + (Number(p.payment_amount) || 0), 0);

    return NextResponse.json({
      ok: true,
      query: q,
      data: { 
        payments,
        totalPayment,
        last24hPayment,
        last24hCount: last24h.length,
      },
      as_of_ts: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[api/funding-payments] error", {
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