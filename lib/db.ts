import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL || process.env.TIMESCALEDB_TRADING_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  // Parse connection string to remove sslmode and use Pool ssl config instead
  // Connection string format: postgres://user:pass@host:port/db?sslmode=require
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode'); // Remove sslmode from URL
  const cleanConnectionString = url.toString();

  return new Pool({
    connectionString: cleanConnectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export const db = global.__pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = db;
}

export async function dbHealthcheck() {
  const res = await db.query("select now() as now, current_database() as db");
  return res.rows[0];
}

// Keep old query functions for backwards compatibility
export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const result = await db.query(sql, params || []);
  return result.rows as T[];
}

export async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Schema types (unchanged)
export interface TradingSession {
  session_id: string;
  strategy_name: string;
  strategy_slot: string | null;
  venue: string;
  account_id: string;
  token_pair: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  config_snapshot: Record<string, unknown> | null;
  initial_capital: number | null;
  strategy_version: string | null;
}

export interface TradingState {
  state_key: string;
  updated_at: string;
  session_id: string | null;
  strategy_name: string;
  strategy_slot: string | null;
  venue: string;
  account_id: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  position_qty: number;
  avg_entry_price: number | null;
  mark_price: number | null;
  unrealized_pnl: number;
  realized_pnl: number;
  leverage: number | null;
  equity: number | null;
  cash_balance: number | null;
  config_name: string | null;
  liquidation_price: number | null;
  margin: number | null;
  funding_accrued: number | null;
  stop_price: number | null;
  take_profit_price: number | null;
}

export interface EquitySnapshot {
  ts: string;
  session_id: string;
  venue: string;
  account_id: string;
  equity: number;
  cash_balance: number;
  unrealized_pnl: number;
  realized_pnl: number;
  margin_used: number | null;
  account_leverage: number | null;
  withdrawable: number | null;
}

export interface Fill {
  fill_id: string;
  ts: string;
  session_id: string;
  venue: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  strategy_order_id: string | null;
  broker_order_id: string | null;
  side: string;
  fill_price: number;
  fill_qty: number;
  fee: number | null;
  fee_asset: string | null;
  realized_pnl: number | null;
  is_maker: boolean | null;
  fill_role: string | null;
}

export interface OrderEvent {
  ts: string;
  session_id: string;
  venue: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  strategy_order_id: string | null;
  broker_order_id: string | null;
  side: string;
  order_type: string;
  price: number | null;
  qty: number | null;
  event_type: string;
  event_status: string;
  source: string | null;
  note: string | null;
  tx_hashes: string[] | null;
  raw_payload: Record<string, unknown> | null;
  exchange_ts: string | null;
}

export interface FundingPayment {
  ts: string;
  session_id: string;
  venue: string;
  symbol: string;
  funding_rate: number;
  payment: number;
  position_size: number;
  mark_price: number;
}

export interface StrategySignal {
  ts: string;
  session_id: string;
  symbol: string;
  signal_name: string;
  signal_value: number | null;
  rank: number | null;
  target_weight: number | null;
  decision: string | null;
  regime: string | null;
}

export class DbError extends Error {
  constructor(message: string, public readonly sql?: string, public readonly params?: unknown[]) {
    super(message);
    this.name = 'DbError';
  }
}

export function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('timeout') || err.message.includes('ETIMEDOUT');
  }
  return false;
}