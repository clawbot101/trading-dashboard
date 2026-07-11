/**
 * SQL queries for the Overview page.
 *
 * PnL rules:
 * - Top-level net PnL is always computed from equity snapshots:
 *   net_pnl(t0, t1) = equity(t1) - equity(t0)
 * - Funding is treated as cumulative snapshots, so period funding uses deltas.
 */

import { query, queryOne } from '../db';

export interface OverviewStats {
  total_equity: number;
  pnl_24h: number;
  pnl_24h_pct: number;
  total_unrealized_pnl: number;
  total_realized_pnl: number;
  total_funding: number;
  total_margin: number;
  max_drawdown_pct: number;
  open_positions: number;
  gross_exposure: number;
  equity_24h_ago: number;
  initial_equity: number;
  initial_equity_ts: string | null;
  cash_flow_period: number;
}

export interface EquityCurvePoint {
  ts: string;
  equity: number;
}

export interface StrategyLeaderboardRow {
  strategy_name: string;
  status: string;
  pnl: number;
  return_pct: number;
  latest_equity: number;
  notional: number;
}

export interface VenueSplitRow {
  venue: string;
  equity: number;
  pnl: number;
}

export interface RecentFill {
  ts: string;
  strategy_name: string;
  venue: string;
  symbol: string;
  side: string;
  fill_qty: number;
  fill_price: number;
  fee: number | null;
}

export interface RebalanceStatus {
  rebalance_ts: string;
  window_end_ts: string;
  fill_count: number;
  same_position: boolean;
}

export interface RebalanceEvent {
  rebalance_ts: string;
  fill_count: number;
  same_position: boolean;
}

export interface CashFlowEvent {
  ts: string;
  amount: number;
}

interface QueryFilters {
  venue?: string;
  strategies?: string[];
}

function isAllValue(value?: string): boolean {
  return !value || value.toLowerCase() === 'all';
}

function normalizeStrategies(strategies?: string[]): string[] | undefined {
  if (!strategies?.length) return undefined;
  const cleaned = strategies
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s) && s.toLowerCase() !== 'all');
  return cleaned.length ? cleaned : undefined;
}

function buildFilters(
  startIndex: number,
  options: QueryFilters,
  withSessionJoin: boolean,
  tableAlias: string
): { clauses: string[]; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];
  let idx = startIndex;

  if (!isAllValue(options.venue)) {
    clauses.push(`${tableAlias}.venue = $${idx++}`);
    params.push(options.venue);
  }

  const strategies = normalizeStrategies(options.strategies);
  if (withSessionJoin && strategies?.length) {
    clauses.push(`sess.strategy_name = ANY($${idx++}::text[])`);
    params.push(strategies);
  }

  return { clauses, params };
}

export function timeRangeToInterval(range: string): string {
  switch (range) {
    case '24H': return '24 hours';
    case '7D': return '7 days';
    case '30D': return '30 days';
    case '90D': return '90 days';
    case 'ALL': return '1000 days';
    default: return '24 hours';
  }
}

export function timeRangeToTimestamps(range: string): { from_ts: string; to_ts: string } {
  const now = new Date();
  let from_ts: Date;
  
  switch (range) {
    case '24H':
      from_ts = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7D':
      from_ts = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30D':
      from_ts = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90D':
      from_ts = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'ALL':
    default:
      from_ts = new Date('2000-01-01T00:00:00Z');
      break;
  }
  
  return {
    from_ts: from_ts.toISOString(),
    to_ts: now.toISOString(),
  };
}

/**
 * Get overview stats from equity_snapshots (source of truth for Net PnL).
 * Net PnL = equity(t1) - equity(t0)
 */
