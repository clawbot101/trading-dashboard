/**
 * SQL queries for the Trades & Orders page.
 */

import { query, queryOne } from '../db';

export interface FillRow {
  fill_id: string;
  ts: string;
  session_id: string | null;
  venue: string;
  symbol: string;
  side: string;
  fill_price: number;
  fill_qty: number;
  fee: number | null;
  strategy_order_id: string | null;
  broker_order_id: string | null;
  notional: number;
  is_maker: boolean | null;
  realized_pnl: number | null;
}

export interface FillTotals {
  total_rows: number;
  total_qty: number;
  total_notional: number;
  total_fee: number;
  total_realized_pnl: number;
}

export interface OrderEventRow {
  event_id: string;
  ts: string;
  session_id: string | null;
  venue: string;
  symbol: string;
  side: string;
  order_type: string;
  event_type: string;
  event_status: string;
  price: number | null;
  qty: number | null;
  strategy_order_id: string | null;
  broker_order_id: string | null;
  note: string | null;
}

export interface OrderEventTotals {
  total_rows: number;
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
 * Get paginated fills from fills table.
 */
export async function getFills(
  from_ts: string,
  to_ts: string,
  venue?: string,
  strategy?: string,
  symbol?: string,
  page = 1,
  pageSize = 50
): Promise<FillRow[]> {
  const offset = (page - 1) * pageSize;

  const venueFilter = venue && venue !== 'all' ? `AND venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND symbol = '${symbol}'` : '';

  const sql = `
    SELECT 
      f.fill_id,
      f.ts,
      f.session_id,
      f.venue,
      f.symbol,
      f.side,
      f.fill_price,
      f.fill_qty,
      f.fee,
      f.strategy_order_id,
      f.broker_order_id,
      f.is_maker,
      f.realized_pnl,
      ABS(f.fill_qty * f.fill_price) as notional
    FROM fills f
    WHERE f.ts >= '${from_ts}' AND f.ts <= '${to_ts}'
    ${venueFilter}
    ${strategyFilter}
    ${symbolFilter}
    ORDER BY f.ts DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  return query<FillRow>(sql);
}

/**
 * Get total fill count for pagination.
 */
export async function getFillCount(
  from_ts: string,
  to_ts: string,
  venue?: string,
  strategy?: string,
  symbol?: string
): Promise<number> {
  const venueFilter = venue && venue !== 'all' ? `AND venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND symbol = '${symbol}'` : '';

  const sql = `
    SELECT COUNT(*) as count
    FROM fills f
    WHERE f.ts >= '${from_ts}' AND f.ts <= '${to_ts}'
    ${venueFilter}
    ${strategyFilter}
    ${symbolFilter}
  `;

  const result = await queryOne<{ count: number }>(sql);
  return result?.count || 0;
}

/**
 * Get fill totals for summary.
 */
export async function getFillTotals(
  from_ts: string,
  to_ts: string,
  venue?: string,
  strategy?: string,
  symbol?: string
): Promise<FillTotals | null> {
  const venueFilter = venue && venue !== 'all' ? `AND venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND symbol = '${symbol}'` : '';

  const sql = `
    SELECT
      COUNT(*) as total_rows,
      SUM(fill_qty) as total_qty,
      SUM(ABS(fill_qty * fill_price)) as total_notional,
      SUM(ABS(COALESCE(fee, 0))) as total_fee,
      SUM(COALESCE(realized_pnl, 0)) as total_realized_pnl
    FROM fills
    WHERE ts >= '${from_ts}' AND ts <= '${to_ts}'
    ${venueFilter}
    ${strategyFilter}
    ${symbolFilter}
  `;

  return queryOne<FillTotals>(sql);
}

/**
 * Get order events from order_events table.
 */
export async function getOrderEvents(
  from_ts: string,
  to_ts: string,
  venue?: string,
  strategy?: string,
  symbol?: string,
  page = 1,
  pageSize = 50
): Promise<OrderEventRow[]> {
  const offset = (page - 1) * pageSize;

  const venueFilter = venue && venue !== 'all' ? `AND venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND symbol = '${symbol}'` : '';

  const sql = `
    SELECT 
      MD5(session_id || symbol || ts || strategy_order_id) as event_id,
      ts,
      session_id,
      venue,
      symbol,
      side,
      order_type,
      event_type,
      event_status,
      price,
      qty,
      strategy_order_id,
      broker_order_id,
      note
    FROM order_events
    WHERE ts >= '${from_ts}' AND ts <= '${to_ts}'
    ${venueFilter}
    ${strategyFilter}
    ${symbolFilter}
    ORDER BY ts DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  return query<OrderEventRow>(sql);
}

/**
 * Get order event count for pagination.
 */
export async function getOrderEventCount(
  from_ts: string,
  to_ts: string,
  venue?: string,
  strategy?: string,
  symbol?: string
): Promise<number> {
  const venueFilter = venue && venue !== 'all' ? `AND venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND symbol = '${symbol}'` : '';

  const sql = `
    SELECT COUNT(*) as count
    FROM order_events
    WHERE ts >= '${from_ts}' AND ts <= '${to_ts}'
    ${venueFilter}
    ${strategyFilter}
    ${symbolFilter}
  `;

  const result = await queryOne<{ count: number }>(sql);
  return result?.count || 0;
}