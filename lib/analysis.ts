/**
 * Strategy Analysis for the live L2 and L4 books.
 * Rules and the saved backtest come from analysis_* tables, not from local log files.
 * PnL split comes from the trading database. Live fills and equity tables are not written here.
 */

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

function splitNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((name) => name.trim()).filter(Boolean);
}

export async function getRuleComparison(book: AnalysisBook) {
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const stored = await query<any>(
    `
      SELECT signal_day, run_day, cycle_start, status, reason, longs, shorts
      FROM analysis_signal_days
      WHERE book = $1 AND (signal_day >= $2 OR run_day >= $2)
      ORDER BY signal_day DESC, cycle_start DESC
    `,
    [STRATEGY[book], from]
  );
  const rows = stored.map((row) => ({
    book: STRATEGY[book],
    signal_day: String(row.signal_day).slice(0, 10),
    run_day: String(row.run_day).slice(0, 10),
    cycle_start: row.cycle_start,
    status: row.status,
    reason: row.reason,
    longs: splitNames(row.longs),
    shorts: splitNames(row.shorts),
  }));
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

export async function getBacktestComparison(book: AnalysisBook) {
  const rows = await query<any>(
    `
      SELECT day, live_status, live_pnl, backtest_pnl, gap
      FROM analysis_backtest_days
      WHERE book = $1 AND day >= $2 AND day <= $3
      ORDER BY day
    `,
    [STRATEGY[book], BT_FROM, BT_TO]
  );
  const days = rows.map((row) => ({
    day: String(row.day).slice(0, 10),
    live_status: row.live_status,
    live_pnl: Number(row.live_pnl) || 0,
    backtest_pnl: Number(row.backtest_pnl) || 0,
    gap: Number(row.gap) || 0,
  }));
  const sum = (key: 'live_pnl' | 'backtest_pnl') => days.reduce((acc, row) => acc + row[key], 0);
  return {
    available: days.length > 0,
    book,
    from: BT_FROM,
    to: BT_TO,
    generated: '2026-11-16',
    source: 'analysis_backtest_days',
    live_pnl: sum('live_pnl'),
    backtest_pnl: sum('backtest_pnl'),
    days,
  };
}
