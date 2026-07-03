/**
 * SQL queries for the Trades & Orders page.
 */

import { query, queryOne, Fill, OrderEvent } from '../db';

// ============== TYPES ==============

export interface FillRow extends Fill {
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
  events: OrderEvent[];
}

// ============== TIME RANGE HELPER ==============

function timeRangeToInterval(range: string): string {
  switch (range) {
    case '24H': return '24 hours';
    case '7D': return '7 days';
    case '30D': return '30 days';
    case '90D': return '90 days';
    case 'ALL': return '1000 days';
    default: return '24 hours';
  }
}

// ============== QUERIES ==============

/**
 * Get paginated fills with filters.
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
  const params: unknown[] = [];
  let idx = 1;
  const filters: string[] = [`f.ts > NOW() - INTERVAL '${interval}'`];

  if (venue && venue !== 'All') {
    filters.push(`f.venue = $${idx}`);
    params.push(venue);
    idx++;
  }

  if (strategy) {
    filters.push(`sess.strategy_name = $${idx}`);
    params.push(strategy);
    idx++;
  }

  if (symbol) {
    filters.push(`f.symbol = $${idx}`);
    params.push(symbol);
    idx++;
  }

  if (side) {
    filters.push(`f.side = $${idx}`);
    params.push(side);
    idx++;
  }

  if (isMaker !== undefined) {
    filters.push(`f.is_maker = $${idx}`);
    params.push(isMaker);
    idx++;
  }

  const offset = (page - 1) * pageSize;
  params.push(pageSize);
  params.push(offset);

  const sql = `
    SELECT
      f.fill_id,
      f.ts,
      f.session_id,
      f.venue,
      f.symbol,
      f.base_asset,
      f.quote_asset,
      f.strategy_order_id,
      f.broker_order_id,
      f.side,
      f.fill_price,
      f.fill_qty,
      f.fee,
      f.fee_asset,
      f.realized_pnl,
      f.is_maker,
      f.fill_role,
      sess.strategy_name,
      ABS(f.fill_qty * f.fill_price) as notional
    FROM fills f
    JOIN trading_sessions sess ON f.session_id = sess.session_id
    WHERE ${filters.join(' AND ')}
    ORDER BY f.ts DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  return query<FillRow>(sql, params);
}

/**
 * Get fill totals for footer.
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
  const params: unknown[] = [];
  let idx = 1;
  const filters: string[] = [`f.ts > NOW() - INTERVAL '${interval}'`];

  if (venue && venue !== 'All') {
    filters.push(`f.venue = $${idx}`);
    params.push(venue);
    idx++;
  }

  if (strategy) {
    filters.push(`sess.strategy_name = $${idx}`);
    params.push(strategy);
    idx++;
  }

  if (symbol) {
    filters.push(`f.symbol = $${idx}`);
    params.push(symbol);
    idx++;
  }

  if (side) {
    filters.push(`f.side = $${idx}`);
    params.push(side);
    idx++;
  }

  if (isMaker !== undefined) {
    filters.push(`f.is_maker = $${idx}`);
    params.push(isMaker);
    idx++;
  }

  const sql = `
    SELECT
      SUM(f.fill_qty) as total_qty,
      SUM(ABS(f.fill_qty * f.fill_price)) as total_notional,
      SUM(ABS(COALESCE(f.fee, 0))) as total_fee,
      SUM(COALESCE(f.realized_pnl, 0)) as total_realized_pnl
    FROM fills f
    JOIN trading_sessions sess ON f.session_id = sess.session_id
    WHERE ${filters.join(' AND ')}
  `;

  return queryOne<FillTotals>(sql, params);
}

/**
 * Get order events grouped by strategy_order_id.
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
  const params: unknown[] = [];
  let idx = 1;
  const filters: string[] = [`oe.ts > NOW() - INTERVAL '${interval}'`];

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

  if (symbol) {
    filters.push(`oe.symbol = $${idx}`);
    params.push(symbol);
    idx++;
  }

  // First get unique strategy_order_ids
  const offset = (page - 1) * pageSize;
  params.push(pageSize);
  params.push(offset);

  const orderIdsSql = `
    SELECT DISTINCT oe.strategy_order_id
    FROM order_events oe
    JOIN trading_sessions sess ON oe.session_id = sess.session_id
    WHERE ${filters.join(' AND ')}
    ORDER BY oe.strategy_order_id
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const orderIds = await query<{ strategy_order_id: string }>(orderIdsSql, params);

  if (orderIds.length === 0) return [];

  // Then get all events for those order_ids
  const eventsSql = `
    SELECT
      oe.ts,
      oe.session_id,
      oe.venue,
      oe.symbol,
      oe.base_asset,
      oe.quote_asset,
      oe.strategy_order_id,
      oe.broker_order_id,
      oe.side,
      oe.order_type,
      oe.price,
      oe.qty,
      oe.event_type,
      oe.event_status,
      oe.source,
      oe.note,
      oe.tx_hashes,
      oe.raw_payload,
      oe.exchange_ts,
      sess.strategy_name
    FROM order_events oe
    JOIN trading_sessions sess ON oe.session_id = sess.session_id
    WHERE oe.strategy_order_id = ANY($1)
    ORDER BY oe.strategy_order_id, oe.ts ASC
  `;

  const allEvents = await query<OrderEvent & { strategy_name: string }>(eventsSql, [orderIds.map(o => o.strategy_order_id)]);

  // Group by strategy_order_id
  const groups: OrderEventGroup[] = [];
  const grouped = new Map<string, OrderEvent[]>();

  for (const event of allEvents) {
    const key = event.strategy_order_id;
    if (!key) continue; // Skip events without strategy_order_id
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(event);
  }

  const entries = Array.from(grouped.entries());
  for (const [strategy_order_id, events] of entries) {
    const first = events[0];
    const last = events[events.length - 1];

    groups.push({
      strategy_order_id,
      symbol: first.symbol,
      venue: first.venue,
      side: first.side,
      order_type: first.order_type,
      latest_status: last.event_status,
      created_ts: first.ts,
      latest_ts: last.ts,
      events
    });
  }

  return groups;
}

/**
 * Get distinct strategies for filter dropdown.
 */
export async function getDistinctStrategies(): Promise<string[]> {
  const sql = `
    SELECT DISTINCT strategy_name FROM trading_sessions ORDER BY strategy_name
  `;
  const rows = await query<{ strategy_name: string }>(sql);
  return rows.map(r => r.strategy_name);
}

/**
 * Get distinct symbols for filter dropdown.
 */
export async function getDistinctSymbols(): Promise<string[]> {
  const sql = `
    SELECT DISTINCT symbol FROM fills ORDER BY symbol
  `;
  const rows = await query<{ symbol: string }>(sql);
  return rows.map(r => r.symbol);
}