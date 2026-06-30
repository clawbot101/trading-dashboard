import { NextResponse } from 'next/server';
import { query, Fill } from '../../../lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  try {
    const fills = await query<Fill>(
      `SELECT ts, session_id, venue, symbol, fill_id, side, fill_price, fill_qty, fee
       FROM fills
       ORDER BY ts DESC
       LIMIT ${limit}`
    );
    return NextResponse.json({ fills, ok: true });
  } catch (err) {
    console.error('Failed to fetch fills:', err);
    return NextResponse.json({ error: 'Database error', ok: false }, { status: 500 });
  }
}