export async function getOverviewStats(
  timeRange = '24H',
  venue?: string,
  strategies?: string[]
): Promise<OverviewStats | null> {
  const { from_ts, to_ts } = timeRangeToTimestamps(timeRange);
  const options: QueryFilters = { venue, strategies };

  const eqFilters = buildFilters(3, options, true, 'e');
  const eqWhere = eqFilters.clauses.length ? `WHERE ${eqFilters.clauses.join(' AND ')}` : '';

  // Top-level net PnL strictly from equity snapshots:
  // net_pnl(t0, t1) = equity(t1) - equity(t0)
  const equityRow = await queryOne<any>(
    `
      WITH equity_by_key AS (
        SELECT
          e.ts,
          COALESCE(sess.strategy_name, 'unknown') AS strategy_name,
          COALESCE(e.venue, 'unknown') AS venue,
          MAX(e.equity) AS equity
        FROM equity_snapshots e
        LEFT JOIN trading_sessions sess ON e.session_id = sess.session_id
        ${eqWhere}
        GROUP BY e.ts, COALESCE(sess.strategy_name, 'unknown'), COALESCE(e.venue, 'unknown')
      ),
      equity_by_ts AS (
        SELECT ts, SUM(equity) AS total_equity
        FROM equity_by_key
        GROUP BY ts
      ),
      latest_point AS (
        SELECT ts, total_equity
        FROM equity_by_ts
        WHERE ts <= $1
        ORDER BY ts DESC
        LIMIT 1
      ),
      baseline_point AS (
        SELECT ts, total_equity
        FROM equity_by_ts
        WHERE ts <= $2
        ORDER BY ts DESC
        LIMIT 1
      ),
      first_point AS (
        SELECT ts, total_equity
        FROM equity_by_ts
        ORDER BY ts ASC
        LIMIT 1
      )
      SELECT
        COALESCE((SELECT total_equity FROM latest_point), (SELECT total_equity FROM first_point), 0) AS total_equity,
        (SELECT ts FROM first_point) AS initial_equity_ts,
        COALESCE((SELECT total_equity FROM first_point), 0) AS initial_equity,
        COALESCE(
          (SELECT total_equity FROM baseline_point),
          (SELECT total_equity FROM first_point),
          COALESCE((SELECT total_equity FROM latest_point), 0)
        ) AS equity_period_ago
    `,
    [to_ts, from_ts, ...eqFilters.params]
  );

  const stateFilters = buildFilters(1, options, false, 'ts');
  const stateWhereExtra = stateFilters.clauses.length ? `AND ${stateFilters.clauses.join(' AND ')}` : '';
  const strategiesFilter = normalizeStrategies(strategies);
  const strategyClause = strategiesFilter?.length
    ? `AND ts.strategy_name = ANY($${stateFilters.params.length + 1}::text[])`
    : '';
  const stateParams = strategiesFilter?.length
    ? [...stateFilters.params, strategiesFilter]
    : stateFilters.params;

  const stateRow = await queryOne<any>(
    `
      SELECT
        COALESCE(SUM(ts.unrealized_pnl), 0) AS total_unrealized_pnl,
        COALESCE(SUM(ts.realized_pnl), 0) AS total_realized_pnl,
        COALESCE(SUM(ts.margin), 0) AS total_margin,
        COUNT(*) FILTER (WHERE ts.position_qty != 0) AS open_positions,
        COALESCE(
          SUM(
            CASE
              WHEN ts.position_qty != 0 THEN COALESCE(ts.position_notional_usd, ABS(ts.position_qty * COALESCE(ts.mark_price, ts.avg_entry_price, 0)))
              ELSE 0
            END
          ),
          0
        ) AS gross_exposure
      FROM trading_state ts
      WHERE 1=1
      ${stateWhereExtra}
      ${strategyClause}
    `,
    stateParams
  );

  const fundingDelta = await getFundingDelta(from_ts, to_ts, venue, strategies);
  const cashFlowPeriod = await getCashFlowDelta(from_ts, to_ts, venue, strategies);

  const equityNow = Number(equityRow?.total_equity ?? 0);
  const initialEquity = Number(equityRow?.initial_equity ?? equityNow);
  const equityPeriodAgo = Number(equityRow?.equity_period_ago ?? equityNow);
  const pnlPeriod = equityNow - equityPeriodAgo - cashFlowPeriod;
  const pnlPeriodPct = equityPeriodAgo !== 0 ? (pnlPeriod / equityPeriodAgo) * 100 : 0;

  return {
    total_equity: equityNow,
    pnl_24h: pnlPeriod,
    pnl_24h_pct: pnlPeriodPct,
    total_unrealized_pnl: Number(stateRow?.total_unrealized_pnl ?? 0),
    total_realized_pnl: Number(stateRow?.total_realized_pnl ?? 0),
    total_funding: fundingDelta,
    total_margin: Number(stateRow?.total_margin ?? 0),
    max_drawdown_pct: 0,
    open_positions: Number(stateRow?.open_positions ?? 0),
    gross_exposure: Number(stateRow?.gross_exposure ?? 0),
    equity_24h_ago: equityPeriodAgo,
    initial_equity: initialEquity,
    initial_equity_ts: equityRow?.initial_equity_ts ?? null,
    cash_flow_period: cashFlowPeriod,
  };
}

