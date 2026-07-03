/**
 * SQL queries for the Overview page.
 * All heavy aggregations in SQL. Parameterized queries only.
 */

import { query, queryOne } from '../db';

// ============== TYPES ==============

export interface OverviewStats {
  total_equity: number;
  pnl_24h: number;
  pnl_24h_pct: number;
  total_unrealized_pnl: number;
  total_realized_pnl: number;
  max_drawdown_pct: number;
  open_positions: number;
  gross_exposure: number;
  equity_24h_ago: number;
}

export interface EquityCurvePoint {
  ts: string;
  equity: number;
  cash_balance: number;
  unrealized_pnl: number;
  realized_pnl: number;
}

export interface StrategyEquityPoint {
  ts: string;
  strategy_name: string;
  equity: number;
}

export interface StrategyLeaderboardRow {
  strategy_name: string;
  status: string;
  pnl: number;
  return_pct: number;
  latest_equity: number;
  max_dd_pct: number;
  sharpe: number;
  sparkline: number[];
}

export interface VenueSplitRow {
  venue: string;
  equity: number;
  pnl: number;
}

export interface PnlAttributionRow {
  date: string;
  price_pnl: number;
  fees: number;
  funding: number;
}

export interface RecentFill {
  ts: string;
  strategy_name: string;
  venue: string;
  symbol: string;
  side: string;
  fill_qty: number;
  fill_price: number;
  realized_pnl: number | null;
  fill_role: string | null;
}

// ============== TIME RANGE HELPER ==============

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

function buildVenueFilter(paramIdx: number, venue?: string): { sql: string; nextIdx: number } {
  if (venue && venue !== 'All') {
    return { sql: `AND ts.venue = $${paramIdx}`, nextIdx: paramIdx + 1 };
  }
  return { sql: '', nextIdx: paramIdx };
}

function buildStrategyFilter(paramIdx: number, strategies?: string[]): { sql: string; nextIdx: number } {
  if (strategies && strategies.length > 0) {
    return { sql: `AND ts.strategy_name = ANY($${paramIdx})`, nextIdx: paramIdx + 1 };
  }
  return { sql: '', nextIdx: paramIdx };
}

// ============== QUERIES ==============

/**
 * Get overview stats: total equity, 24h PnL, uPnL, rPnL, max DD, positions, exposure.
 */
