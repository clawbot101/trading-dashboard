import { Pool } from 'pg';

// Connection pool for TimescaleDB
// Vercel serverless reuses the same container for warm requests
const pool = new Pool({
  connectionString: process.env.TIMESCALEDB_TRADING_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params || []);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Types
export interface TradingState {
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
  updated_at: string;
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
}

export interface Fill {
  ts: string;
  session_id: string;
  venue: string;
  symbol: string;
  fill_id: string;
  side: string;
  fill_price: number;
  fill_qty: number;
  fee: number;
}

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
}