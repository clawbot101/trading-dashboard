/**
 * SQL queries for the Overview page.
 * Simplified version - working SQL only.
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
  realized_pnl: number | null;
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
 * Get overview stats from trading_state.
 */
export async function getOverviewStats(
  timeRange = '24H',
  venue?: string,
  strategies?: string[]
): Promise<OverviewStats | null> {
  // Simple aggregation from trading_state
  const sql = `
    SELECT
      COALESCE(SUM(equity), 0) as total_equity,
      COALESCE(SUM(unrealized_pnl), 0) as total_unrealized_pnl,
      COALESCE(SUM(realized_pnl), 0) as total_realized_pnl,
      COUNT(CASE WHEN position_qty != 0 THEN 1 END) as open_positions,
      COALESCE(SUM(ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0))), 0) as gross_exposure
    FROM trading_state
    WHERE position_qty != 0
  `;

  const row = await queryOne<any>(sql);

  // Get equity snapshots for 24h comparison
  const interval = timeRangeToInterval(timeRange);
  const equitySql = `
    SELECT 
      (SELECT SUM(equity) FROM equity_snapshots WHERE ts > NOW() - INTERVAL '${interval}' ORDER BY ts DESC LIMIT 1) as equity_now,
      (SELECT SUM(equity) FROM equity_snapshots WHERE ts > NOW() - INTERVAL '${interval}' ORDER BY ts ASC LIMIT 1) as equity_ago
  `;

  const equityRow = await queryOne<any>(equitySql);

  const equityNow = equityRow?.equity_now || row?.total_equity || 0;
  const equityAgo = equityRow?.equity_ago || row?.total_equity || 0;
  const pnl24h = equityNow - equityAgo;
  const pnl24hPct = equityAgo > 0 ? (pnl24h / equityAgo) * 100 : 0;

  // Simple max drawdown calculation
  const ddSql = `
    SELECT 
      COALESCE(
        (SELECT MAX(peak - equity) / MAX(peak) * 100 
         FROM (
           SELECT equity, MAX(equity) OVER (ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as peak
           FROM equity_snapshots 
           WHERE ts > NOW() - INTERVAL '${interval}'
         ) sub
        ), 0
      ) as max_drawdown_pct
  `;

  const ddRow = await queryOne<any>(ddSql);

  return {
    total_equity: row?.total_equity || 0,
    pnl_24h: pnl24h,
    pnl_24h_pct: pnl24hPct,
    total_unrealized_pnl: row?.total_unrealized_pnl || 0,
    total_realized_pnl: row?.total_realized_pnl || 0,
    max_drawdown_pct: ddRow?.max_drawdown_pct || 0,
    open_positions: row?.open_positions || 0,
    gross_exposure: row?.gross_exposure || 0,
    equity_24h_ago: equityAgo,
  };
}

/**
 * Get equity curve - simple aggregation.
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
 * Strategy leaderboard - simplified.
 */
export async function getStrategyLeaderboard(
  timeRange = '24H',
  venue?: string
): Promise<StrategyLeaderboardRow[]> {
  const sql = `
    SELECT 
      strategy_name,
      status,
      SUM(realized_pnl + unrealized_pnl) as pnl,
      SUM(equity) as latest_equity
    FROM trading_state ts
    JOIN trading_sessions sess ON ts.session_id = sess.session_id
    WHERE ts.position_qty != 0
    GROUP BY strategy_name, status
    ORDER BY pnl DESC
    LIMIT 10
  `;

  const rows = await query<any>(sql);

  return rows.map(r => ({
    strategy_name: r.strategy_name,
    status: r.status || 'unknown',
    pnl: r.pnl || 0,
    return_pct: r.latest_equity > 0 ? (r.pnl / r.latest_equity) * 100 : 0,
    latest_equity: r.latest_equity || 0,
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
      f.realized_pnl
    FROM fills f
    JOIN trading_sessions sess ON f.session_id = sess.session_id
    ORDER BY f.ts DESC
    LIMIT $1
  `;

  return query<RecentFill>(sql, [limit]);
}

/**
 * PnL attribution - simplified.
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
    FROM fills
    WHERE ts > NOW() - INTERVAL '${interval}'
    GROUP BY DATE(ts)
    ORDER BY date ASC
    LIMIT 30
  `;

  return query<any>(sql);
}