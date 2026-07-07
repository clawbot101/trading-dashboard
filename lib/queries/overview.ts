/**
 * SQL queries for the Overview page.
 * Fixed for actual production schema.
 */

import { query, queryOne, db } from '../db';

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
}

export interface StrategyLeaderboardRow {
  strategy_name: string;
  status: string;
  pnl: number;
  return_pct: number;
  latest_equity: number;
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

/**
 * Get overview stats from trading_state and equity_snapshots.
 */
export async function getOverviewStats(
  timeRange = '24H',
  venue?: string,
  strategies?: string[]
): Promise<OverviewStats | null> {
  const interval = timeRangeToInterval(timeRange);

  // Get latest equity from equity_snapshots (most reliable source)
  const latestRow = await queryOne<any>(`
    SELECT SUM(equity) as equity FROM equity_snapshots
    WHERE ts = (SELECT MAX(ts) FROM equity_snapshots WHERE ts > NOW() - INTERVAL '${interval}')
  `);

  // Earliest equity in range for PnL calculation
  const earliestRow = await queryOne<any>(`
    SELECT SUM(equity) as equity FROM equity_snapshots
    WHERE ts = (SELECT MIN(ts) FROM equity_snapshots WHERE ts > NOW() - INTERVAL '${interval}')
  `);

  // Stats from trading_state for positions
  const stateRow = await queryOne<any>(`
    SELECT
      COALESCE(SUM(unrealized_pnl), 0) as total_unrealized_pnl,
      COALESCE(SUM(realized_pnl), 0) as total_realized_pnl,
      COUNT(CASE WHEN position_qty != 0 THEN 1 END) as open_positions,
      COALESCE(SUM(ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0))), 0) as gross_exposure
    FROM trading_state
    WHERE position_qty != 0
  `);

  const equityNow = latestRow?.equity || 0;
  const equityAgo = earliestRow?.equity || equityNow;
  const pnl24h = equityNow - equityAgo;
  const pnl24hPct = equityAgo > 0 ? (pnl24h / equityAgo) * 100 : 0;

  return {
    total_equity: equityNow,
    pnl_24h: pnl24h,
    pnl_24h_pct: pnl24hPct,
    total_unrealized_pnl: stateRow?.total_unrealized_pnl || 0,
    total_realized_pnl: stateRow?.total_realized_pnl || 0,
    max_drawdown_pct: 0,
    open_positions: stateRow?.open_positions || 0,
    gross_exposure: stateRow?.gross_exposure || 0,
    equity_24h_ago: equityAgo,
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
  const interval = timeRangeToInterval(timeRange);

  const sql = `
    SELECT 
      ts,
      SUM(equity) as equity
    FROM equity_snapshots
    WHERE ts > NOW() - INTERVAL '${interval}'
    GROUP BY ts
    ORDER BY ts ASC
    LIMIT 500
  `;

  return query<EquityCurvePoint>(sql);
}

/**
 * Strategy leaderboard.
 */
export async function getStrategyLeaderboard(
  timeRange = '24H',
  venue?: string
): Promise<StrategyLeaderboardRow[]> {
  const sql = `
    SELECT 
      ts.strategy_name,
      'running' as status,
      COALESCE(SUM(ts.realized_pnl + ts.unrealized_pnl), 0) as pnl,
      COALESCE(SUM(ts.equity), 0) as latest_equity
    FROM trading_state ts
    WHERE ts.position_qty != 0
    GROUP BY ts.strategy_name
    ORDER BY pnl DESC
    LIMIT 10
  `;

  const rows = await query<any>(sql);

  return rows.map(r => ({
    strategy_name: r.strategy_name,
    status: r.status || 'unknown',
    pnl: Number(r.pnl) || 0,
    return_pct: Number(r.latest_equity) > 0 ? (Number(r.pnl) / Number(r.latest_equity)) * 100 : 0,
    latest_equity: Number(r.latest_equity) || 0,
  }));
}

/**
 * Venue split.
 */
export async function getVenueSplit(): Promise<VenueSplitRow[]> {
  const sql = `
    SELECT 
      venue,
      SUM(equity) as equity,
      SUM(realized_pnl + unrealized_pnl) as pnl
    FROM trading_state
    WHERE position_qty != 0
    GROUP BY venue
    ORDER BY venue
  `;

  return query<VenueSplitRow>(sql);
}

/**
 * Recent fills - without realized_pnl (column doesn't exist in prod).
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
    JOIN trading_sessions sess ON f.session_id = sess.session_id
    ORDER BY f.ts DESC
    LIMIT $1
  `;

  return query<RecentFill>(sql, [limit]);
}

/**
 * PnL attribution - using equity_snapshots instead of fills.
 */
export async function getPnlAttribution(
  timeRange = '30D',
  venue?: string,
  strategies?: string[]
): Promise<any[]> {
  const interval = timeRangeToInterval(timeRange);

  const sql = `
    SELECT 
      DATE(ts) as date,
      SUM(realized_pnl) as price_pnl,
      0 as fees,
      0 as funding
    FROM equity_snapshots
    WHERE ts > NOW() - INTERVAL '${interval}'
    GROUP BY DATE(ts)
    ORDER BY DATE(ts) ASC
    LIMIT 30
  `;

  return query<any>(sql);
}