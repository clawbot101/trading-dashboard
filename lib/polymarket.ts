import { query } from './db';

// Read-only views over the pm_paper_* tables written by polymarket-btc5m (pm_db.py).
// These tables are separate from paper_cycles / paper_equity: Polymarket never mixes into the paper books.

export const PM_OFFSETS = [-20, -15, -10, -5, -3];
export const PM_VARIANTS = ['taker_L0.2', 'taker_L0.5', 'taker_L1.0', 'maker_a', 'maker_b'] as const;

export const PM_DESCRIPTION = {
  title: 'Polymarket BTC 5-minute start-price gap (paper)',
  blurb:
    'Observation only, no orders. Each 5-minute BTC market, buy the side Binance BTC favours before the start, taker or maker, $100 per market.',
  overview: [
    'Side: BTC mid versus the 60-second average of BTC mid since t0 minus 60 s, measured at t0 minus 20, 15, 10, 5 and 3 seconds. Above the average means Up, below means Down. The Polymarket price never picks the side.',
    'Trade only if the gap is at least 2 bp and the favoured side best ask is at most 0.75. Stake $100 per market and decision time. Markets run 24/7, 288 a day.',
    'Taker: buy at the decision-time ask, after a 0.2, 0.5 or 1.0 second delay, limit 0.01 above the decision average price. Maker: rest a bid on the favoured side (a: join best bid, cancel at t0; b: cancel at t0 plus 5 s). Filled from real trades, queue-aware.',
    'Fees: taker 0.05 times (1 - p) per $, maker 0 (rebate ignored). Outcome from the Chainlink TWAP settlement (btc-5m-twap-60), resolved by Polymarket.',
    'Decision rule after 14 days (made by a person): taker 0.5 s at -10 s with at least +3% per $ and at least 60% fill, or maker with at least +3% per $ and at least 30 fills a day. History for comparison: about +5% at -10 s, +8% at -5 s.',
  ],
};

export type PmStatus = {
  total_markets: number;
  resolved_markets: number;
  first_t0: number | null;
  last_t0: number | null;
  last_written_at: string | null;
  last_winner: string | null;
};

export type PmSummaryRow = {
  T_offset: number;
  variant: string;
  markets: number;
  traded: number;
  fill_rate: number | null;
  fills_per_day: number | null;
  px_decision: number | null;
  px_fill: number | null;
  slippage: number | null;
  hit_rate: number | null;
  pnl_per_usd: number | null;
  pnl_usd: number | null;
  ci90_lo: number | null;
  ci90_hi: number | null;
};

export type PmDailyRow = {
  day: string;
  T_offset: number;
  traded: number;
  'taker_L0.2': number;
  'taker_L0.5': number;
  'taker_L1.0': number;
  maker_a: number;
  maker_b: number;
};

export type PmRecentRow = {
  t0: number;
  winner: string | null;
  status: string;
  side: string | null;
  gap_bp: number | null;
  traded: boolean | null;
  skip_reason: string | null;
  fav_best_ask: number | null;
  px_fill_0_5: number | null;
  pnl_taker_0_5_usd: number | null;
  pnl_maker_b_usd: number | null;
  filled_usd_b: number | null;
};

export async function getPolymarketStatus(): Promise<PmStatus | null> {
  const rows = await query<any>(`
    SELECT COUNT(*)::int AS total_markets,
           COUNT(*) FILTER (WHERE status = 'ok')::int AS resolved_markets,
           MIN(t0)::bigint AS first_t0,
           MAX(t0)::bigint AS last_t0,
           (ARRAY_AGG(written_at ORDER BY t0 DESC))[1] AS last_written_at,
           (ARRAY_AGG(winner ORDER BY t0 DESC))[1] AS last_winner
    FROM pm_paper_markets
  `);
  const r = rows[0];
  if (!r || Number(r.total_markets) === 0) return null;
  return {
    total_markets: Number(r.total_markets),
    resolved_markets: Number(r.resolved_markets),
    first_t0: r.first_t0 === null ? null : Number(r.first_t0),
    last_t0: r.last_t0 === null ? null : Number(r.last_t0),
    last_written_at: r.last_written_at ?? null,
    last_winner: r.last_winner ?? null,
  };
}

export async function getPolymarketSummary(): Promise<PmSummaryRow[]> {
  return query<PmSummaryRow>(`
    SELECT "T_offset", variant, markets, traded, fill_rate, fills_per_day, px_decision, px_fill,
           slippage, hit_rate, pnl_per_usd, pnl_usd, ci90_lo, ci90_hi
    FROM pm_paper_summary
    WHERE scope = 'all'
    ORDER BY "T_offset", variant
  `);
}

export async function getPolymarketDaily(): Promise<PmDailyRow[]> {
  return query<PmDailyRow>(`
    SELECT to_char(to_timestamp("t0") AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
           "T_offset",
           COUNT(*) FILTER (WHERE traded AND won IS NOT NULL)::int AS traded,
           COALESCE(SUM("pnl_taker_0.2_usd") FILTER (WHERE traded AND won IS NOT NULL), 0) AS "taker_L0.2",
           COALESCE(SUM("pnl_taker_0.5_usd") FILTER (WHERE traded AND won IS NOT NULL), 0) AS "taker_L0.5",
           COALESCE(SUM("pnl_taker_1.0_usd") FILTER (WHERE traded AND won IS NOT NULL), 0) AS "taker_L1.0",
           COALESCE(SUM("pnl_maker_a_usd") FILTER (WHERE traded AND won IS NOT NULL), 0) AS maker_a,
           COALESCE(SUM("pnl_maker_b_usd") FILTER (WHERE traded AND won IS NOT NULL), 0) AS maker_b
    FROM pm_paper_decisions
    WHERE won IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);
}

export async function getPolymarketRecent(limit = 20): Promise<PmRecentRow[]> {
  return query<PmRecentRow>(
    `
    SELECT m.t0, m.winner, m.status, d.side, d.gap_bp, d.traded, d.skip_reason,
           d.fav_best_ask, d."px_fill_0.5" AS px_fill_0_5,
           d."pnl_taker_0.5_usd" AS pnl_taker_0_5_usd,
           d.pnl_maker_b_usd AS pnl_maker_b_usd,
           d.filled_usd_b AS filled_usd_b
    FROM pm_paper_markets m
    LEFT JOIN pm_paper_decisions d ON d.t0 = m.t0 AND d."T_offset" = -10
    ORDER BY m.t0 DESC
    LIMIT $1
    `,
    [limit]
  );
}
