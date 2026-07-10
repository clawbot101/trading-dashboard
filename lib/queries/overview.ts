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
  total_funding: number;
  total_margin: number;
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
 * Net PnL = equity(now) - equity(24h ago)
 */
export async function getOverviewStats(
  timeRange = '24H',
  venue?: string,
  strategies?: string[]
): Promise<OverviewStats | null> {
  const { from_ts, to_ts } = timeRangeToTimestamps(timeRange);

  // Latest equity from snapshots (source of truth)
  const latestRow = await queryOne<any>(`
    SELECT SUM(equity) as equity FROM equity_snapshots
    WHERE ts = (SELECT MAX(ts) FROM equity_snapshots WHERE ts <= '${to_ts}')
  `);

  // Equity 24h ago for PnL calculation
  const equity24hRow = await queryOne<any>(`
    SELECT SUM(equity) as equity FROM equity_snapshots
    WHERE ts <= NOW() - INTERVAL '24 hours'
    ORDER BY ts DESC
    LIMIT 1
  `);

  // Stats from trading_state for positions
  const stateRow = await queryOne<any>(`
    SELECT
      COALESCE(SUM(unrealized_pnl), 0) as total_unrealized_pnl,
      COALESCE(SUM(realized_pnl), 0) as total_realized_pnl,
      COUNT(CASE WHEN position_qty != 0 THEN 1 END) as open_positions,
      COALESCE(SUM(COALESCE(position_notional_usd, ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0)))), 0) as gross_exposure
    FROM trading_state
    WHERE position_qty != 0
  `);

  const equityNow = latestRow?.equity || 0;
  const equity24hAgo = equity24hRow?.equity || equityNow;
  const pnl24h = equityNow - equity24hAgo;
  const pnl24hPct = equity24hAgo > 0 ? (pnl24h / equity24hAgo) * 100 : 0;

  return {
    total_equity: equityNow,
    pnl_24h: pnl24h,
    pnl_24h_pct: pnl24hPct,
    total_unrealized_pnl: stateRow?.total_unrealized_pnl || 0,
    total_realized_pnl: stateRow?.total_realized_pnl || 0,
    total_funding: 0,
    total_margin: 0,
    max_drawdown_pct: 0,
    open_positions: stateRow?.open_positions || 0,
    gross_exposure: stateRow?.gross_exposure || 0,
    equity_24h_ago: equity24hAgo,
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
      COALESCE(SUM(ts.equity), 0) as latest_equity,
      COALESCE(SUM(COALESCE(ts.position_notional_usd, ABS(ts.position_qty * COALESCE(ts.mark_price, ts.avg_entry_price, 0)))), 0) as notional
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
    notional: Number(r.notional) || 0,
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
      f.fee
    FROM fills f
    LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
    ORDER BY f.ts DESC
    LIMIT $1
  `;

  return query<RecentFill>(sql, [limit]);
}

/**
 * PnL attribution - daily breakdown of price change, fees, and funding.
 */
export async function getPnlAttribution(
  timeRange = '30D',
  venue?: string,
  strategies?: string[]
): Promise<any[]> {
  const interval = timeRangeToInterval(timeRange);

  // Get daily equity changes (price PnL)
  const equityByDay = await query<any>(`
    SELECT 
      DATE(ts) as date,
      SUM(equity) as daily_equity
    FROM equity_snapshots
    WHERE ts > NOW() - INTERVAL '${interval}'
    GROUP BY DATE(ts)
    ORDER BY DATE(ts) ASC
    LIMIT 30
  `);

  // Get daily fees from fills
  const feesByDay = await query<any>(`
    SELECT 
      DATE(ts) as date,
      SUM(ABS(COALESCE(fee, 0))) as daily_fees
    FROM fills
    WHERE ts > NOW() - INTERVAL '${interval}'
    GROUP BY DATE(ts)
  `);

  // Get daily funding from funding_payments
  const fundingByDay = await query<any>(`
    SELECT 
      DATE(ts) as date,
      SUM(COALESCE(payment_amount, 0)) as daily_funding
    FROM funding_payments
    WHERE ts > NOW() - INTERVAL '${interval}'
    GROUP BY DATE(ts)
  `);

  // Merge all data
  const feesMap = new Map(feesByDay.map(f => [f.date, f.daily_fees]));
  const fundingMap = new Map(fundingByDay.map(f => [f.date, f.daily_funding]));

  // Compute daily price PnL (change in equity from previous day)
  const result = equityByDay.map((row, i) => {
    const prevEquity = i > 0 ? equityByDay[i - 1]?.daily_equity || row.daily_equity : row.daily_equity;
    const pricePnl = row.daily_equity - prevEquity;
    const fees = feesMap.get(row.date) || 0;
    const funding = fundingMap.get(row.date) || 0;

    return {
      date: row.date,
      price_pnl: pricePnl,
      fees: -fees, // fees are negative (cost)
      funding: funding,
    };
  });

  return result;
}