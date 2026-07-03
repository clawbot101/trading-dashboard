import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

// Strategy Live Overview - aggregated by strategy instance
interface StrategyOverview {
  strategy_name: string;
  strategy_slot: string;
  venue: string;
  account_id: string;
  session_id: string | null;
  status: string;
  total_unrealized_pnl: number;
  total_realized_pnl: number;
  latest_equity: number;
  active_symbols: number;
  last_updated_at: string;
}

export async function GET() {
  try {
    // Aggregate trading_state by strategy instance, join with sessions for status and session_id
    const strategies = await query<StrategyOverview>(
      `SELECT 
        ts.strategy_name,
        ts.strategy_slot,
        ts.venue,
        ts.account_id,
        sess.session_id,
        COALESCE(sess.status, 'unknown') as status,
        SUM(ts.unrealized_pnl) as total_unrealized_pnl,
        SUM(ts.realized_pnl) as total_realized_pnl,
        MAX(ts.equity) as latest_equity,
        COUNT(CASE WHEN ts.position_qty != 0 THEN 1 END) as active_symbols,
        MAX(ts.updated_at) as last_updated_at
       FROM trading_state ts
       LEFT JOIN trading_sessions sess 
         ON ts.strategy_name = sess.strategy_name 
         AND ts.strategy_slot = sess.strategy_slot
         AND ts.venue = sess.venue
         AND ts.account_id = sess.account_id
         AND sess.status = 'running'
       GROUP BY ts.strategy_name, ts.strategy_slot, ts.venue, ts.account_id, sess.session_id, sess.status
       ORDER BY ts.strategy_name, ts.strategy_slot`
    );
    return NextResponse.json({ strategies, ok: true });
  } catch (err) {
    console.error('Failed to fetch strategy overview:', err);
    return NextResponse.json({ error: 'Database error', ok: false }, { status: 500 });
  }
}