/**
 * Get equity curve.
 */
export async function getEquityCurve(
  timeRange = '24H',
  venue?: string,
  strategies?: string[]
): Promise<EquityCurvePoint[]> {
  const { from_ts, to_ts } = timeRangeToTimestamps(timeRange);
  const options: QueryFilters = { venue, strategies };
  const eqFilters = buildFilters(3, options, true, 'e');
  const clauses = [...eqFilters.clauses, 'e.ts >= $2', 'e.ts <= $1'];
  const where = `WHERE ${clauses.join(' AND ')}`;

  const rows = await query<EquityCurvePoint>(
    `
      WITH equity_by_key AS (
        SELECT
          e.ts,
          COALESCE(sess.strategy_name, 'unknown') AS strategy_name,
          COALESCE(e.venue, 'unknown') AS venue,
          MAX(e.equity) AS equity
        FROM equity_snapshots e
        LEFT JOIN trading_sessions sess ON e.session_id = sess.session_id
        ${where}
        GROUP BY e.ts, COALESCE(sess.strategy_name, 'unknown'), COALESCE(e.venue, 'unknown')
      ),
      equity_by_ts AS (
        SELECT ts, SUM(equity) AS equity
        FROM equity_by_key
        GROUP BY ts
      ),
      latest_window AS (
        SELECT ts, equity
        FROM equity_by_ts
        ORDER BY ts DESC
        LIMIT 500
      )
      SELECT ts, equity
      FROM latest_window
      ORDER BY ts ASC
    `,
    [to_ts, from_ts, ...eqFilters.params]
  );

  if (rows.length > 0 || timeRange === 'ALL') return rows;

  // Fallback for stale data: show the latest points even if outside requested range.
  return query<EquityCurvePoint>(
    `
      WITH equity_by_key AS (
        SELECT
          e.ts,
          COALESCE(sess.strategy_name, 'unknown') AS strategy_name,
          COALESCE(e.venue, 'unknown') AS venue,
          MAX(e.equity) AS equity
        FROM equity_snapshots e
        LEFT JOIN trading_sessions sess ON e.session_id = sess.session_id
        ${eqFilters.clauses.length ? `WHERE ${eqFilters.clauses.join(' AND ')}` : ''}
        GROUP BY e.ts, COALESCE(sess.strategy_name, 'unknown'), COALESCE(e.venue, 'unknown')
      )
      SELECT ts, SUM(equity) AS equity
      FROM equity_by_key
      GROUP BY ts
      ORDER BY ts DESC
      LIMIT 500
    `,
    eqFilters.params
  ).then((latestRows) => latestRows.reverse());
}

/**
 * Strategy leaderboard.
 */
