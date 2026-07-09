/**
 * Position Lifecycle tracking queries.
 * Tracks each position from open (0->non-zero) to close (->0).
 */

import { query, queryOne } from '../db';

export interface PositionLifecycle {
  lifecycle_id: string;
  session_id: string;
  strategy_name: string;
  venue: string;
  symbol: string;
  side: string;
  open_time: string;
  close_time: string | null;
  status: 'OPEN' | 'CLOSED';
  holding_duration: string | null;
  open_price: number | null;
  close_price: number | null;
  position_size: number;
  notional: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  total_fee: number;
  total_funding: number;
  net_pnl: number;
}

/**
 * Get position lifecycles from current trading_state.
 * OPEN = position_qty != 0
 * CLOSED = position_qty = 0 (with realized_pnl from closes)
 */
export async function getPositionLifecycles(
  timeRange = 'ALL',
  venue?: string,
  strategy?: string,
  symbol?: string,
  status?: 'OPEN' | 'CLOSED' | 'ALL'
): Promise<PositionLifecycle[]> {
  const intervalMap: Record<string, string> = {
    '24H': '24 hours',
    '7D': '7 days',
    '30D': '30 days',
    '90D': '90 days',
    'ALL': '1000 days',
  };
  const interval = intervalMap[timeRange] || '1000 days';

  // Build WHERE clauses
  const venueFilter = venue && venue !== 'all' ? `AND venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND symbol = '${symbol}'` : '';
  
  let statusFilter = '';
  if (status && status !== 'ALL') {
    if (status === 'OPEN') {
      statusFilter = 'AND position_qty != 0';
    } else if (status === 'CLOSED') {
      statusFilter = 'AND position_qty = 0 AND realized_pnl != 0';
    }
  }

  const sql = `
    SELECT 
      MD5(session_id || symbol || COALESCE(config_name, 'default') || updated_at) as lifecycle_id,
      session_id,
      strategy_name,
      venue,
      symbol,
      CASE WHEN position_qty > 0 THEN 'LONG' ELSE 'SHORT' END as side,
      last_trade_ts as open_time,
      CASE WHEN position_qty = 0 THEN updated_at ELSE NULL END as close_time,
      CASE WHEN position_qty != 0 THEN 'OPEN' ELSE 'CLOSED' END as status,
      CASE 
        WHEN position_qty != 0 THEN NULL
        ELSE AGE(updated_at, COALESCE(last_trade_ts, updated_at))
      END as holding_duration,
      avg_entry_price as open_price,
      CASE WHEN position_qty = 0 THEN mark_price ELSE NULL END as close_price,
      ABS(position_qty) as position_size,
      COALESCE(position_notional_usd, ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0))) as notional,
      realized_pnl,
      unrealized_pnl,
      realized_pnl + unrealized_pnl as total_pnl,
      COALESCE(cumulative_open_fee, 0) + COALESCE(cumulative_close_fee, 0) as total_fee,
      COALESCE(funding_accrued, 0) as total_funding,
      realized_pnl + unrealized_pnl - (COALESCE(cumulative_open_fee, 0) + COALESCE(cumulative_close_fee, 0)) + COALESCE(funding_accrued, 0) as net_pnl
    FROM trading_state
    WHERE updated_at > NOW() - INTERVAL '${interval}'
    ${venueFilter}
    ${strategyFilter}
    ${symbolFilter}
    ${statusFilter}
    ORDER BY updated_at DESC
    LIMIT 500
  `;

  return query<PositionLifecycle>(sql);
}

/**
 * Get lifecycle totals for summary.
 */
export async function getLifecycleTotals(
  timeRange = 'ALL'
): Promise<any> {
  const intervalMap: Record<string, string> = {
    '24H': '24 hours',
    '7D': '7 days',
    '30D': '30 days',
    '90D': '90 days',
    'ALL': '1000 days',
  };
  const interval = intervalMap[timeRange] || '1000 days';

  const sql = `
    SELECT 
      COUNT(*) as total_lifecycles,
      COUNT(CASE WHEN position_qty != 0 THEN 1 END) as open_count,
      COUNT(CASE WHEN position_qty = 0 AND realized_pnl != 0 THEN 1 END) as closed_count,
      SUM(realized_pnl) as total_realized_pnl,
      SUM(unrealized_pnl) as total_unrealized_pnl,
      SUM(COALESCE(cumulative_open_fee, 0) + COALESCE(cumulative_close_fee, 0)) as total_fees,
      SUM(COALESCE(funding_accrued, 0)) as total_funding,
      SUM(realized_pnl + unrealized_pnl - (COALESCE(cumulative_open_fee, 0) + COALESCE(cumulative_close_fee, 0)) + COALESCE(funding_accrued, 0)) as total_net_pnl
    FROM trading_state
    WHERE updated_at > NOW() - INTERVAL '${interval}'
  `;

  return queryOne(sql);
}
