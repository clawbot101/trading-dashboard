import { NextResponse } from 'next/server';
import {
  PM_ROUNDS_DAYS,
  PM_STRATEGIES,
  getPolymarketDaily,
  getPolymarketRecentMarkets,
  getPolymarketRounds,
  getPolymarketStatus,
  getPolymarketSummary,
  pmStrategyByKey,
} from '../../../lib/polymarket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/polymarket?strategy=btc_5m&offset=-10 (defaults: btc_5m, -10 s). */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const strategy = pmStrategyByKey(params.get('strategy') ?? PM_STRATEGIES[0].key);
  if (!strategy) {
    return NextResponse.json({ ok: false, error: 'unknown strategy' }, { status: 400 });
  }
  const requested = Number(params.get('offset') ?? -10);
  const offset = strategy.offsets.includes(requested) ? requested : -10;
  try {
    const [status, summary, daily, rounds, markets] = await Promise.all([
      getPolymarketStatus(strategy.key),
      getPolymarketSummary(strategy.key),
      getPolymarketDaily(strategy.key),
      getPolymarketRounds(strategy.key, offset),
      getPolymarketRecentMarkets(strategy.key),
    ]);
    return NextResponse.json({
      ok: true,
      data: { strategy: strategy.key, offset, rounds_days: PM_ROUNDS_DAYS, status, summary, daily, rounds, markets },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'polymarket data unavailable' },
      { status: 500 }
    );
  }
}