export async function getStrategyLeaderboard(
  timeRange = '24H',
  venue?: string
): Promise<StrategyLeaderboardRow[]> {
  const { from_ts, to_ts } = timeRangeToTimestamps(timeRange);
  const options: QueryFilters = { venue };
  const eqFilters = buildFilters(3, options, true, 'e');
  const eqWhere = eqFilters.clauses.length ? `WHERE ${eqFilters.clauses.join(' AND ')}` : '';

  const rows = await query<any>(
    `
      WITH equity_by_key AS (
        SELECT
          COALESCE(sess.strategy_name, 'unknown') AS strategy_name,
          COALESCE(e.venue, 'unknown') AS venue,
          e.ts,
          MAX(e.equity) AS equity
        FROM equity_snapshots e
        LEFT JOIN trading_sessions sess ON e.session_id = sess.session_id
        ${eqWhere}
        GROUP BY COALESCE(sess.strategy_name, 'unknown'), COALESCE(e.venue, 'unknown'), e.ts
      ),
      strategy_equity AS (
        SELECT strategy_name, ts, SUM(equity) AS total_equity
        FROM equity_by_key
        GROUP BY strategy_name, ts
      ),
      latest AS (
        SELECT DISTINCT ON (strategy_name)
          strategy_name,
          total_equity AS latest_equity
        FROM strategy_equity
        WHERE ts <= $1
        ORDER BY strategy_name, ts DESC
      ),
      baseline AS (
        SELECT DISTINCT ON (strategy_name)
          strategy_name,
          total_equity AS baseline_equity
        FROM strategy_equity
        WHERE ts <= $2
        ORDER BY strategy_name, ts DESC
      ),
      first_equity AS (
        SELECT DISTINCT ON (strategy_name)
          strategy_name,
          total_equity AS first_equity
        FROM strategy_equity
        ORDER BY strategy_name, ts ASC
      ),
      state_notional AS (
        SELECT
          ts.strategy_name,
          COALESCE(SUM(COALESCE(ts.position_notional_usd, ABS(ts.position_qty * COALESCE(ts.mark_price, ts.avg_entry_price, 0)))), 0) AS notional
        FROM trading_state ts
        WHERE ts.position_qty != 0
        GROUP BY ts.strategy_name
      )
      SELECT
        l.strategy_name,
        'running' AS status,
        (l.latest_equity - COALESCE(b.baseline_equity, f.first_equity, l.latest_equity)) AS pnl,
        l.latest_equity,
        COALESCE(n.notional, 0) AS notional
      FROM latest l
      LEFT JOIN baseline b ON b.strategy_name = l.strategy_name
      LEFT JOIN first_equity f ON f.strategy_name = l.strategy_name
      LEFT JOIN state_notional n ON n.strategy_name = l.strategy_name
      ORDER BY pnl DESC
      LIMIT 10
    `,
    [to_ts, from_ts, ...eqFilters.params]
  );

  return rows.map(r => ({
    strategy_name: r.strategy_name,
    status: r.status || 'unknown',
    pnl: Number(r.pnl) || 0,
    return_pct: Number(r.latest_equity) > 0 ? (Number(r.pnl) / Number(r.latest_equity)) * 100 : 0,
    latest_equity: Number(r.latest_equity) || 0,
    notional: Number(r.notional) || 0,
  }));
}

/**
 * Venue split.
 */
export async function getVenueSplit(): Promise<VenueSplitRow[]> {
  const rows = await query<VenueSplitRow>(
    `
      WITH equity_by_key AS (
        SELECT
          COALESCE(e.venue, 'unknown') AS venue,
          COALESCE(sess.strategy_name, 'unknown') AS strategy_name,
          e.ts,
          MAX(e.equity) AS equity
        FROM equity_snapshots e
        LEFT JOIN trading_sessions sess ON e.session_id = sess.session_id
        GROUP BY COALESCE(e.venue, 'unknown'), COALESCE(sess.strategy_name, 'unknown'), e.ts
      ),
      venue_equity AS (
        SELECT venue, ts, SUM(equity) AS total_equity
        FROM equity_by_key
        GROUP BY venue, ts
      ),
      latest AS (
        SELECT DISTINCT ON (venue) venue, total_equity
        FROM venue_equity
        ORDER BY venue, ts DESC
      ),
      prior AS (
        SELECT DISTINCT ON (venue) venue, total_equity
        FROM venue_equity
        WHERE ts <= NOW() - INTERVAL '24 hours'
        ORDER BY venue, ts DESC
      )
      SELECT
        l.venue,
        l.total_equity AS equity,
        (l.total_equity - COALESCE(p.total_equity, l.total_equity)) AS pnl
      FROM latest l
      LEFT JOIN prior p USING (venue)
      ORDER BY l.venue
    `
  );

  return rows.map((row) => ({
    venue: row.venue,
    equity: Number((row as any).equity ?? 0),
    pnl: Number((row as any).pnl ?? 0),
  }));
}

/**
 * Recent fills.
 */
