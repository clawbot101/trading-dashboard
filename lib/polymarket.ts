import { query } from './db';
import { PM_DEFAULT_STRATEGY, type PmStrategyKey } from './polymarket-strategies';

// Read-only views over the Polymarket paper tables written by polymarket-btc5m (pm_db.py).
// pm_paper_*_all union the original BTC 5m tables with the per-strategy v2 tables and carry a
// strategy column. These tables are separate from paper_cycles / paper_equity: Polymarket never
// mixes into the paper books.

export { PM_STRATEGIES, pmStrategyByKey, pmStrategyBySlug } from './polymarket-strategies';
export type { PmStrategy, PmStrategyKey } from './polymarket-strategies';

export const PM_OFFSETS = [-20, -15, -10, -5, -3];
export const PM_VARIANTS = ['taker_L0.2', 'taker_L0.5', 'taker_L1.0', 'maker_a', 'maker_b'] as const;

/** Rounds sent to the page per request: one decision time, at most this many days back. */
export const PM_ROUNDS_DAYS = 30;
const PM_ROUNDS_LIMIT = 10000;
const PM_RECENT_MARKETS = 20;

export type PmStatus = {
  total_markets: number;
  resolved_markets: number;
  markets_24h: number;
  first_t0: number | null;
  last_t0: number | null;
  last_written_at: string | null;
  last_winner: string | null;
  last_status: string | null;
  now_s: number;
};

