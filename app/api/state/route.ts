import { NextResponse } from 'next/server';
import { query, TradingState } from '../../../lib/db';

export async function GET() {
  try {
    const states = await query<TradingState>(
      `SELECT strategy_name, strategy_slot, venue, account_id, symbol, base_asset, quote_asset,
              position_qty, avg_entry_price, mark_price, unrealized_pnl, realized_pnl,
              leverage, equity, cash_balance, updated_at
       FROM trading_state
       ORDER BY strategy_name, symbol`
    );
    return NextResponse.json({ states, ok: true });
  } catch (err) {
    console.error('Failed to fetch trading state:', err);
    return NextResponse.json({ error: 'Database error', ok: false }, { status: 500 });
  }
}