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

export type RecentActivityTab = 'all' | 'fills' | 'rebalance';

export interface RecentActivityItem {
  ts: string;
  kind: 'fill' | 'rebalance';
  payload: any;
}

export interface RecentActivityPage {
  items: RecentActivityItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface QueryFilters {
  venue?: string;
  strategies?: string[];
}

let fillsHasRealizedPnlCache: boolean | null = null;

async function fillsHasColumn(columnName: string): Promise<boolean> {
  if (columnName === 'realized_pnl' && fillsHasRealizedPnlCache !== null) {
    return fillsHasRealizedPnlCache;
  }

  const row = await queryOne<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'fills'
          AND column_name = $1
      ) AS exists
    `,
    [columnName]
  );

  const exists = Boolean(row?.exists);
  if (columnName === 'realized_pnl') {
    fillsHasRealizedPnlCache = exists;
  }
  return exists;
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
      keys AS (
        SELECT DISTINCT strategy_name, venue
        FROM equity_by_key
      ),
      latest_per_key AS (
        SELECT
          k.strategy_name,
          k.venue,
          p.ts,
          p.equity
        FROM keys k
        LEFT JOIN LATERAL (
          SELECT ebk.ts, ebk.equity
          FROM equity_by_key ebk
          WHERE ebk.strategy_name = k.strategy_name
            AND ebk.venue = k.venue
            AND ebk.ts <= $1
          ORDER BY ebk.ts DESC
          LIMIT 1
        ) p ON TRUE
      ),
      baseline_per_key AS (
        SELECT
          k.strategy_name,
          k.venue,
          p.ts,
          p.equity
        FROM keys k
        LEFT JOIN LATERAL (
          SELECT ebk.ts, ebk.equity
          FROM equity_by_key ebk
          WHERE ebk.strategy_name = k.strategy_name
            AND ebk.venue = k.venue
            AND ebk.ts <= $2
          ORDER BY ebk.ts DESC
          LIMIT 1
        ) p ON TRUE
      ),
      first_per_key AS (
        SELECT
          k.strategy_name,
          k.venue,
          p.ts,
          p.equity
        FROM keys k
        LEFT JOIN LATERAL (
          SELECT ebk.ts, ebk.equity
          FROM equity_by_key ebk
          WHERE ebk.strategy_name = k.strategy_name
            AND ebk.venue = k.venue
          ORDER BY ebk.ts ASC
          LIMIT 1
        ) p ON TRUE
      ),
      latest_point AS (
        SELECT
          MAX(ts) AS ts,
          COALESCE(SUM(COALESCE(equity, 0)), 0) AS total_equity
        FROM latest_per_key
      ),
      baseline_point AS (
        SELECT
          MAX(ts) AS ts,
          COALESCE(SUM(COALESCE(equity, 0)), 0) AS total_equity
        FROM baseline_per_key
      ),
      first_point AS (
        SELECT
          MIN(ts) AS ts,
          COALESCE(SUM(COALESCE(equity, 0)), 0) AS total_equity
        FROM first_per_key
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
  const adjustedPnl = await getAdjustedPnlSummary(to_ts, venue, strategies);

  const equityNow = Number(equityRow?.total_equity ?? 0);
  const initialEquity = Number(equityRow?.initial_equity ?? equityNow);
  const inceptionTs = equityRow?.initial_equity_ts ?? '2000-01-01T00:00:00Z';
  const cashFlowSinceInitial = await getCashFlowDelta(inceptionTs, to_ts, venue, strategies);
  const unrealizedPnlResidual =
    equityNow - initialEquity - cashFlowSinceInitial - Number(adjustedPnl.realized_pnl ?? 0);
  const equityPeriodAgo = Number(equityRow?.equity_period_ago ?? equityNow);
  const pnlPeriod = equityNow - equityPeriodAgo - cashFlowPeriod;
  const pnlPeriodPct = equityPeriodAgo !== 0 ? (pnlPeriod / equityPeriodAgo) * 100 : 0;

  return {
    total_equity: equityNow,
    pnl_24h: pnlPeriod,
    pnl_24h_pct: pnlPeriodPct,
    total_unrealized_pnl: unrealizedPnlResidual,
    total_realized_pnl: adjustedPnl.realized_pnl,
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

async function getAdjustedPnlSummary(
  toTs: string,
  venue?: string,
  strategies?: string[]
): Promise<{ realized_pnl: number; unrealized_pnl: number }> {
  const params: unknown[] = [toTs];
  let venueParamIdx: number | null = null;
  if (!isAllValue(venue)) {
    params.push(venue);
    venueParamIdx = params.length;
  }
  const strategiesFilter = normalizeStrategies(strategies);
  let strategiesParamIdx: number | null = null;
  if (strategiesFilter?.length) {
    params.push(strategiesFilter);
    strategiesParamIdx = params.length;
  }

  const fillWhereParts: string[] = [];
  const fundingWhereParts: string[] = [];
  const stateWhereParts: string[] = [];
  if (venueParamIdx != null) {
    fillWhereParts.push(`f.venue = $${venueParamIdx}`);
    fundingWhereParts.push(`fp.venue = $${venueParamIdx}`);
    stateWhereParts.push(`ts.venue = $${venueParamIdx}`);
  }
  if (strategiesParamIdx != null) {
    fillWhereParts.push(`sess.strategy_name = ANY($${strategiesParamIdx}::text[])`);
    fundingWhereParts.push(`sess.strategy_name = ANY($${strategiesParamIdx}::text[])`);
    stateWhereParts.push(`ts.strategy_name = ANY($${strategiesParamIdx}::text[])`);
  }

  const fillWhereSql = fillWhereParts.length ? `AND ${fillWhereParts.join(' AND ')}` : '';
  const fundingWhereSql = fundingWhereParts.length ? `AND ${fundingWhereParts.join(' AND ')}` : '';
  const stateWhereExtra = stateWhereParts.length ? `AND ${stateWhereParts.join(' AND ')}` : '';

  const sql = `
    WITH fills_with_session AS (
      SELECT
        f.fill_id,
        f.ts,
        f.venue,
        f.symbol,
        COALESCE(sess.strategy_name, '__unknown__') AS strategy_name,
        LOWER(f.side) AS side,
        COALESCE(f.fill_qty, 0) AS fill_qty,
        COALESCE(f.fill_price, 0) AS fill_price,
        COALESCE(f.fee, 0) AS fee,
        CASE WHEN LOWER(f.side) = 'buy' THEN COALESCE(f.fill_qty, 0) ELSE -COALESCE(f.fill_qty, 0) END AS signed_qty
      FROM fills f
      LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
      WHERE f.ts <= $1
      ${fillWhereSql}
    ),
    fills_with_running AS (
      SELECT
        fws.*,
        SUM(fws.signed_qty) OVER (
          PARTITION BY fws.strategy_name, fws.venue, fws.symbol
          ORDER BY fws.ts, fws.fill_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_qty
      FROM fills_with_session fws
    ),
    fills_with_groups AS (
      SELECT
        fwr.*,
        LAG(fwr.running_qty, 1, 0) OVER (
          PARTITION BY fwr.strategy_name, fwr.venue, fwr.symbol
          ORDER BY fwr.ts, fwr.fill_id
        ) AS prev_running_qty
      FROM fills_with_running fwr
    ),
    lifecycle_tagged AS (
      SELECT
        fwg.*,
        SUM(
          CASE
            WHEN ABS(fwg.prev_running_qty) < 1e-12 THEN 1
            WHEN fwg.prev_running_qty * fwg.running_qty < 0 THEN 1
            ELSE 0
          END
        ) OVER (
          PARTITION BY fwg.strategy_name, fwg.venue, fwg.symbol
          ORDER BY fwg.ts, fwg.fill_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS lifecycle_seq
      FROM fills_with_groups fwg
    ),
    lifecycle_agg AS (
      SELECT
        lt.strategy_name,
        lt.venue,
        lt.symbol,
        lt.lifecycle_seq,
        SUM(CASE WHEN lt.side = 'buy' THEN lt.fill_qty * lt.fill_price ELSE 0 END) AS buy_notional,
        SUM(CASE WHEN lt.side = 'buy' THEN lt.fill_qty ELSE 0 END) AS buy_qty,
        SUM(CASE WHEN lt.side = 'sell' THEN lt.fill_qty * lt.fill_price ELSE 0 END) AS sell_notional,
        SUM(CASE WHEN lt.side = 'sell' THEN lt.fill_qty ELSE 0 END) AS sell_qty,
        SUM(lt.fee) AS total_fee,
        SUM(lt.signed_qty) AS net_qty,
        MIN(lt.ts) AS open_time,
        MAX(lt.ts) AS last_fill_ts,
        CASE WHEN SUM(CASE WHEN lt.side = 'buy' THEN lt.fill_qty ELSE 0 END) > 0
          THEN SUM(CASE WHEN lt.side = 'buy' THEN lt.fill_qty * lt.fill_price ELSE 0 END) /
               SUM(CASE WHEN lt.side = 'buy' THEN lt.fill_qty ELSE 0 END)
          ELSE NULL END AS avg_buy_price,
        CASE WHEN SUM(CASE WHEN lt.side = 'sell' THEN lt.fill_qty ELSE 0 END) > 0
          THEN SUM(CASE WHEN lt.side = 'sell' THEN lt.fill_qty * lt.fill_price ELSE 0 END) /
               SUM(CASE WHEN lt.side = 'sell' THEN lt.fill_qty ELSE 0 END)
          ELSE NULL END AS avg_sell_price
      FROM lifecycle_tagged lt
      GROUP BY lt.strategy_name, lt.venue, lt.symbol, lt.lifecycle_seq
    ),
    latest_state AS (
      SELECT DISTINCT ON (ts.strategy_name, ts.venue, ts.symbol)
        ts.strategy_name,
        ts.venue,
        ts.symbol,
        ts.position_qty,
        ts.avg_entry_price,
        ts.mark_price
      FROM trading_state ts
      WHERE 1=1
      ${stateWhereExtra}
      ORDER BY ts.strategy_name, ts.venue, ts.symbol, ts.updated_at DESC
    ),
    funding_deltas AS (
      SELECT
        fp.ts,
        fp.venue,
        fp.symbol,
        COALESCE(sess.strategy_name, '__unknown__') AS strategy_name,
        COALESCE(fp.payment_amount, 0) -
        COALESCE(
          LAG(COALESCE(fp.payment_amount, 0)) OVER (
            PARTITION BY COALESCE(sess.strategy_name, '__unknown__'), fp.venue, fp.symbol
            ORDER BY fp.ts
          ),
          0
        ) AS funding_delta
      FROM funding_payments fp
      LEFT JOIN trading_sessions sess ON fp.session_id = sess.session_id
      WHERE fp.ts <= $1
      ${fundingWhereSql}
    ),
    funding_agg AS (
      SELECT
        la.strategy_name,
        la.venue,
        la.symbol,
        la.lifecycle_seq,
        COALESCE(SUM(fd.funding_delta), 0) AS total_funding
      FROM lifecycle_agg la
      LEFT JOIN funding_deltas fd
        ON fd.strategy_name = la.strategy_name
       AND fd.venue = la.venue
       AND fd.symbol = la.symbol
       AND fd.ts >= la.open_time
       AND fd.ts <= CASE WHEN ABS(la.net_qty) < 1e-12 THEN la.last_fill_ts ELSE $1::timestamptz END
      GROUP BY la.strategy_name, la.venue, la.symbol, la.lifecycle_seq
    ),
    lifecycle_pnl AS (
      SELECT
        CASE WHEN ABS(la.net_qty) < 1e-12 THEN 'CLOSED' ELSE 'OPEN' END AS status,
        (
          CASE
            WHEN ABS(la.net_qty) < 1e-12 THEN (la.sell_notional - la.buy_notional)
            WHEN la.net_qty > 0 THEN
              (
                COALESCE(ls.mark_price, ls.avg_entry_price, la.avg_buy_price, la.avg_sell_price, 0) -
                COALESCE(ls.avg_entry_price, la.avg_buy_price, la.avg_sell_price, 0)
              ) * ABS(la.net_qty)
            ELSE
              (
                COALESCE(ls.avg_entry_price, la.avg_sell_price, la.avg_buy_price, 0) -
                COALESCE(ls.mark_price, ls.avg_entry_price, la.avg_sell_price, la.avg_buy_price, 0)
              ) * ABS(la.net_qty)
          END
        ) + COALESCE(fa.total_funding, 0) - la.total_fee AS net_pnl
      FROM lifecycle_agg la
      LEFT JOIN funding_agg fa
        ON la.strategy_name = fa.strategy_name
       AND la.venue = fa.venue
       AND la.symbol = fa.symbol
       AND la.lifecycle_seq = fa.lifecycle_seq
      LEFT JOIN latest_state ls
        ON ls.strategy_name = la.strategy_name
       AND ls.venue = la.venue
       AND ls.symbol = la.symbol
    )
    SELECT
      COALESCE(SUM(CASE WHEN status = 'CLOSED' THEN net_pnl ELSE 0 END), 0) AS realized_pnl,
      COALESCE(SUM(CASE WHEN status = 'OPEN' THEN net_pnl ELSE 0 END), 0) AS unrealized_pnl
    FROM lifecycle_pnl
  `;

  const row = await queryOne<{ realized_pnl: number; unrealized_pnl: number }>(sql, params);
  return {
    realized_pnl: Number(row?.realized_pnl ?? 0),
    unrealized_pnl: Number(row?.unrealized_pnl ?? 0),
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

  if (timeRange === 'ALL') {
    // For ALL range, read complete history and downsample only for chart rendering.
    const eqFiltersAll = buildFilters(1, options, true, 'e');
    const allRows = await query<EquityCurvePoint>(
      `
        WITH equity_by_key AS (
          SELECT
            e.ts,
            COALESCE(sess.strategy_name, 'unknown') AS strategy_name,
            COALESCE(e.venue, 'unknown') AS venue,
            MAX(e.equity) AS equity
          FROM equity_snapshots e
          LEFT JOIN trading_sessions sess ON e.session_id = sess.session_id
          ${eqFiltersAll.clauses.length ? `WHERE ${eqFiltersAll.clauses.join(' AND ')}` : ''}
          GROUP BY e.ts, COALESCE(sess.strategy_name, 'unknown'), COALESCE(e.venue, 'unknown')
        ),
        key_changes AS (
          SELECT
            ebk.strategy_name,
            ebk.venue,
            ebk.ts,
            ebk.equity - COALESCE(
              LAG(ebk.equity) OVER (
                PARTITION BY ebk.strategy_name, ebk.venue
                ORDER BY ebk.ts
              ),
              0
            ) AS delta
          FROM equity_by_key
        ),
        ts_deltas AS (
          SELECT
            ts,
            SUM(delta) AS delta
          FROM key_changes
          GROUP BY ts
        ),
        portfolio_curve AS (
          SELECT
            ts,
            SUM(delta) OVER (
              ORDER BY ts
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS equity
          FROM ts_deltas
        )
        SELECT ts, equity
        FROM portfolio_curve
        ORDER BY ts ASC
      `,
      eqFiltersAll.params
    );
    return downsampleEquityCurve(allRows, 2000);
  }

  const eqFilters = buildFilters(3, options, true, 'e');

  const rows = await query<EquityCurvePoint>(
    `
      WITH equity_by_key_all AS (
        SELECT
          e.ts,
          COALESCE(sess.strategy_name, 'unknown') AS strategy_name,
          COALESCE(e.venue, 'unknown') AS venue,
          MAX(e.equity) AS equity
        FROM equity_snapshots e
        LEFT JOIN trading_sessions sess ON e.session_id = sess.session_id
        ${eqFilters.clauses.length ? `WHERE ${eqFilters.clauses.join(' AND ')}` : ''}
        GROUP BY e.ts, COALESCE(sess.strategy_name, 'unknown'), COALESCE(e.venue, 'unknown')
      ),
      keys AS (
        SELECT DISTINCT strategy_name, venue
        FROM equity_by_key_all
      ),
      seed_per_key AS (
        SELECT
          k.strategy_name,
          k.venue,
          COALESCE(
            (
              SELECT ebk.equity
              FROM equity_by_key_all ebk
              WHERE ebk.strategy_name = k.strategy_name
                AND ebk.venue = k.venue
                AND ebk.ts <= $2
              ORDER BY ebk.ts DESC
              LIMIT 1
            ),
            0
          ) AS equity
        FROM keys k
      ),
      in_range AS (
        SELECT strategy_name, venue, ts, equity
        FROM equity_by_key_all
        WHERE ts > $2
          AND ts <= $1
      ),
      unioned AS (
        SELECT strategy_name, venue, $2::timestamptz AS ts, equity
        FROM seed_per_key
        UNION
        SELECT strategy_name, venue, ts, equity
        FROM in_range
      ),
      key_changes AS (
        SELECT
          u.strategy_name,
          u.venue,
          u.ts,
          u.equity - COALESCE(
            LAG(u.equity) OVER (
              PARTITION BY u.strategy_name, u.venue
              ORDER BY u.ts
            ),
            0
          ) AS delta
        FROM unioned u
      ),
      ts_deltas AS (
        SELECT
          ts,
          SUM(delta) AS delta
        FROM key_changes
        GROUP BY ts
      ),
      portfolio_curve AS (
        SELECT
          ts,
          SUM(delta) OVER (
            ORDER BY ts
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS equity
        FROM ts_deltas
      )
      SELECT ts, equity
      FROM portfolio_curve
      ORDER BY ts ASC
    `,
    [to_ts, from_ts, ...eqFilters.params]
  );

  if (rows.length > 0) {
    // Keep full requested period semantics while bounding frontend render cost.
    const maxPointsByRange: Record<string, number> = {
      '24H': 1500,
      '7D': 2000,
      '30D': 2500,
      '90D': 3000,
      'ALL': 2000,
    };
    const maxPoints = maxPointsByRange[timeRange] ?? 2000;
    return downsampleEquityCurve(rows, maxPoints);
  }

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
      ),
      key_changes AS (
        SELECT
          ebk.strategy_name,
          ebk.venue,
          ebk.ts,
          ebk.equity - COALESCE(
            LAG(ebk.equity) OVER (
              PARTITION BY ebk.strategy_name, ebk.venue
              ORDER BY ebk.ts
            ),
            0
          ) AS delta
        FROM equity_by_key ebk
      ),
      ts_deltas AS (
        SELECT
          ts,
          SUM(delta) AS delta
        FROM key_changes
        GROUP BY ts
      ),
      portfolio_curve AS (
        SELECT
          ts,
          SUM(delta) OVER (
            ORDER BY ts
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS equity
        FROM ts_deltas
      )
      SELECT ts, equity
      FROM portfolio_curve
      ORDER BY ts DESC
      LIMIT 3000
    `,
    eqFilters.params
  ).then((latestRows) => latestRows.reverse());
}

function downsampleEquityCurve(points: EquityCurvePoint[], maxPoints: number): EquityCurvePoint[] {
  if (points.length <= maxPoints) return points;
  if (maxPoints <= 2) return [points[0], points[points.length - 1]];

  const result: EquityCurvePoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.round(i * step);
    result.push(points[Math.min(idx, points.length - 1)]);
  }
  return result;
}

/**
 * Strategy leaderboard.
 */
export async function getStrategyLeaderboard(
  timeRange = '24H',
  venue?: string
): Promise<StrategyLeaderboardRow[]> {
  const { to_ts } = timeRangeToTimestamps(timeRange);
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
        (l.latest_equity - COALESCE(f.first_equity, l.latest_equity)) AS pnl,
        l.latest_equity,
        COALESCE(n.notional, 0) AS notional
      FROM latest l
      LEFT JOIN first_equity f ON f.strategy_name = l.strategy_name
      LEFT JOIN state_notional n ON n.strategy_name = l.strategy_name
      ORDER BY pnl DESC
      LIMIT 10
    `,
    [to_ts, ...eqFilters.params]
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
 * Unified recent activity feed with pagination and tab filtering.
 * Includes:
 * - fill events from `fills`
 * - daily rebalance window events at UTC 00:00
 */
export async function getRecentActivityPage(
  tab: RecentActivityTab,
  page = 1,
  pageSize = 20,
  lookbackDays = 365,
  rebalanceWindowMinutes = 90
): Promise<RecentActivityPage> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(pageSize, 200));
  const offset = (safePage - 1) * safePageSize;

  const filterSql = `
    (
      $3::text = 'all'
      OR ($3::text = 'fills' AND kind = 'fill')
      OR ($3::text = 'rebalance' AND kind = 'rebalance')
    )
  `;
  const filterSqlCount = `
    (
      $2::text = 'all'
      OR ($2::text = 'fills' AND kind = 'fill')
      OR ($2::text = 'rebalance' AND kind = 'rebalance')
    )
  `;

  const items = await query<RecentActivityItem>(
    `
      WITH fill_events AS (
        SELECT
          f.ts AS ts,
          'fill'::text AS kind,
          jsonb_build_object(
            'ts', f.ts,
            'strategy_name', COALESCE(sess.strategy_name, 'unknown'),
            'venue', f.venue,
            'symbol', f.symbol,
            'side', f.side,
            'fill_qty', f.fill_qty,
            'fill_price', f.fill_price,
            'fee', f.fee
          ) AS payload
        FROM fills f
        LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
      ),
      rebalance_days AS (
        SELECT generate_series(
          date_trunc('day', NOW() - make_interval(days => $1::int)),
          date_trunc('day', NOW()),
          interval '1 day'
        ) AS rebalance_ts
      ),
      rebalance_events AS (
        SELECT
          d.rebalance_ts AS ts,
          'rebalance'::text AS kind,
          jsonb_build_object(
            'rebalance_ts', d.rebalance_ts,
            'window_end_ts', d.rebalance_ts + make_interval(mins => $2::int),
            'fill_count', COUNT(f.*)::int,
            'same_position', (COUNT(f.*) = 0)
          ) AS payload
        FROM rebalance_days d
        LEFT JOIN fills f
          ON f.ts >= d.rebalance_ts
         AND f.ts < d.rebalance_ts + make_interval(mins => $2::int)
        GROUP BY d.rebalance_ts
      ),
      combined AS (
        SELECT ts, kind, payload FROM fill_events
        UNION ALL
        SELECT ts, kind, payload FROM rebalance_events
      )
      SELECT ts, kind, payload
      FROM combined
      WHERE ${filterSql}
      ORDER BY ts DESC
      LIMIT $4 OFFSET $5
    `,
    [lookbackDays, rebalanceWindowMinutes, tab, safePageSize, offset]
  );

  const countRow = await queryOne<{ total: number }>(
    `
      WITH fill_events AS (
        SELECT f.ts AS ts, 'fill'::text AS kind
        FROM fills f
      ),
      rebalance_days AS (
        SELECT generate_series(
          date_trunc('day', NOW() - make_interval(days => $1::int)),
          date_trunc('day', NOW()),
          interval '1 day'
        ) AS rebalance_ts
      ),
      rebalance_events AS (
        SELECT d.rebalance_ts AS ts, 'rebalance'::text AS kind
        FROM rebalance_days d
      ),
      combined AS (
        SELECT ts, kind FROM fill_events
        UNION ALL
        SELECT ts, kind FROM rebalance_events
      )
      SELECT COUNT(*)::int AS total
      FROM combined
      WHERE ${filterSqlCount}
    `,
    [lookbackDays, tab]
  );

  const total = Number(countRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));

  return {
    items,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
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