export type PmSummaryRow = {
  T_offset: number;
  variant: string;
  markets: number;
  traded: number;
  fills: number | null; // filled resolved rounds (n behind per $ and the 90% range)
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
  computed_at: string | null;
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

export type PmMarketRow = {
  t0: number;
  status: string | null;
  winner: string | null;
  pm_msgs: number | null;
  trades: number | null;
  ws_gaps: number | null;
  ref_ticks: number | null;
  written_at: string | null;
};

export async function getPolymarketStatus(strategy: PmStrategyKey = PM_DEFAULT_STRATEGY.key): Promise<PmStatus | null> {
  const rows = await query<any>(
    `
    SELECT COUNT(*)::int AS total_markets,
           COUNT(*) FILTER (WHERE status = 'ok')::int AS resolved_markets,
           COUNT(*) FILTER (WHERE t0 >= EXTRACT(EPOCH FROM now()) - 86400)::int AS markets_24h,
           MIN(t0)::bigint AS first_t0,
           MAX(t0)::bigint AS last_t0,
           (ARRAY_AGG(written_at ORDER BY t0 DESC))[1] AS last_written_at,
           (ARRAY_AGG(winner ORDER BY t0 DESC))[1] AS last_winner,
           (ARRAY_AGG(status ORDER BY t0 DESC))[1] AS last_status,
           EXTRACT(EPOCH FROM now())::bigint AS now_s
    FROM pm_paper_markets_all
    WHERE strategy = $1
  `,
    [strategy]
  );
  const r = rows[0];
  if (!r || Number(r.total_markets) === 0) return null;
  return {
    total_markets: Number(r.total_markets),
    resolved_markets: Number(r.resolved_markets),
    markets_24h: Number(r.markets_24h),
    first_t0: r.first_t0 === null ? null : Number(r.first_t0),
    last_t0: r.last_t0 === null ? null : Number(r.last_t0),
    last_written_at: r.last_written_at ?? null,
    last_winner: r.last_winner ?? null,
    last_status: r.last_status ?? null,
    now_s: Number(r.now_s),
  };
}

/** Cumulative summary per decision time and variant, with the number of filled rounds. */
export async function getPolymarketSummary(strategy: PmStrategyKey = PM_DEFAULT_STRATEGY.key): Promise<PmSummaryRow[]> {
  const [summary, fills] = await Promise.all([
    query<any>(
      `
      SELECT "T_offset", variant, markets, traded, fill_rate, fills_per_day, px_decision, px_fill,
             slippage, hit_rate, pnl_per_usd, pnl_usd, ci90_lo, ci90_hi, computed_at
      FROM pm_paper_summary_all
      WHERE strategy = $1 AND scope = 'all'
      ORDER BY "T_offset", variant
    `,
      [strategy]
    ),
    // Same rows the summary job counts: traded, resolved, and filled (> 0).
    query<any>(
      `
      SELECT "T_offset",
             COUNT(*) FILTER (WHERE "fill_ratio_0.2" > 0)::int AS "taker_L0.2",
             COUNT(*) FILTER (WHERE "fill_ratio_0.5" > 0)::int AS "taker_L0.5",
             COUNT(*) FILTER (WHERE "fill_ratio_1.0" > 0)::int AS "taker_L1.0",
             COUNT(*) FILTER (WHERE filled_usd_a > 0)::int AS maker_a,
             COUNT(*) FILTER (WHERE filled_usd_b > 0)::int AS maker_b
      FROM pm_paper_decisions_all
      WHERE strategy = $1 AND traded AND won IS NOT NULL
      GROUP BY 1
    `,
      [strategy]
    ),
  ]);
  const fillsBy = new Map<number, any>(fills.map((f) => [Number(f.T_offset), f]));
  return summary.map((r) => {
    const f = fillsBy.get(Number(r.T_offset));
    return {
      ...r,
      T_offset: Number(r.T_offset),
      fills: f && f[r.variant] !== undefined ? Number(f[r.variant]) : null,
      computed_at: r.computed_at ? new Date(r.computed_at).toISOString() : null,
    };
  });
}

export async function getPolymarketDaily(strategy: PmStrategyKey = PM_DEFAULT_STRATEGY.key): Promise<PmDailyRow[]> {
  return query<PmDailyRow>(
    `
    SELECT to_char(to_timestamp("t0") AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
           "T_offset",
           COUNT(*) FILTER (WHERE traded AND won IS NOT NULL)::int AS traded,
           COALESCE(SUM("pnl_taker_0.2_usd") FILTER (WHERE traded AND won IS NOT NULL), 0) AS "taker_L0.2",
           COALESCE(SUM("pnl_taker_0.5_usd") FILTER (WHERE traded AND won IS NOT NULL), 0) AS "taker_L0.5",
           COALESCE(SUM("pnl_taker_1.0_usd") FILTER (WHERE traded AND won IS NOT NULL), 0) AS "taker_L1.0",
           COALESCE(SUM("pnl_maker_a_usd") FILTER (WHERE traded AND won IS NOT NULL), 0) AS maker_a,
           COALESCE(SUM("pnl_maker_b_usd") FILTER (WHERE traded AND won IS NOT NULL), 0) AS maker_b
    FROM pm_paper_decisions_all
    WHERE strategy = $1 AND won IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 1, 2
  `,
    [strategy]
  );
}

/**
 * Rounds for one decision time (all decisions, traded or not), oldest first. Bounded to the
 * newest PM_ROUNDS_DAYS days and PM_ROUNDS_LIMIT rows.
 */
export async function getPolymarketRounds(
  strategy: PmStrategyKey = PM_DEFAULT_STRATEGY.key,
  offset = -10
): Promise<PmRoundRow[]> {
  const rows = await query<any>(
    `
    SELECT * FROM (
      SELECT "t0"::bigint AS t0, "T_offset", side, winner, won, gap_bp, traded, skip_reason,
             fav_best_ask AS ask, px_decision_100 AS px_decision,
             "fill_ratio_0.2" AS fr_t02, "px_fill_0.2" AS px_t02,
             "fill_ratio_0.5" AS fr_t05, "px_fill_0.5" AS px_t05,
             "fill_ratio_1.0" AS fr_t10, "px_fill_1.0" AS px_t10,
             maker_bid_a AS bid_a, filled_usd_a AS usd_a,
             maker_bid_b AS bid_b, filled_usd_b AS usd_b,
             "pnl_taker_0.2_usd" AS pnl_t02, "pnl_taker_0.5_usd" AS pnl_t05, "pnl_taker_1.0_usd" AS pnl_t10,
             pnl_maker_a_usd AS pnl_a, pnl_maker_b_usd AS pnl_b
      FROM pm_paper_decisions_all
      WHERE strategy = $1 AND "T_offset" = $2 AND "t0" >= EXTRACT(EPOCH FROM now()) - $3::int * 86400
      ORDER BY "t0" DESC
      LIMIT $4
    ) r
    ORDER BY t0
  `,
    [strategy, offset, PM_ROUNDS_DAYS, PM_ROUNDS_LIMIT]
  );
  return rows.map((r) => ({
    ...r,
    t0: Number(r.t0),
    T_offset: Number(r.T_offset),
    won: r.won === null ? null : Number(r.won),
    traded: Boolean(r.traded),
  }));
}

/** Newest markets with their recording stats (health of the paper run). */
export async function getPolymarketRecentMarkets(strategy: PmStrategyKey = PM_DEFAULT_STRATEGY.key): Promise<PmMarketRow[]> {
  const rows = await query<any>(
    `
    SELECT "t0"::bigint AS t0, status, winner, pm_msgs, trades, ws_gaps, ref_ticks, written_at
    FROM pm_paper_markets_all
    WHERE strategy = $1
    ORDER BY "t0" DESC
    LIMIT $2
  `,
    [strategy, PM_RECENT_MARKETS]
  );
  return rows.map((r) => ({
    ...r,
    t0: Number(r.t0),
    pm_msgs: r.pm_msgs === null ? null : Number(r.pm_msgs),
    trades: r.trades === null ? null : Number(r.trades),
    ws_gaps: r.ws_gaps === null ? null : Number(r.ws_gaps),
    ref_ticks: r.ref_ticks === null ? null : Number(r.ref_ticks),
  }));
}
