import { NextResponse } from 'next/server';
import {
  PM_DESCRIPTION,
  getPolymarketDaily,
  getPolymarketRounds,
  getPolymarketStatus,
  getPolymarketSummary,
} from '../../../lib/polymarket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const [status, summary, daily, rounds] = await Promise.all([
      getPolymarketStatus(),
      getPolymarketSummary(),
      getPolymarketDaily(),
      getPolymarketRounds(),
    ]);
    return NextResponse.json({
      ok: true,
      data: { description: PM_DESCRIPTION, status, summary, daily, rounds },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'polymarket data unavailable' },
      { status: 500 }
    );
  }
}
