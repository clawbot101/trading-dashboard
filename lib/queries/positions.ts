/**
 * SQL queries for the Live Positions page.
 * Fixed for actual production schema.
 */

import { query, queryOne, db } from '../db';

export interface LivePosition {
  state_key: string;
  updated_at: string;
  session_id: string | null;
  strategy_name: string;
  venue: string;
  symbol: string;
  position_qty: number;
  avg_entry_price: number | null;
  mark_price: number | null;
  unrealized_pnl: number;
  realized_pnl: number;
  leverage: number | null;
  equity: number | null;
  notional: number;
  side: string;
  liquidation_price: number | null;
  margin: number | null;
  funding_accrued: number | null;
  funding_rate: number | null;
  cumulative_fee: number | null;
  cumulative_open_fee: number | null;
  cumulative_close_fee: number | null;
  last_trade_fee: number | null;
  last_trade_ts: string | null;
}

export interface PositionSummary {
  total_notional_long: number;
  total_notional_short: number;
  net_exposure: number;
  gross_leverage: number;
  total_unrealized_pnl: number;
  total_funding: number | null;
  total_margin: number | null;
}

/**
 * Get all live positions.
 */
export async function getLivePositions(
  venue?: string,
  strategy?: string
): Promise<LivePosition[]> {
  const sql = `
    SELECT 
      state_key,
      updated_at,
      session_id,
      strategy_name,
      venue,
      symbol,
      position_qty,
      avg_entry_price,
      mark_price,
      unrealized_pnl,
      realized_pnl,
      leverage,
      equity,
      COALESCE(position_notional_usd, ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0))) as notional,
      CASE 
        WHEN position_qty > 0 THEN 'LONG'
        WHEN position_qty < 0 THEN 'SHORT'
        ELSE 'FLAT'
      END as side,
      liquidation_price,
      margin,
      funding_accrued,
      funding_rate,
      cumulative_fee,
      cumulative_open_fee,
      cumulative_close_fee,
      last_trade_fee,
      last_trade_ts
    FROM trading_state
    WHERE position_qty != 0
    ORDER BY ABS(unrealized_pnl) DESC
  `;

  return query<LivePosition>(sql);
}

/**
 * Get position summary.
 */
export async function getPositionSummary(
  venue?: string,
  strategy?: string
): Promise<PositionSummary | null> {
  const sql = `
    SELECT
      SUM(CASE WHEN position_qty > 0 THEN COALESCE(position_notional_usd, ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0))) ELSE 0 END) as total_notional_long,
      SUM(CASE WHEN position_qty < 0 THEN COALESCE(position_notional_usd, ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0))) ELSE 0 END) as total_notional_short,
      SUM(position_qty * COALESCE(mark_price, avg_entry_price, 0)) as net_exposure,
      AVG(CASE WHEN position_qty != 0 AND leverage IS NOT NULL THEN ABS(leverage) ELSE NULL END) as gross_leverage,
      SUM(unrealized_pnl) as total_unrealized_pnl,
      SUM(funding_accrued) as total_funding,
      SUM(margin) as total_margin
    FROM trading_state
    WHERE position_qty != 0
  `;

  return queryOne<PositionSummary>(sql);
}

/**
 * Get open orders.
 */
export async function getAllOpenOrders(
  venue?: string,
  strategy?: string
): Promise<any[]> {
  const sql = `
    SELECT DISTINCT ON (strategy_order_id)
      strategy_order_id,
      symbol,
      side,
      order_type,
      price,
      qty,
      event_status,
      ts as created_ts,
      venue
    FROM order_events
    WHERE event_status IN ('open', 'pending', 'new', 'submitted')
    AND strategy_order_id IS NOT NULL
    ORDER BY strategy_order_id, ts DESC
    LIMIT 50
  `;

  return query<any>(sql);
}

/**
 * Get recent fills for a symbol/session.
 */
export async function getRecentFillsForPosition(
  symbol: string,
  strategyName?: string,
  limit = 10
): Promise<any[]> {
  const sql = `
    SELECT 
      f.ts,
      f.symbol,
      f.side,
      f.fill_qty,
      f.fill_price,
      f.fee,
      sess.strategy_name
    FROM fills f
    JOIN trading_sessions sess ON f.session_id = sess.session_id
    WHERE f.symbol = $1
    ${strategyName ? 'AND sess.strategy_name = $2' : ''}
    ORDER BY f.ts DESC
    LIMIT ${strategyName ? '$3' : '$2'}
  `;

  const params = strategyName
    ? [symbol, strategyName, limit]
    : [symbol, limit];

  return query<any>(sql, params);
}

/**
 * Get recent funding payments.
 */
export async function getRecentFundingPayments(
  limit = 20
): Promise<any[]> {
  const sql = `
    SELECT 
      ts,
      session_id,
      venue,
      symbol,
      funding_rate,
      position_qty,
      mark_price,
      payment_amount
    FROM funding_payments
    ORDER BY ts DESC
    LIMIT $1
  `;

  return query<any>(sql, [limit]);
}