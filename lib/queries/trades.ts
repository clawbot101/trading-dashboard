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

  const venueFilter = venue && venue !== 'all' ? `AND f.venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND sess.strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND f.symbol = '${symbol}'` : '';

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
      f.realized_pnl,
      sess.strategy_name,
      ABS(f.fill_qty * f.fill_price) as notional
    FROM fills f
    LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
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
 * Position Lifecycle with full PnL accounting.
 * Groups fills by position cycle (open -> close).
 */
export interface PositionLifecycleRow {
  lifecycle_id: string;
  session_id: string | null;
  strategy_name: string | null;
  venue: string;
  symbol: string;
  side: string;
  open_time: string;
  close_time: string | null;
  status: 'OPEN' | 'CLOSED';
  buy_notional: number;
  sell_notional: number;
  gross_trading_pnl: number;
  total_fee: number;
  total_funding: number;
  net_pnl: number;
  buy_qty: number;
  sell_qty: number;
  avg_buy_price: number | null;
  avg_sell_price: number | null;
}

/**
 * Get position lifecycles with PnL accounting.
 * Groups fills by session+symbol, treating each continuous holding as one lifecycle.
 */
export async function getPositionLifecycles(
  from_ts: string,
  to_ts: string,
  venue?: string,
  strategy?: string,
  symbol?: string
): Promise<PositionLifecycleRow[]> {
  const venueFilter = venue && venue !== 'all' ? `AND f.venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND sess.strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND f.symbol = '${symbol}'` : '';

  const sql = `
    WITH fills_with_session AS (
      SELECT 
        f.*,
        sess.strategy_name
      FROM fills f
      LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
      WHERE f.ts >= '${from_ts}' AND f.ts <= '${to_ts}'
      ${venueFilter}
      ${strategyFilter}
      ${symbolFilter}
    ),
    -- Aggregate by session+symbol
    lifecycle_agg AS (
      SELECT 
        fws.session_id,
        fws.strategy_name,
        fws.venue,
        fws.symbol,
        -- Buy side totals
        SUM(CASE WHEN fws.side = 'buy' THEN fws.fill_qty * fws.fill_price ELSE 0 END) as buy_notional,
        SUM(CASE WHEN fws.side = 'buy' THEN fws.fill_qty ELSE 0 END) as buy_qty,
        -- Sell side totals
        SUM(CASE WHEN fws.side = 'sell' THEN fws.fill_qty * fws.fill_price ELSE 0 END) as sell_notional,
        SUM(CASE WHEN fws.side = 'sell' THEN fws.fill_qty ELSE 0 END) as sell_qty,
        -- Fees
        SUM(COALESCE(fws.fee, 0)) as total_fee,
        -- Timing
        MIN(fws.ts) as open_time,
        MAX(fws.ts) as close_time,
        -- Average prices
        CASE WHEN SUM(CASE WHEN fws.side = 'buy' THEN fws.fill_qty ELSE 0 END) > 0
          THEN SUM(CASE WHEN fws.side = 'buy' THEN fws.fill_qty * fws.fill_price ELSE 0 END) / 
               SUM(CASE WHEN fws.side = 'buy' THEN fws.fill_qty ELSE 0 END)
          ELSE NULL END as avg_buy_price,
        CASE WHEN SUM(CASE WHEN fws.side = 'sell' THEN fws.fill_qty ELSE 0 END) > 0
          THEN SUM(CASE WHEN fws.side = 'sell' THEN fws.fill_qty * fws.fill_price ELSE 0 END) / 
               SUM(CASE WHEN fws.side = 'sell' THEN fws.fill_qty ELSE 0 END)
          ELSE NULL END as avg_sell_price
      FROM fills_with_session fws
      GROUP BY fws.session_id, fws.strategy_name, fws.venue, fws.symbol
    ),
    -- Get funding from funding_payments
    funding_agg AS (
      SELECT 
        fp.session_id,
        fp.symbol,
        SUM(fp.payment_amount) as total_funding
      FROM funding_payments fp
      WHERE fp.ts >= '${from_ts}' AND fp.ts <= '${to_ts}'
      GROUP BY fp.session_id, fp.symbol
    )
    SELECT 
      MD5(la.session_id || la.symbol || la.open_time) as lifecycle_id,
      la.session_id,
      la.strategy_name,
      la.venue,
      la.symbol,
      CASE WHEN la.buy_qty > la.sell_qty THEN 'LONG' ELSE 'SHORT' END as side,
      la.open_time,
      CASE WHEN la.buy_qty = la.sell_qty THEN la.close_time ELSE NULL END as close_time,
      CASE WHEN la.buy_qty = la.sell_qty THEN 'CLOSED' ELSE 'OPEN' END as status,
      la.buy_notional,
      la.sell_notional,
      -- Gross PnL: for LONG = sell_notional - (sell_qty/buy_qty) * buy_notional
      CASE 
        WHEN la.buy_qty > la.sell_qty THEN 
          la.sell_notional - (la.sell_qty::numeric / NULLIF(la.buy_qty, 0)) * la.buy_notional
        ELSE la.sell_notional - la.buy_notional
      END as gross_trading_pnl,
      la.total_fee,
      COALESCE(fa.total_funding, 0) as total_funding,
      -- Net PnL = gross_pnl + funding - fees
      CASE 
        WHEN la.buy_qty > la.sell_qty THEN 
          la.sell_notional - (la.sell_qty::numeric / NULLIF(la.buy_qty, 0)) * la.buy_notional
        ELSE la.sell_notional - la.buy_notional
      END + COALESCE(fa.total_funding, 0) - la.total_fee as net_pnl,
      la.buy_qty,
      la.sell_qty,
      la.avg_buy_price,
      la.avg_sell_price
    FROM lifecycle_agg la
    LEFT JOIN funding_agg fa ON la.session_id = fa.session_id AND la.symbol = fa.symbol
    ORDER BY la.open_time DESC
    LIMIT 500
  `;

  return query<PositionLifecycleRow>(sql);
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
  const venueFilter = venue && venue !== 'all' ? `AND f.venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND sess.strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND f.symbol = '${symbol}'` : '';

  const sql = `
    SELECT COUNT(*) as count
    FROM fills f
    LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
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
  const venueFilter = venue && venue !== 'all' ? `AND f.venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND sess.strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND f.symbol = '${symbol}'` : '';

  const sql = `
    SELECT
      COUNT(*) as total_rows,
      SUM(fill_qty) as total_qty,
      SUM(ABS(fill_qty * fill_price)) as total_notional,
      SUM(ABS(COALESCE(f.fee, 0))) as total_fee,
      SUM(COALESCE(f.realized_pnl, 0)) as total_realized_pnl
    FROM fills f
    LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
    WHERE f.ts >= '${from_ts}' AND f.ts <= '${to_ts}'
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