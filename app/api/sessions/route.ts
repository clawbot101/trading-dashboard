import { NextResponse } from 'next/server';
import { query, TradingSession } from '../../../lib/db';

export async function GET() {
  try {
    const sessions = await query<TradingSession>(
      `SELECT session_id, strategy_name, strategy_slot, venue, account_id, token_pair,
              started_at, ended_at, status
       FROM trading_sessions
       ORDER BY started_at DESC
       LIMIT 20`
    );
    return NextResponse.json({ sessions, ok: true });
  } catch (err) {
    console.error('Failed to fetch sessions:', err);
    return NextResponse.json({ error: 'Database error', ok: false }, { status: 500 });
  }
}