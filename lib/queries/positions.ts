/**
 * SQL queries for the Live Positions page.
 */

import { query, queryOne, TradingState, OrderEvent } from '../db';

// ============== TYPES ==============

export interface LivePosition extends TradingState {
  notional: number;
  side: 'LONG' | 'SHORT' | 'FLAT';
}

export interface PositionSummary {
  total_notional_long: number;
  total_notional_short: number;
  net_exposure: number;
  gross_leverage: number;
  total_unrealized_pnl: number;
}

export interface OpenOrder {
  strategy_order_id: string;
  symbol: string;
  side: string;
  order_type: string;
  price: number | null;
  qty: number | null;
  event_status: string;
  created_ts: string;
  venue: string;
}

// ============== QUERIES ==============

/**
 * Get all live positions (where position_qty != 0).
 */
export async function getLivePositions(
  venue?: string,
  strategy?: string
): Promise<LivePosition[]> {
  const params: unknown[] = [];
  let idx = 1;
  const filters: string[] = [];

  if (venue && venue !== 'All') {
    filters.push(`venue = $${idx}`);
    params.push(venue);
    idx++;
  }

  if (strategy) {
    filters.push(`strategy_name = $${idx}`);
    params.push(strategy);
    idx++;
  }

  const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

  const sql = `
    SELECT
      state_key,
      updated_at,
      session_id,
      strategy_name,
      strategy_slot,
      venue,
      account_id,
      symbol,
      base_asset,
      quote_asset,
      position_qty,
      avg_entry_price,
      mark_price,
      unrealized_pnl,
      realized_pnl,
      leverage,
      equity,
      cash_balance,
      config_name,
      liquidation_price,
      margin,
      funding_accrued,
      stop_price,
      take_profit_price,
      ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0)) as notional,
      CASE 
        WHEN position_qty > 0 THEN 'LONG'
        WHEN position_qty < 0 THEN 'SHORT'
        ELSE 'FLAT'
      END as side
    FROM trading_state
    WHERE position_qty != 0
    ${whereClause}
    ORDER BY ABS(unrealized_pnl) DESC
  `;

  return query<LivePosition>(sql, params);
}

/**
 * Get position summary stats.
 */
export async function getPositionSummary(
  venue?: string,
  strategy?: string
): Promise<PositionSummary | null> {
  const params: unknown[] = [];
  let idx = 1;
  const filters: string[] = [];

  if (venue && venue !== 'All') {
    filters.push(`venue = $${idx}`);
    params.push(venue);
    idx++;
  }

  if (strategy) {
    filters.push(`strategy_name = $${idx}`);
    params.push(strategy);
    idx++;
  }

  const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

  const sql = `
    SELECT
      SUM(CASE WHEN position_qty > 0 THEN ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0)) ELSE 0 END) as total_notional_long,
      SUM(CASE WHEN position_qty < 0 THEN ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0)) ELSE 0 END) as total_notional_short,
      SUM(position_qty * COALESCE(mark_price, avg_entry_price, 0)) as net_exposure,
      AVG(CASE WHEN position_qty != 0 AND leverage IS NOT NULL THEN ABS(leverage) ELSE NULL END) as gross_leverage,
      SUM(unrealized_pnl) as total_unrealized_pnl
    FROM trading_state
    WHERE position_qty != 0
    ${whereClause}
  `;

  return queryOne<PositionSummary>(sql, params);
}

/**
 * Get open orders for a symbol and session.
 * Gets latest event per strategy_order_id where status is open/pending.
 */
export async function getOpenOrders(
  symbol?: string,
  sessionId?: string
): Promise<OpenOrder[]> {
  const params: unknown[] = [];
  let idx = 1;
  const filters: string[] = [];

  if (symbol) {
    filters.push(`oe.symbol = $${idx}`);
    params.push(symbol);
    idx++;
  }

  if (sessionId) {
    filters.push(`oe.session_id = $${idx}`);
    params.push(sessionId);
    idx++;
  }

  const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

  const sql = `
    SELECT DISTINCT ON (oe.strategy_order_id)
      oe.strategy_order_id,
      oe.symbol,
      oe.side,
      oe.order_type,
      oe.price,
      oe.qty,
      oe.event_status,
      oe.ts as created_ts,
      oe.venue
    FROM order_events oe
    WHERE oe.event_status IN ('open', 'pending', 'new', 'submitted')
    ${whereClause}
    ORDER BY oe.strategy_order_id, oe.ts DESC
  `;

  return query<OpenOrder>(sql, params);
}

/**
 * Get recent fills for a specific position (symbol + session).
 */
export async function getPositionFills(
  symbol: string,
  sessionId?: string,
  limit = 10
): Promise<{ ts: string; side: string; fill_price: number; fill_qty: number; realized_pnl: number | null }[]> {
  const params: unknown[] = [symbol, limit];
  let sessionFilter = '';

  if (sessionId) {
    sessionFilter = `AND session_id = $3`;
    params.push(sessionId);
  }

  const sql = `
    SELECT
      ts,
      side,
      fill_price,
      fill_qty,
      realized_pnl
    FROM fills
    WHERE symbol = $1
    ${sessionFilter}
    ORDER BY ts DESC
    LIMIT $2
  `;

  return query<{ ts: string; side: string; fill_price: number; fill_qty: number; realized_pnl: number | null }>(sql, params);
}

/**
 * Get all open orders across all positions (for expandable rows).
 */
export async function getAllOpenOrders(
  venue?: string,
  strategy?: string
): Promise<OpenOrder[]> {
  const params: unknown[] = [];
  let idx = 1;
  const filters: string[] = [];

  if (venue && venue !== 'All') {
    filters.push(`oe.venue = $${idx}`);
    params.push(venue);
    idx++;
  }

  if (strategy) {
    filters.push(`sess.strategy_name = $${idx}`);
    params.push(strategy);
    idx++;
  }

  const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

  const sql = `
    SELECT DISTINCT ON (oe.strategy_order_id)
      oe.strategy_order_id,
      oe.symbol,
      oe.side,
      oe.order_type,
      oe.price,
      oe.qty,
      oe.event_status,
      oe.ts as created_ts,
      oe.venue
    FROM order_events oe
    JOIN trading_sessions sess ON oe.session_id = sess.session_id
    WHERE oe.event_status IN ('open', 'pending', 'new', 'submitted')
    ${whereClause}
    ORDER BY oe.strategy_order_id, oe.ts DESC
  `;

  return query<OpenOrder>(sql, params);
}