export async function getOverviewStats(
  timeRange = '24H',
  venue?: string,
  strategies?: string[]
): Promise<OverviewStats | null> {
  const interval = timeRangeToInterval(timeRange);

  // Build filters
  let venueSql = '';
  let stratSql = '';
  const params: unknown[] = [];
  let idx = 1;

  if (venue && venue !== 'All') {
    venueSql = `AND venue = $${idx}`;
    params.push(venue);
    idx++;
  }
  if (strategies && strategies.length > 0) {
    stratSql = `AND strategy_name = ANY($${idx})`;
    params.push(strategies);
    idx++;
  }

  const sql = `
    SELECT
      SUM(CASE WHEN position_qty != 0 THEN equity ELSE 0 END) as total_equity,
      SUM(unrealized_pnl) as total_unrealized_pnl,
      SUM(realized_pnl) as total_realized_pnl,
      COUNT(CASE WHEN position_qty != 0 THEN 1 END) as open_positions,
      SUM(ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0))) as gross_exposure
    FROM trading_state ts
    WHERE 1=1
    ${venueSql}
    ${stratSql}
  `;

  const row = await queryOne<OverviewStats>(sql, params);

  // Get 24h PnL from equity snapshots
  const pnlParams: unknown[] = [];
  let pnlIdx = 1;
  let pnlVenueSql = '';
  let pnlStratSql = '';

  if (venue && venue !== 'All') {
    pnlVenueSql = `AND es.venue = $${pnlIdx}`;
    pnlParams.push(venue);
    pnlIdx++;
  }

  // For strategy filter on equity_snapshots, we need to join with trading_sessions
  if (strategies && strategies.length > 0) {
    pnlStratSql = `AND sess.strategy_name = ANY($${pnlIdx})`;
    pnlParams.push(strategies);
    pnlIdx++;
  }

  const pnlSql = `
    SELECT
      latest.equity as equity_now,
      earliest.equity as equity_24h_ago
    FROM (
      SELECT SUM(es.equity) as equity
      FROM equity_snapshots es
      ${strategies && strategies.length > 0 ? 'JOIN trading_sessions sess ON es.session_id = sess.session_id' : ''}
      WHERE es.ts > NOW() - INTERVAL '${interval}'
      ${pnlVenueSql}
      ${pnlStratSql}
      ORDER BY es.ts DESC
      LIMIT 1
    ) latest,
    (
      SELECT SUM(es.equity) as equity
      FROM equity_snapshots es
      ${strategies && strategies.length > 0 ? 'JOIN trading_sessions sess ON es.session_id = sess.session_id' : ''}
      WHERE es.ts > NOW() - INTERVAL '${interval}'
      ${pnlVenueSql}
      ${pnlStratSql}
      ORDER BY es.ts ASC
      LIMIT 1
    ) earliest
  `;

  const pnlRow = await queryOne<{ equity_now: number; equity_24h_ago: number }>(pnlSql, pnlParams);

  // Get max drawdown from equity snapshots in range
  const ddParams: unknown[] = [];
  let ddIdx = 1;
  let ddVenueSql = '';
  let ddStratSql = '';

  if (venue && venue !== 'All') {
    ddVenueSql = `AND es.venue = $${ddIdx}`;
    ddParams.push(venue);
    ddIdx++;
  }
  if (strategies && strategies.length > 0) {
    ddStratSql = `AND sess.strategy_name = ANY($${ddIdx})`;
    ddParams.push(strategies);
    ddIdx++;
  }

  const ddSql = `
    SELECT
      COALESCE(
        (1 - MIN(running_equity) / MAX(running_peak)) * 100,
        0
      ) as max_drawdown_pct
    FROM (
      SELECT
        SUM(es.equity) OVER (ORDER BY es.ts) as running_equity,
        MAX(SUM(es.equity)) OVER (ORDER BY es.ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as running_peak
      FROM equity_snapshots es
      ${strategies && strategies.length > 0 ? 'JOIN trading_sessions sess ON es.session_id = sess.session_id' : ''}
      WHERE es.ts > NOW() - INTERVAL '${interval}'
      ${ddVenueSql}
      ${ddStratSql}
      GROUP BY es.ts
    ) sub
  `;

  const ddRow = await queryOne<{ max_drawdown_pct: number }>(ddSql, ddParams);

  if (!row) return null;

  const equityNow = pnlRow?.equity_now || row.total_equity;
  const equityAgo = pnlRow?.equity_24h_ago || row.total_equity;
  const pnl24h = equityNow - equityAgo;
  const pnl24hPct = equityAgo > 0 ? (pnl24h / equityAgo) * 100 : 0;

  return {
    ...row,
    total_equity: row.total_equity || 0,
    pnl_24h: pnl24h,
    pnl_24h_pct: pnl24hPct,
    equity_24h_ago: equityAgo,
    max_drawdown_pct: Math.abs(ddRow?.max_drawdown_pct || 0),
  };
}

/**
 * Get equity curve for the chart. Downsampled to ≤2000 points.
 */
export async function getEquityCurve(
  timeRange = '24H',
  venue?: string,
  strategies?: string[]
): Promise<EquityCurvePoint[]> {
  const interval = timeRangeToInterval(timeRange);

  const params: unknown[] = [];
  let idx = 1;
  let venueSql = '';
  let stratSql = '';

  if (venue && venue !== 'All') {
    venueSql = `AND es.venue = $${idx}`;
    params.push(venue);
    idx++;
  }
  if (strategies && strategies.length > 0) {
    stratSql = `AND sess.strategy_name = ANY($${idx})`;
    params.push(strategies);
    idx++;
  }

  // Determine bucket size based on range to keep ≤2000 points
  let bucketWidth = '5 minutes';
  if (timeRange === '7D') bucketWidth = '30 minutes';
  else if (timeRange === '30D') bucketWidth = '2 hours';
  else if (timeRange === '90D') bucketWidth = '6 hours';
  else if (timeRange === 'ALL') bucketWidth = '1 day';

  const sql = `
    SELECT
      time_bucket('${bucketWidth}', es.ts) AS bucket_ts,
      SUM(es.equity) as equity,
      SUM(es.cash_balance) as cash_balance,
      SUM(es.unrealized_pnl) as unrealized_pnl,
      SUM(es.realized_pnl) as realized_pnl
    FROM equity_snapshots es
    ${strategies && strategies.length > 0 ? 'JOIN trading_sessions sess ON es.session_id = sess.session_id' : ''}
    WHERE es.ts > NOW() - INTERVAL '${interval}'
    ${venueSql}
    ${stratSql}
    GROUP BY bucket_ts
    ORDER BY bucket_ts ASC
  `;

  return query<EquityCurvePoint>(sql, params);
}

