/**
 * SQL queries for the Trades & Orders page.
 */

import { query, queryOne, db } from '../db';

export interface FillRow {
  fill_id: string;
  ts: string;
  session_id: string;
  venue: string;
  symbol: string;
  side: string;
  fill_price: number;
  fill_qty: number;
  fee: number | null;
  realized_pnl: number | null;
  is_maker: boolean | null;
  strategy_name: string;
  notional: number;
}

export interface FillTotals {
  total_qty: number;
  total_notional: number;
  total_fee: number;
  total_realized_pnl: number;
}

export interface OrderEventGroup {
  strategy_order_id: string;
  symbol: string;
  venue: string;
  side: string;
  order_type: string;
  latest_status: string;
  created_ts: string;
  latest_ts: string;
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
 * Get paginated fills.
 */
export async function getFills(
  timeRange = '24H',
  venue?: string,
  strategy?: string,
  symbol?: string,
  side?: string,
  isMaker?: boolean,
  page = 1,
  pageSize = 50
): Promise<FillRow[]> {
  const interval = timeRangeToInterval(timeRange);
  const offset = (page - 1) * pageSize;

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
      f.realized_pnl,
      f.is_maker,
      sess.strategy_name,
      ABS(f.fill_qty * f.fill_price) as notional
    FROM fills f
    JOIN trading_sessions sess ON f.session_id = sess.session_id
    WHERE f.ts > NOW() - INTERVAL '${interval}'
    ORDER BY f.ts DESC
    LIMIT $1 OFFSET $2
  `;

  return query<FillRow>(sql, [pageSize, offset]);
}

/**
 * Get fill totals.
 */
export async function getFillTotals(
  timeRange = '24H',
  venue?: string,
  strategy?: string,
  symbol?: string,
  side?: string,
  isMaker?: boolean
): Promise<FillTotals | null> {
  const interval = timeRangeToInterval(timeRange);

  const sql = `
    SELECT
      SUM(fill_qty) as total_qty,
      SUM(ABS(fill_qty * fill_price)) as total_notional,
      SUM(ABS(COALESCE(fee, 0))) as total_fee,
      SUM(COALESCE(realized_pnl, 0)) as total_realized_pnl
    FROM fills
    WHERE ts > NOW() - INTERVAL '${interval}'
  `;

  return queryOne<FillTotals>(sql);
}

/**
 * Get order events grouped.
 */
export async function getOrderEvents(
  timeRange = '24H',
  venue?: string,
  strategy?: string,
  symbol?: string,
  page = 1,
  pageSize = 50
): Promise<OrderEventGroup[]> {
  const interval = timeRangeToInterval(timeRange);
  const offset = (page - 1) * pageSize;

  const sql = `
    SELECT 
      strategy_order_id,
      symbol,
      venue,
      side,
      order_type,
      event_status as latest_status,
      ts as created_ts,
      ts as latest_ts
    FROM order_events
    WHERE ts > NOW() - INTERVAL '${interval}'
    AND strategy_order_id IS NOT NULL
    ORDER BY ts DESC
    LIMIT $1 OFFSET $2
  `;

  return query<OrderEventGroup>(sql, [pageSize, offset]);
}

/**
 * Get distinct strategies.
 */
export async function getDistinctStrategies(): Promise<string[]> {
  const sql = `SELECT DISTINCT strategy_name FROM trading_sessions ORDER BY strategy_name`;
  const rows = await query<{ strategy_name: string }>(sql);
  return rows.map(r => r.strategy_name);
}

/**
 * Get distinct symbols.
 */
export async function getDistinctSymbols(): Promise<string[]> {
  const sql = `SELECT DISTINCT symbol FROM fills ORDER BY symbol`;
  const rows = await query<{ symbol: string }>(sql);
  return rows.map(r => r.symbol);
}