import { NextResponse } from 'next/server';
import {
  PM_DESCRIPTION,
  getPolymarketDaily,
  getPolymarketRecent,
  getPolymarketStatus,
  getPolymarketSummary,
} from '../../../lib/polymarket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const [status, summary, daily, recent] = await Promise.all([
      getPolymarketStatus(),
      getPolymarketSummary(),
      getPolymarketDaily(),
      getPolymarketRecent(20),
    ]);
    return NextResponse.json({
      ok: true,
      data: { description: PM_DESCRIPTION, status, summary, daily, recent },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'polymarket data unavailable' },
      { status: 500 }
    );
  }
}
