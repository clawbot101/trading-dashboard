import { Client } from 'pg';

// Direct connection per request — works reliably in serverless/edge environments
const DB_URL = process.env.TIMESCALEDB_TRADING_URL!;
const TIMEOUT_MS = 8000; // hard timeout per spec
const TARGET_MS = 3000; // target timeout

export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const client = new Client({
    connectionString: DB_URL,
    connectionTimeoutMillis: TIMEOUT_MS,
    query_timeout: TIMEOUT_MS,
    ssl: { rejectUnauthorized: false },
  });
  
  const start = Date.now();
  await client.connect();
  try {
    const result = await client.query(sql, params || []);
    const elapsed = Date.now() - start;
    if (elapsed > TARGET_MS) {
      console.warn(`[db] Query took ${elapsed}ms > target ${TARGET_MS}ms: ${sql.slice(0, 100)}...`);
    }
    return result.rows as T[];
  } catch (err) {
    console.error('[db] Query error:', err);
    throw err;
  } finally {
    await client.end();
  }
}

export async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// ============== SCHEMA TYPES (from spec — do NOT modify) ==============

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

// ============== ERROR HANDLING ==============

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