/**
 * Get per-strategy equity curves for overlay.
 */
export async function getStrategyEquityCurves(
  timeRange = '24H',
  venue?: string
): Promise<StrategyEquityPoint[]> {
  const interval = timeRangeToInterval(timeRange);

  const params: unknown[] = [];
  let idx = 1;
  let venueSql = '';

  if (venue && venue !== 'All') {
    venueSql = `AND es.venue = $${idx}`;
    params.push(venue);
    idx++;
  }

  let bucketWidth = '1 hour';
  if (timeRange === '7D') bucketWidth = '4 hours';
  else if (timeRange === '30D') bucketWidth = '12 hours';
  else if (timeRange === '90D' || timeRange === 'ALL') bucketWidth = '1 day';

  const sql = `
    SELECT
      time_bucket('${bucketWidth}', es.ts) AS bucket_ts,
      sess.strategy_name,
      SUM(es.equity) as equity
    FROM equity_snapshots es
    JOIN trading_sessions sess ON es.session_id = sess.session_id
    WHERE es.ts > NOW() - INTERVAL '${interval}'
    ${venueSql}
    GROUP BY bucket_ts, sess.strategy_name
    ORDER BY bucket_ts ASC, sess.strategy_name
  `;

  return query<StrategyEquityPoint>(sql, params);
}

/**
 * Strategy leaderboard with PnL, return%, sparkline, max DD, Sharpe.
 */
export async function getStrategyLeaderboard(
  timeRange = '24H',
  venue?: string
): Promise<StrategyLeaderboardRow[]> {
  const interval = timeRangeToInterval(timeRange);

  const params: unknown[] = [];
  let idx = 1;
  let venueSql = '';

  if (venue && venue !== 'All') {
    venueSql = `AND es.venue = $${idx}`;
    params.push(venue);
    idx++;
  }

  // Get per-strategy stats from equity snapshots
  const sql = `
    SELECT
      sess.strategy_name,
      COALESCE(sess_latest.status, 'unknown') as status,
      SUM(CASE WHEN es_latest.equity IS NOT NULL THEN es_latest.equity ELSE 0 END) as latest_equity,
      SUM(CASE WHEN es_earliest.equity IS NOT NULL THEN es_earliest.equity ELSE 0 END) as earliest_equity,
      SUM(CASE WHEN es_latest.equity IS NOT NULL AND es_earliest.equity IS NOT NULL 
        THEN es_latest.equity - es_earliest.equity ELSE 0 END) as pnl
    FROM trading_sessions sess
    LEFT JOIN LATERAL (
      SELECT equity FROM equity_snapshots es
      WHERE es.session_id = sess.session_id
      ${venueSql ? venueSql.replace(/\$(\d+)/g, (m, n) => `$${parseInt(n) + params.length}`) : ''}
      ORDER BY es.ts DESC LIMIT 1
    ) es_latest ON true
    LEFT JOIN LATERAL (
      SELECT equity FROM equity_snapshots es
      WHERE es.session_id = sess.session_id
      AND es.ts > NOW() - INTERVAL '${interval}'
      ${venueSql ? venueSql.replace(/\$(\d+)/g, (m, n) => `$${parseInt(n) + params.length}`) : ''}
      ORDER BY es.ts ASC LIMIT 1
    ) es_earliest ON true
    LEFT JOIN LATERAL (
      SELECT status FROM trading_sessions s2
      WHERE s2.strategy_name = sess.strategy_name
      ORDER BY s2.started_at DESC LIMIT 1
    ) sess_latest ON true
    WHERE sess.started_at > NOW() - INTERVAL '${interval}'
    GROUP BY sess.strategy_name, sess_latest.status
    ORDER BY pnl DESC
  `;

  const rows = await query<{
    strategy_name: string;
    status: string;
    latest_equity: number;
    earliest_equity: number;
    pnl: number;
  }>(sql, params);

  return rows.map(r => {
    const returnPct = r.earliest_equity > 0
      ? ((r.latest_equity - r.earliest_equity) / r.earliest_equity) * 100
      : 0;

    return {
      strategy_name: r.strategy_name,
      status: r.status,
      pnl: r.pnl,
      return_pct: returnPct,
      latest_equity: r.latest_equity,
      max_dd_pct: 0, // Computed client-side from equity curve
      sharpe: 0,     // Computed client-side
      sparkline: [], // Filled by separate query below
    };
  });
}

