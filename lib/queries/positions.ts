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
  total_fee: number;
  adjusted_pnl: number;
}

export interface PositionSummary {
  total_notional_long: number;
  total_notional_short: number;
  net_exposure: number;
  gross_leverage: number;
  total_unrealized_pnl: number;
  total_adjusted_pnl: number;
  total_funding: number | null;
  total_margin: number | null;
  total_fees: number | null;
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
      last_trade_ts,
      COALESCE(cumulative_open_fee, 0) + COALESCE(cumulative_close_fee, 0) as total_fee,
      unrealized_pnl - (COALESCE(cumulative_open_fee, 0) + COALESCE(cumulative_close_fee, 0)) + COALESCE(funding_accrued, 0) as adjusted_pnl
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
  // Gross leverage = gross notional / wallet equity (latest equity per account).
  // Do NOT average the leverage *settings* (10x/25x) — that produced ~11x junk.
  const sql = `
    WITH open_pos AS (
      SELECT
        account_id,
        position_qty,
        COALESCE(
          position_notional_usd,
          ABS(position_qty * COALESCE(mark_price, avg_entry_price, 0))
        ) AS notional,
        unrealized_pnl,
        COALESCE(cumulative_open_fee, 0) + COALESCE(cumulative_close_fee, 0) AS fees,
        COALESCE(funding_accrued, 0) AS funding_accrued,
        margin
      FROM trading_state
      WHERE position_qty != 0
    ),
    open_accounts AS (
      SELECT DISTINCT account_id FROM open_pos
    ),
    -- One index seek per open account instead of DISTINCT ON over the whole
    -- equity_snapshots history: Postgres has no loose index scan, so the old form
    -- read all ~87k index rows just to pick the latest per account.
    latest_equity AS (
      SELECT oa.account_id, le.equity
      FROM open_accounts oa
      CROSS JOIN LATERAL (
        SELECT e.equity::float8 AS equity
        FROM equity_snapshots e
        WHERE e.account_id = oa.account_id
        ORDER BY e.ts DESC
        LIMIT 1
      ) le
    )
    SELECT
      COALESCE(SUM(CASE WHEN position_qty > 0 THEN notional ELSE 0 END), 0) AS total_notional_long,
      COALESCE(SUM(CASE WHEN position_qty < 0 THEN notional ELSE 0 END), 0) AS total_notional_short,
      COALESCE(SUM(SIGN(position_qty) * notional), 0) AS net_exposure,
      CASE
        WHEN COALESCE((SELECT SUM(equity) FROM latest_equity), 0) > 0
        THEN (
          COALESCE(SUM(ABS(notional)), 0)
          / (SELECT SUM(equity) FROM latest_equity)
        )
        ELSE NULL
      END AS gross_leverage,
      COALESCE(SUM(unrealized_pnl), 0) AS total_unrealized_pnl,
      COALESCE(SUM(unrealized_pnl - fees + funding_accrued), 0) AS total_adjusted_pnl,
      COALESCE(SUM(funding_accrued), 0) AS total_funding,
      COALESCE(SUM(margin), 0) AS total_margin,
      COALESCE(SUM(fees), 0) AS total_fees
    FROM open_pos
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