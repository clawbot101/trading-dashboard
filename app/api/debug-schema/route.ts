/**
 * Debug endpoint to check schema
 */

import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Check tables
    const tables = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    // Check fills columns
    const fillsCols = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'fills'
      ORDER BY ordinal_position
    `);

    // Check trading_state columns
    const stateCols = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'trading_state'
      ORDER BY ordinal_position
    `);

    // Check equity_snapshots columns
    const equityCols = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'equity_snapshots'
      ORDER BY ordinal_position
    `);

    return NextResponse.json({
      ok: true,
      tables: tables.rows,
      fills_columns: fillsCols.rows,
      trading_state_columns: stateCols.rows,
      equity_snapshots_columns: equityCols.rows,
    });
  } catch (err: any) {
    console.error("[api/debug-schema] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message, code: err?.code },
      { status: 500 }
    );
  }
}