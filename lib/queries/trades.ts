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

let fillsHasRealizedPnlCache: boolean | null = null;

async function fillsHasColumn(columnName: string): Promise<boolean> {
  if (columnName === 'realized_pnl' && fillsHasRealizedPnlCache !== null) {
    return fillsHasRealizedPnlCache;
  }

  const row = await queryOne<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'fills'
          AND column_name = $1
      ) AS exists
    `,
    [columnName]
  );

  const exists = Boolean(row?.exists);
  if (columnName === 'realized_pnl') {
    fillsHasRealizedPnlCache = exists;
  }
  return exists;
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
  const hasRealizedPnl = await fillsHasColumn('realized_pnl');
  const realizedPnlSelect = hasRealizedPnl
    ? 'f.realized_pnl'
    : 'NULL::numeric AS realized_pnl';

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
      ${realizedPnlSelect},
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
  symbol?: string,
  page = 1,
  pageSize = 50
): Promise<PositionLifecycleRow[]> {
  const offset = (page - 1) * pageSize;
  const venueFilter = venue && venue !== 'all' ? `AND f.venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND sess.strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND f.symbol = '${symbol}'` : '';

  const sql = `
    WITH fills_with_session AS (
      SELECT 
        f.fill_id,
        f.ts,
        f.session_id,
        f.venue,
        f.symbol,
        LOWER(f.side) as side,
        f.fill_price,
        f.fill_qty,
        COALESCE(f.fee, 0) as fee,
        sess.strategy_name,
        CASE WHEN LOWER(f.side) = 'buy' THEN f.fill_qty ELSE -f.fill_qty END as signed_qty
      FROM fills f
      LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
      WHERE f.ts >= '${from_ts}' AND f.ts <= '${to_ts}'
      ${venueFilter}
      ${strategyFilter}
      ${symbolFilter}
    ),
    fills_with_running AS (
      SELECT
        fws.*,
        SUM(fws.signed_qty) OVER (
          PARTITION BY fws.session_id, fws.symbol
          ORDER BY fws.ts, fws.fill_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as running_qty
      FROM fills_with_session fws
    ),
    fills_with_groups AS (
      SELECT
        fwr.*,
        LAG(fwr.running_qty, 1, 0) OVER (
          PARTITION BY fwr.session_id, fwr.symbol
          ORDER BY fwr.ts, fwr.fill_id
        ) as prev_running_qty
      FROM fills_with_running fwr
    ),
    lifecycle_tagged AS (
      SELECT
        fwg.*,
        SUM(
          CASE
            WHEN ABS(fwg.prev_running_qty) < 1e-12 THEN 1
            ELSE 0
          END
        ) OVER (
          PARTITION BY fwg.session_id, fwg.symbol
          ORDER BY fwg.ts, fwg.fill_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as lifecycle_seq
      FROM fills_with_groups fwg
    ),
    lifecycle_agg AS (
      SELECT 
        lt.session_id,
        lt.strategy_name,
        lt.venue,
        lt.symbol,
        lt.lifecycle_seq,
        SUM(CASE WHEN lt.side = 'buy' THEN lt.fill_qty * lt.fill_price ELSE 0 END) as buy_notional,
        SUM(CASE WHEN lt.side = 'buy' THEN lt.fill_qty ELSE 0 END) as buy_qty,
        SUM(CASE WHEN lt.side = 'sell' THEN lt.fill_qty * lt.fill_price ELSE 0 END) as sell_notional,
        SUM(CASE WHEN lt.side = 'sell' THEN lt.fill_qty ELSE 0 END) as sell_qty,
        SUM(lt.fee) as total_fee,
        SUM(lt.signed_qty) as net_qty,
        MIN(lt.ts) as open_time,
        MAX(lt.ts) as last_fill_ts,
        (ARRAY_AGG(lt.side ORDER BY lt.ts, lt.fill_id))[1] as first_side,
        CASE WHEN SUM(CASE WHEN lt.side = 'buy' THEN lt.fill_qty ELSE 0 END) > 0
          THEN SUM(CASE WHEN lt.side = 'buy' THEN lt.fill_qty * lt.fill_price ELSE 0 END) /
               SUM(CASE WHEN lt.side = 'buy' THEN lt.fill_qty ELSE 0 END)
          ELSE NULL END as avg_buy_price,
        CASE WHEN SUM(CASE WHEN lt.side = 'sell' THEN lt.fill_qty ELSE 0 END) > 0
          THEN SUM(CASE WHEN lt.side = 'sell' THEN lt.fill_qty * lt.fill_price ELSE 0 END) /
               SUM(CASE WHEN lt.side = 'sell' THEN lt.fill_qty ELSE 0 END)
          ELSE NULL END as avg_sell_price
      FROM lifecycle_tagged lt
      GROUP BY lt.session_id, lt.strategy_name, lt.venue, lt.symbol, lt.lifecycle_seq
    ),
    funding_deltas AS (
      SELECT 
        fp.ts,
        fp.session_id,
        fp.venue,
        fp.symbol,
        COALESCE(fp.payment_amount, 0) -
        COALESCE(
          LAG(COALESCE(fp.payment_amount, 0)) OVER (
            PARTITION BY fp.session_id, fp.venue, fp.symbol
            ORDER BY fp.ts
          ),
          0
        ) as funding_delta
      FROM funding_payments fp
      WHERE fp.ts <= '${to_ts}'
    ),
    funding_agg AS (
      SELECT
        la.session_id,
        la.venue,
        la.symbol,
        la.lifecycle_seq,
        COALESCE(SUM(fd.funding_delta), 0) as total_funding
      FROM lifecycle_agg la
      LEFT JOIN funding_deltas fd
        ON fd.session_id = la.session_id
       AND fd.venue = la.venue
       AND fd.symbol = la.symbol
       AND fd.ts >= la.open_time
       AND fd.ts <= (
         CASE
           WHEN ABS(la.net_qty) < 1e-12 THEN la.last_fill_ts
           ELSE '${to_ts}'::timestamptz
         END
       )
      GROUP BY la.session_id, la.venue, la.symbol, la.lifecycle_seq
    )
    SELECT 
      MD5(COALESCE(la.session_id::text, '') || '|' || la.symbol || '|' || la.lifecycle_seq::text) as lifecycle_id,
      la.session_id,
      la.strategy_name,
      la.venue,
      la.symbol,
      CASE WHEN la.first_side = 'buy' THEN 'LONG' ELSE 'SHORT' END as side,
      la.open_time,
      CASE WHEN ABS(la.net_qty) < 1e-12 THEN la.last_fill_ts ELSE NULL END as close_time,
      CASE WHEN ABS(la.net_qty) < 1e-12 THEN 'CLOSED' ELSE 'OPEN' END as status,
      la.buy_notional,
      la.sell_notional,
      (la.sell_notional - la.buy_notional) as gross_trading_pnl,
      la.total_fee,
      COALESCE(fa.total_funding, 0) as total_funding,
      (la.sell_notional - la.buy_notional) + COALESCE(fa.total_funding, 0) - la.total_fee as net_pnl,
      la.buy_qty,
      la.sell_qty,
      la.avg_buy_price,
      la.avg_sell_price
    FROM lifecycle_agg la
    LEFT JOIN funding_agg fa
      ON la.session_id = fa.session_id
     AND la.venue = fa.venue
     AND la.symbol = fa.symbol
     AND la.lifecycle_seq = fa.lifecycle_seq
    ORDER BY la.open_time DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  return query<PositionLifecycleRow>(sql);
}

export async function getPositionLifecycleCount(
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
    WITH fills_with_session AS (
      SELECT
        f.fill_id,
        f.ts,
        f.session_id,
        f.symbol,
        CASE WHEN LOWER(f.side) = 'buy' THEN f.fill_qty ELSE -f.fill_qty END as signed_qty
      FROM fills f
      LEFT JOIN trading_sessions sess ON f.session_id = sess.session_id
      WHERE f.ts >= '${from_ts}' AND f.ts <= '${to_ts}'
      ${venueFilter}
      ${strategyFilter}
      ${symbolFilter}
    ),
    fills_with_running AS (
      SELECT
        fws.*,
        SUM(fws.signed_qty) OVER (
          PARTITION BY fws.session_id, fws.symbol
          ORDER BY fws.ts, fws.fill_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as running_qty
      FROM fills_with_session fws
    ),
    fills_with_groups AS (
      SELECT
        fwr.*,
        LAG(fwr.running_qty, 1, 0) OVER (
          PARTITION BY fwr.session_id, fwr.symbol
          ORDER BY fwr.ts, fwr.fill_id
        ) as prev_running_qty
      FROM fills_with_running fwr
    ),
    lifecycle_tagged AS (
      SELECT
        fwg.*,
        SUM(
          CASE
            WHEN ABS(fwg.prev_running_qty) < 1e-12 THEN 1
            ELSE 0
          END
        ) OVER (
          PARTITION BY fwg.session_id, fwg.symbol
          ORDER BY fwg.ts, fwg.fill_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as lifecycle_seq
      FROM fills_with_groups fwg
    )
    SELECT COUNT(*) as count
    FROM (
      SELECT session_id, symbol, lifecycle_seq
      FROM lifecycle_tagged
      GROUP BY session_id, symbol, lifecycle_seq
    ) lifecycles
  `;

  const result = await queryOne<{ count: number }>(sql);
  return result?.count || 0;
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
  const hasRealizedPnl = await fillsHasColumn('realized_pnl');
  const realizedPnlTotalSelect = hasRealizedPnl
    ? 'SUM(COALESCE(f.realized_pnl, 0))'
    : '0::numeric';

  const venueFilter = venue && venue !== 'all' ? `AND f.venue = '${venue}'` : '';
  const strategyFilter = strategy && strategy !== 'all' ? `AND sess.strategy_name = '${strategy}'` : '';
  const symbolFilter = symbol ? `AND f.symbol = '${symbol}'` : '';

  const sql = `
    SELECT
      COUNT(*) as total_rows,
      SUM(fill_qty) as total_qty,
      SUM(ABS(fill_qty * fill_price)) as total_notional,
      SUM(ABS(COALESCE(f.fee, 0))) as total_fee,
      ${realizedPnlTotalSelect} as total_realized_pnl
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