export async function getRecentFills(limit = 20): Promise<RecentFill[]> {
  const sql = `
    SELECT 
      f.ts,
      sess.strategy_name,
      f.venue,
      f.symbol,
      f.side,
      f.fill_qty,
      f.fill_price,
      f.fee
    FROM fills f
    LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
    ORDER BY f.ts DESC
    LIMIT $1
  `;

  return query<RecentFill>(sql, [limit]);
}

/**
 * Returns most recent completed UTC 00:00 rebalance window status.
 * If the window has zero fills, we treat it as "same position".
 */
export async function getLatestRebalanceStatus(windowMinutes = 90): Promise<RebalanceStatus> {
  const now = new Date();

  const todayUtcMidnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  ));

  // Only mark a rebalance window once it has had enough time to complete.
  const currentWindowEnd = new Date(todayUtcMidnight.getTime() + windowMinutes * 60 * 1000);
  const useToday = now >= currentWindowEnd;
  const rebalanceTs = useToday
    ? todayUtcMidnight
    : new Date(todayUtcMidnight.getTime() - 24 * 60 * 60 * 1000);
  const windowEndTs = new Date(rebalanceTs.getTime() + windowMinutes * 60 * 1000);

  const row = await queryOne<{ fill_count: number }>(
    `
      SELECT COUNT(*)::int AS fill_count
      FROM fills
      WHERE ts >= $1
        AND ts < $2
    `,
    [rebalanceTs.toISOString(), windowEndTs.toISOString()]
  );

  const fillCount = Number(row?.fill_count ?? 0);
  return {
    rebalance_ts: rebalanceTs.toISOString(),
    window_end_ts: windowEndTs.toISOString(),
    fill_count: fillCount,
    same_position: fillCount === 0,
  };
}

/**
 * Returns rebalance windows between two timestamps.
 * A rebalance window is [UTC 00:00, UTC 00:00 + windowMinutes).
 */
export async function getRebalanceEventsBetween(
  fromTs: string,
  toTs: string,
  windowMinutes = 90
): Promise<RebalanceEvent[]> {
  return query<RebalanceEvent>(
    `
      WITH bounds AS (
        SELECT
          date_trunc('day', $1::timestamptz) AS day_start,
          date_trunc('day', $2::timestamptz) AS day_end
      ),
      days AS (
        SELECT generate_series(day_start, day_end, interval '1 day') AS rebalance_ts
        FROM bounds
      ),
      counts AS (
        SELECT
          d.rebalance_ts,
          COUNT(f.*)::int AS fill_count
        FROM days d
        LEFT JOIN fills f
          ON f.ts >= d.rebalance_ts
         AND f.ts < d.rebalance_ts + make_interval(mins => $3::int)
        GROUP BY d.rebalance_ts
      )
      SELECT
        rebalance_ts,
        fill_count,
        (fill_count = 0) AS same_position
      FROM counts
      WHERE rebalance_ts >= $1
        AND rebalance_ts <= $2
      ORDER BY rebalance_ts ASC
    `,
    [fromTs, toTs, windowMinutes]
  );
}

/**
 * Returns signed cash-flow events (deposits positive, withdrawals negative).
 * Table is optional; returns [] when cash_flows does not exist.
 */
export async function getCashFlowEvents(
  fromTs: string,
  toTs: string,
  venue?: string,
  strategies?: string[]
): Promise<CashFlowEvent[]> {
  if (!(await hasCashFlowsTable())) return [];

  const options: QueryFilters = { venue, strategies };
  const filters = buildFilters(3, options, true, 'cf');
  const whereSql = filters.clauses.length ? `AND ${filters.clauses.join(' AND ')}` : '';

  return query<CashFlowEvent>(
    `
      SELECT
        cf.ts,
        CASE
          WHEN cf.flow_type IS NULL THEN COALESCE(cf.amount, 0)
          WHEN LOWER(cf.flow_type) IN ('deposit', 'inflow', 'credit', 'transfer_in') THEN ABS(COALESCE(cf.amount, 0))
          WHEN LOWER(cf.flow_type) IN ('withdraw', 'withdrawal', 'outflow', 'debit', 'transfer_out') THEN -ABS(COALESCE(cf.amount, 0))
          ELSE COALESCE(cf.amount, 0)
        END AS amount
      FROM cash_flows cf
      LEFT JOIN trading_sessions sess ON cf.session_id = sess.session_id
      WHERE cf.ts > $1
        AND cf.ts <= $2
        ${whereSql}
      ORDER BY cf.ts ASC
    `,
    [fromTs, toTs, ...filters.params]
  );
}

