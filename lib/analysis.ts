/**
 * Strategy Analysis for the live L2 and L4 books.
 * Rules come from the trading logs. PnL split comes from the trading database.
 * The backtest series is the saved 2026-10-23 .. 2026-11-15 replay, not a live rerun.
 */

import fs from 'fs/promises';
import path from 'path';
import { getLiveBooks, type LiveBookRow } from './live-books';
import { getLivePositions } from './queries/positions';
import { query } from './db';
import { getPnlAttribution, timeRangeToTimestamps } from './queries/overview';

export type AnalysisBook = 'l2' | 'l4';

const STRATEGY: Record<AnalysisBook, string> = {
  l2: 'l2_galaxy_rank',
  l4: 'l4_bot_fade',
};

const BT_FROM = '2026-10-23';
const BT_TO = '2026-11-15';

function base(symbol: string): string {
  return symbol.split('/')[0].split(':')[0].toUpperCase();
}

function missing(target: string[], open: string[]): string[] {
  const have = new Set(open);
  return target.filter((name) => !have.has(name));
}

function extra(target: string[], open: string[]): string[] {
  const want = new Set(target);
  return open.filter((name) => !want.has(name));
}

export async function getRuleComparison(book: AnalysisBook) {
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 86_400_000).toISOString();
  const rows = await getLiveBooks(from, to, book);
  const positions = await getLivePositions(undefined, STRATEGY[book]);
  const openLong = positions.filter((p) => p.side === 'LONG').map((p) => base(p.symbol));
  const openShort = positions.filter((p) => p.side === 'SHORT').map((p) => base(p.symbol));
  const latest = rows.find((row) => row.status === 'traded') ?? rows[0] ?? null;

  const targetLong = latest?.longs ?? [];
  const targetShort = latest?.shorts ?? [];
  const l4Sleeve = book === 'l4';

  return {
    book,
    strategy: STRATEGY[book],
    latest,
    open_long: openLong,
    open_short: openShort,
    missing_long: latest ? missing(targetLong, openLong) : [],
    missing_short: latest ? missing(targetShort, openShort) : [],
    extra_long: l4Sleeve ? [] : latest ? extra(targetLong, openLong) : openLong,
    extra_short: l4Sleeve ? [] : latest ? extra(targetShort, openShort) : openShort,
    note: l4Sleeve
      ? 'L4 holds five overlapping daily sleeves. This row is only the latest sleeve, so older names stay open on purpose.'
      : 'L2 replaces the whole book each day. Names here should match the latest traded target.',
    days: rows,
  };
}

const TURNOVER_BPS = 4.5;

export async function getPnlSplit(book: AnalysisBook, range = '30D') {
  const rows = await getPnlAttribution(range, undefined, [STRATEGY[book]]);
  const { from_ts, to_ts } = timeRangeToTimestamps(range);
  const notionals = await query<{ date: Date; notional: number }>(
    `
      SELECT DATE(f.ts) AS date, SUM(ABS(f.fill_qty * f.fill_price)) AS notional
      FROM fills f
      JOIN trading_sessions s ON s.session_id = f.session_id
      WHERE s.strategy_name = $1 AND f.ts >= $2 AND f.ts <= $3
      GROUP BY DATE(f.ts)
    `,
    [STRATEGY[book], from_ts, to_ts]
  );
  const turnoverByDay = new Map(
    notionals.map((row) => [
      new Date(row.date).toISOString().slice(0, 10),
      (Number(row.notional) || 0) * (TURNOVER_BPS / 10_000),
    ])
  );
  const days = rows.map((row) => ({
    ...row,
    turnover: turnoverByDay.get(row.date) ?? 0,
  }));
  const totals = days.reduce(
    (acc, row) => {
      acc.price_pnl += Number(row.price_pnl) || 0;
      acc.funding += Number(row.funding) || 0;
      acc.fees += Number(row.fees) || 0;
      acc.turnover += Number(row.turnover) || 0;
      return acc;
    },
    { price_pnl: 0, funding: 0, fees: 0, turnover: 0 }
  );
  return {
    book,
    strategy: STRATEGY[book],
    range,
    days,
    totals: {
      ...totals,
      net: totals.price_pnl + totals.funding + totals.fees,
    },
  };
}

function csvRows(text: string): Record<string, string>[] {
  const [header, ...lines] = text.trim().split('\n');
  const cols = header.split(',');
  return lines.filter(Boolean).map((line) => {
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') {
        quoted = !quoted;
        continue;
      }
      if (ch === ',' && !quoted) {
        cells.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    cells.push(cur);
    const row: Record<string, string> = {};
    cols.forEach((col, i) => {
      row[col] = cells[i] ?? '';
    });
    return row;
  });
}

export async function getBacktestComparison(book: AnalysisBook) {
  const file = process.env.L2_L4_BACKTEST_CSV
    || '/tmp/l2_l4_backtest_vs_live/daily_comparison.csv';
  const label = book === 'l2' ? 'L2' : 'L4';
  try {
    const text = await fs.readFile(file, 'utf8');
    const all = csvRows(text).filter((row) => row.book === label);
    const window = all.filter((row) => row.day >= BT_FROM && row.day <= BT_TO);
    const sum = (key: string) =>
      window.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
    return {
      available: true,
      book,
      from: BT_FROM,
      to: BT_TO,
      generated: '2026-11-16',
      source: path.basename(file),
      live_pnl: sum('live_equity_change_usd'),
      backtest_pnl: sum('bt_pnl_usd_asof'),
      days: window.map((row) => ({
        day: row.day,
        live_status: row.live_status,
        live_pnl: Number(row.live_equity_change_usd) || 0,
        backtest_pnl: Number(row.bt_pnl_usd_asof) || 0,
        gap: Number(row.gap_usd_live_minus_bt) || 0,
        live_longs: row.live_target_longs,
        live_shorts: row.live_target_shorts,
        bt_longs: row.bt_longs,
        bt_shorts: row.bt_shorts,
      })),
    };
  } catch (err: any) {
    return {
      available: false,
      book,
      from: BT_FROM,
      to: BT_TO,
      error: err?.message ?? 'Backtest file missing',
      days: [] as LiveBookRow[],
    };
  }
}