/**
 * Get sparkline data for a strategy (last 7d equity).
 */
export async function getStrategySparkline(
  strategyName: string,
  venue?: string
): Promise<number[]> {
  const params: unknown[] = [strategyName];
  let venueSql = '';

  if (venue && venue !== 'All') {
    venueSql = `AND es.venue = $2`;
    params.push(venue);
  }

  const sql = `
    SELECT SUM(es.equity) as equity
    FROM equity_snapshots es
    JOIN trading_sessions sess ON es.session_id = sess.session_id
    WHERE sess.strategy_name = $1
    AND es.ts > NOW() - INTERVAL '7 days'
    ${venueSql}
    GROUP BY time_bucket('6 hours', es.ts)
    ORDER BY time_bucket('6 hours', es.ts) ASC
  `;

  const rows = await query<{ equity: number }>(sql, params);
  return rows.map(r => r.equity);
}

/**
 * Get equity and PnL split by venue.
 */
export async function getVenueSplit(): Promise<VenueSplitRow[]> {
  const sql = `
    SELECT
      ts.venue,
      SUM(ts.equity) as equity,
      SUM(ts.realized_pnl) + SUM(ts.unrealized_pnl) as pnl
    FROM trading_state ts
    WHERE ts.position_qty != 0
    GROUP BY ts.venue
    ORDER BY ts.venue
  `;

  return query<VenueSplitRow>(sql);
}

/**
 * Get daily PnL attribution: price PnL vs fees vs funding.
 */
export async function getPnlAttribution(
  timeRange = '30D',
  venue?: string,
  strategies?: string[]
): Promise<PnlAttributionRow[]> {
  const interval = timeRangeToInterval(timeRange);

  const params: unknown[] = [];
  let idx = 1;
  let venueSqlFills = '';
  let venueSqlFunding = '';
  let stratSqlFills = '';
  let stratSqlFunding = '';

  if (venue && venue !== 'All') {
    venueSqlFills = `AND f.venue = $${idx}`;
    venueSqlFunding = `AND fp.venue = $${idx}`;
    params.push(venue);
    idx++;
  }
  if (strategies && strategies.length > 0) {
    stratSqlFills = `AND sess_f.strategy_name = ANY($${idx})`;
    stratSqlFunding = `AND sess_fp.strategy_name = ANY($${idx})`;
    params.push(strategies);
    idx++;
  }

  // Fees and realized PnL from fills
  const fillsSql = `
    SELECT
      DATE(f.ts) as date,
      SUM(COALESCE(f.realized_pnl, 0)) as price_pnl,
      SUM(COALESCE(ABS(f.fee), 0)) * -1 as fees
    FROM fills f
    ${strategies && strategies.length > 0 ? 'JOIN trading_sessions sess_f ON f.session_id = sess_f.session_id' : ''}
    WHERE f.ts > NOW() - INTERVAL '${interval}'
    ${venueSqlFills}
    ${stratSqlFills}
    GROUP BY DATE(f.ts)
  `;

  // Funding from funding_payments
  const fundingSql = `
    SELECT
      DATE(fp.ts) as date,
      SUM(fp.payment) as funding
    FROM funding_payments fp
    ${strategies && strategies.length > 0 ? 'JOIN trading_sessions sess_fp ON fp.session_id = sess_fp.session_id' : ''}
    WHERE fp.ts > NOW() - INTERVAL '${interval}'
    ${venueSqlFunding}
    ${stratSqlFunding}
    GROUP BY DATE(fp.ts)
  `;

  // Combine
  const combinedSql = `
    SELECT
      COALESCE(f.date, fp.date) as date,
      COALESCE(f.price_pnl, 0) as price_pnl,
      COALESCE(f.fees, 0) as fees,
      COALESCE(fp.funding, 0) as funding
    FROM (${fillsSql}) f
    FULL OUTER JOIN (${fundingSql}) fp ON f.date = fp.date
    ORDER BY COALESCE(f.date, fp.date) ASC
  `;

  return query<PnlAttributionRow>(combinedSql, params);
}

/**
 * Get recent fills across all strategies.
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
      f.realized_pnl,
      f.fill_role
    FROM fills f
    JOIN trading_sessions sess ON f.session_id = sess.session_id
    ORDER BY f.ts DESC
    LIMIT $1
  `;

  return query<RecentFill>(sql, [limit]);
}