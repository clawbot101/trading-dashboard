import { query } from './db';

// Read-only views over the pm_paper_* tables written by polymarket-btc5m (pm_db.py).
// These tables are separate from paper_cycles / paper_equity: Polymarket never mixes into the paper books.

export const PM_OFFSETS = [-20, -15, -10, -5, -3];
export const PM_VARIANTS = ['taker_L0.2', 'taker_L0.5', 'taker_L1.0', 'maker_a', 'maker_b'] as const;

export const PM_DESCRIPTION = {
  title: 'Polymarket BTC 5-minute start-price gap (paper)',
  blurb:
    'Observation only, no orders. A new BTC Up/Down market opens every 5 minutes, one round each. Each round, buy the side Binance BTC favours before the start, taker or maker, $100 per round.',
  overview: [
    'Side: BTC mid versus the 60-second average of BTC mid since t0 minus 60 s, measured at t0 minus 20, 15, 10, 5 and 3 seconds. Above the average means Up, below means Down. The Polymarket price never picks the side.',
    'Trade only if the gap is at least 2 bp and the favoured side best ask is at most 0.75. Stake $100 per round and decision time. Rounds run 24/7, 288 a day.',
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

export type PmRoundRow = {
  t0: number;
  T_offset: number;
  side: string | null;
  winner: string | null;
  won: number | null;
  gap_bp: number | null;
  traded: boolean;
  skip_reason: string | null;
  ask: number | null; // best ask on the favoured side at decision time
  px_decision: number | null; // average price to buy $100 at decision time
  fr_t02: number | null; px_t02: number | null; // taker, 0.2 s delay: fill ratio, average fill price
  fr_t05: number | null; px_t05: number | null;
  fr_t10: number | null; px_t10: number | null;
  bid_a: number | null; usd_a: number | null; // maker a: bid price, filled $
  bid_b: number | null; usd_b: number | null;
  pnl_t02: number | null; pnl_t05: number | null; pnl_t10: number | null;
  pnl_a: number | null; pnl_b: number | null;
};

/** One row per round and decision time (all decisions, traded or not), oldest first. */
export async function getPolymarketRounds(): Promise<PmRoundRow[]> {
  const rows = await query<any>(`
    SELECT "t0"::bigint AS t0, "T_offset", side, winner, won, gap_bp, traded, skip_reason,
           fav_best_ask AS ask, px_decision_100 AS px_decision,
           "fill_ratio_0.2" AS fr_t02, "px_fill_0.2" AS px_t02,
           "fill_ratio_0.5" AS fr_t05, "px_fill_0.5" AS px_t05,
           "fill_ratio_1.0" AS fr_t10, "px_fill_1.0" AS px_t10,
           maker_bid_a AS bid_a, filled_usd_a AS usd_a,
           maker_bid_b AS bid_b, filled_usd_b AS usd_b,
           "pnl_taker_0.2_usd" AS pnl_t02, "pnl_taker_0.5_usd" AS pnl_t05, "pnl_taker_1.0_usd" AS pnl_t10,
           pnl_maker_a_usd AS pnl_a, pnl_maker_b_usd AS pnl_b
    FROM pm_paper_decisions
    ORDER BY "t0", "T_offset"
  `);
  return rows.map((r) => ({
    ...r,
    t0: Number(r.t0),
    T_offset: Number(r.T_offset),
    won: r.won === null ? null : Number(r.won),
    traded: Boolean(r.traded),
  }));
}