/**
 * PnL attribution - daily breakdown of price change, fees, and funding.
 */
export async function getPnlAttribution(
  timeRange = '30D',
  venue?: string,
  strategies?: string[]
): Promise<any[]> {
  const { from_ts, to_ts } = timeRangeToTimestamps(timeRange);
  const options: QueryFilters = { venue, strategies };

  const eqFilters = buildFilters(3, options, true, 'e');
  const eqWhere = [...eqFilters.clauses, 'e.ts >= $2', 'e.ts <= $1'];
  const eqWhereSql = `WHERE ${eqWhere.join(' AND ')}`;
  const eqRows = await query<any>(
    `
      WITH equity_by_key AS (
        SELECT
          e.ts,
          COALESCE(sess.strategy_name, 'unknown') AS strategy_name,
          COALESCE(e.venue, 'unknown') AS venue,
          MAX(e.equity) AS equity
        FROM equity_snapshots e
        LEFT JOIN trading_sessions sess ON e.session_id = sess.session_id
        ${eqWhereSql}
        GROUP BY e.ts, COALESCE(sess.strategy_name, 'unknown'), COALESCE(e.venue, 'unknown')
      ),
      equity_by_ts AS (
        SELECT ts, SUM(equity) AS total_equity
        FROM equity_by_key
        GROUP BY ts
      ),
      daily_close AS (
        SELECT
          DATE(ts) AS date,
          (ARRAY_AGG(total_equity ORDER BY ts DESC))[1] AS close_equity
        FROM equity_by_ts
        GROUP BY DATE(ts)
      )
      SELECT
        date,
        close_equity,
        close_equity - LAG(close_equity) OVER (ORDER BY date) AS daily_net_pnl
      FROM daily_close
      ORDER BY date ASC
    `,
    [to_ts, from_ts, ...eqFilters.params]
  );

  const fillsFilters = buildFilters(3, options, true, 'f');
  const fillsWhere = [...fillsFilters.clauses, 'f.ts >= $2', 'f.ts <= $1'];
  const feesRows = await query<any>(
    `
      SELECT
        DATE(f.ts) AS date,
        SUM(ABS(COALESCE(f.fee, 0))) AS daily_fees
      FROM fills f
      LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
      WHERE ${fillsWhere.join(' AND ')}
      GROUP BY DATE(f.ts)
    `,
    [to_ts, from_ts, ...fillsFilters.params]
  );

  const fundingRows = await getFundingDeltasByDay(from_ts, to_ts, venue, strategies);
  const fundingMap = new Map<string, number>(
    fundingRows.map((r) => [new Date(r.date).toISOString().slice(0, 10), Number(r.daily_funding_delta ?? 0)])
  );
  const feesMap = new Map<string, number>(
    feesRows.map((r) => [new Date(r.date).toISOString().slice(0, 10), Number(r.daily_fees ?? 0)])
  );

  return eqRows
    .map((row) => {
      const dateKey = new Date(row.date).toISOString().slice(0, 10);
      const net = Number(row.daily_net_pnl ?? 0);
      const fees = Number(feesMap.get(dateKey) ?? 0);
      const funding = Number(fundingMap.get(dateKey) ?? 0);

      // net = trading + funding - fees  => trading = net - funding + fees
      const pricePnl = net - funding + fees;

      return {
        date: dateKey,
        price_pnl: pricePnl,
        fees: -fees,
        funding,
      };
    })
    .filter((row) => !Number.isNaN(row.price_pnl))
    .slice(-60);
}

