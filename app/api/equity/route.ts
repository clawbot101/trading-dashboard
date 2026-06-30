import { NextResponse } from 'next/server';
import { query, EquitySnapshot } from '../../../lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get('hours') || '24', 10);
  const limit = parseInt(searchParams.get('limit') || '500', 10);

  try {
    const snapshots = await query<EquitySnapshot>(
      `SELECT ts, session_id, venue, account_id, equity, cash_balance, unrealized_pnl, realized_pnl
       FROM equity_snapshots
       WHERE ts > NOW() - INTERVAL '${hours} hours'
       ORDER BY ts DESC
       LIMIT ${limit}`
    );
    // Reverse for chronological chart display
    return NextResponse.json({ snapshots: snapshots.reverse(), ok: true });
  } catch (err) {
    console.error('Failed to fetch equity snapshots:', err);
    return NextResponse.json({ error: 'Database error', ok: false }, { status: 500 });
  }
}