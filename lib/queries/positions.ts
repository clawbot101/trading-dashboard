/**
 * SQL queries for the Live Positions page.
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
  margin: number | null;
  funding_accrued: number | null;
  notional: number;
  side: string;
}

export interface PositionSummary {
  total_notional_long: number;
  total_notional_short: number;
  net_exposure: number;
  gross_leverage: number;
  total_unrealized_pnl: number;
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
      margin,
      funding_accrued,
      ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0)) as notional,
      CASE 
        WHEN position_qty > 0 THEN 'LONG'
        WHEN position_qty < 0 THEN 'SHORT'
        ELSE 'FLAT'
      END as side
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
      SUM(CASE WHEN position_qty > 0 THEN ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0)) ELSE 0 END) as total_notional_long,
      SUM(CASE WHEN position_qty < 0 THEN ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0)) ELSE 0 END) as total_notional_short,
      SUM(position_qty * COALESCE(mark_price, avg_entry_price, 0)) as net_exposure,
      AVG(CASE WHEN position_qty != 0 AND leverage IS NOT NULL THEN ABS(leverage) ELSE NULL END) as gross_leverage,
      SUM(unrealized_pnl) as total_unrealized_pnl
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