async function getFundingDelta(
  fromTs: string,
  toTs: string,
  venue?: string,
  strategies?: string[]
): Promise<number> {
  const options: QueryFilters = { venue, strategies };
  const filters = buildFilters(3, options, true, 'f');
  const whereSql = filters.clauses.length ? `AND ${filters.clauses.join(' AND ')}` : '';

  const row = await queryOne<{ funding_delta: number }>(
    `
      WITH funding_with_lag AS (
        SELECT
          f.ts,
          f.session_id,
          f.venue,
          f.symbol,
          COALESCE(f.payment_amount, 0) AS payment_amount,
          LAG(COALESCE(f.payment_amount, 0)) OVER (
            PARTITION BY f.session_id, f.venue, f.symbol
            ORDER BY f.ts
          ) AS prev_payment
        FROM funding_payments f
        LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
        WHERE f.ts <= $1
        ${whereSql}
      )
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN ts < $2 THEN 0
              ELSE COALESCE(payment_amount, 0) - COALESCE(prev_payment, 0)
            END
          ),
          0
        ) AS funding_delta
      FROM funding_with_lag
    `,
    [toTs, fromTs, ...filters.params]
  );

  return Number(row?.funding_delta ?? 0);
}

let cashFlowsTableExistsCache: boolean | null = null;

async function hasCashFlowsTable(): Promise<boolean> {
  if (cashFlowsTableExistsCache != null) return cashFlowsTableExistsCache;
  const row = await queryOne<{ exists: boolean }>(
    `SELECT to_regclass('public.cash_flows') IS NOT NULL AS exists`
  );
  cashFlowsTableExistsCache = Boolean(row?.exists);
  return cashFlowsTableExistsCache;
}

async function getCashFlowDelta(
  fromTs: string,
  toTs: string,
  venue?: string,
  strategies?: string[]
): Promise<number> {
  if (!(await hasCashFlowsTable())) return 0;

  const options: QueryFilters = { venue, strategies };
  const filters = buildFilters(3, options, true, 'cf');
  const whereSql = filters.clauses.length ? `AND ${filters.clauses.join(' AND ')}` : '';

  const row = await queryOne<{ net_cash_flow: number }>(
    `
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN cf.flow_type IS NULL THEN COALESCE(cf.amount, 0)
              WHEN LOWER(cf.flow_type) IN ('deposit', 'inflow', 'credit', 'transfer_in') THEN ABS(COALESCE(cf.amount, 0))
              WHEN LOWER(cf.flow_type) IN ('withdraw', 'withdrawal', 'outflow', 'debit', 'transfer_out') THEN -ABS(COALESCE(cf.amount, 0))
              ELSE COALESCE(cf.amount, 0)
            END
          ),
          0
        ) AS net_cash_flow
      FROM cash_flows cf
      LEFT JOIN trading_sessions sess ON cf.session_id = sess.session_id
      WHERE cf.ts > $1
        AND cf.ts <= $2
        ${whereSql}
    `,
    [fromTs, toTs, ...filters.params]
  );

  return Number(row?.net_cash_flow ?? 0);
}

async function getFundingDeltasByDay(
  fromTs: string,
  toTs: string,
  venue?: string,
  strategies?: string[]
): Promise<Array<{ date: string; daily_funding_delta: number }>> {
  const options: QueryFilters = { venue, strategies };
  const filters = buildFilters(3, options, true, 'f');
  const whereSql = filters.clauses.length ? `AND ${filters.clauses.join(' AND ')}` : '';

  return query<{ date: string; daily_funding_delta: number }>(
    `
      WITH funding_with_lag AS (
        SELECT
          f.ts,
          COALESCE(f.payment_amount, 0) AS payment_amount,
          LAG(COALESCE(f.payment_amount, 0)) OVER (
            PARTITION BY f.session_id, f.venue, f.symbol
            ORDER BY f.ts
          ) AS prev_payment
        FROM funding_payments f
        LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
        WHERE f.ts <= $1
        ${whereSql}
      )
      SELECT
        DATE(ts) AS date,
        SUM(COALESCE(payment_amount, 0) - COALESCE(prev_payment, 0)) AS daily_funding_delta
      FROM funding_with_lag
      WHERE ts >= $2
      GROUP BY DATE(ts)
      ORDER BY DATE(ts) ASC
    `,
    [toTs, fromTs, ...filters.params]
  );
}