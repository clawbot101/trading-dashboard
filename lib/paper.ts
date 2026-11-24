/**
 * MW paper book. Reads paper_* tables only, never live fills or equity.
 */

import { query } from './db';

/**
 * One entry per paper book. Add an entry whenever a new paper strategy is started:
 * title and blurb (short, shown on the book card), overview (rules), fee_note (cost line under the book),
 * flat_on_empty (true when a cycle with no trades means a flat day, false when it means "held").
 * A book without an entry still shows up, with its latest cycle note as the description.
 */
export type PaperProfile = {
  title: string;
  blurb: string;
  overview: string[];
  fee_note: string;
  flat_on_empty: boolean;
};

export const PAPER_PROFILES: Record<string, PaperProfile> = {
  mw_majors_weak: {
    title: 'MW · majors vs weak alts',
    blurb: 'Long five majors, short the five alts whose social dominance fell the most. 1x on $10,000.',
    overview: [
      'Market-neutral. Each day it goes long BTC, ETH, HYPE, ZEC and SOL, 10% of capital each, and shorts the 5 alts whose LunarCrush social dominance fell most versus their own 30-day history, 10% each.',
      'Universe: top 60 Hyperliquid perps by 30-day median of close × volume. PAXG and the majors are not shorted. If fewer than 15 alts score, there is no short leg that day.',
      'Signal uses the LunarCrush bar from two days before the run. Rebalance 00:45 UTC. No stops, no risk governor, and no fees in the paper PnL.',
    ],
    fee_note: 'Fees are zero because no order was sent.',
    flat_on_empty: false,
  },
  n_new_listing_short: {
    title: 'Recent listings vs liquid hedge',
    blurb: 'Short up to 5 recently listed Hyperliquid perps, hedged with the 10 most liquid perps. $10,000.',
    overview: [
      'Hyperliquid candles only. Signal day D is the daily candle that closes at 00:00 UTC on D+1. The book is set at that midnight and held until the next one.',
      'Shorts: listed 30 to 89 days, 3-day median dollar volume above $2m, not in the top 10 by 30-day median dollar volume. Youngest first, at most 5, each −10% of capital.',
      'Long hedge: those top 10, equal weight, and the total long matches the total short. No qualifying short means the book is flat. A name leaves at day 90, when its volume falls under $2m, when it joins the top 10, or when 5 younger names qualify.',
      'Costs: 4.5 bps of capital per unit of weight traded, including the open. Funding is the real Hyperliquid hourly rate. Capital $10,000, separate from the MW paper book and from live trading.',
    ],
    fee_note: 'Fees are 4.5 bps on weight traded. A flat day has none.',
    flat_on_empty: true,
  },
  l4_bot_fade: {
    title: 'L4 · low posts-per-author, liquid hedge (paper)',
    blurb: 'Short the 5 names with the fewest posts per author, hedged long the 10 most liquid perps. 0.72x on $10,000.',
    overview: [
      'Paper copy of L4. Same top-60 universe and rules as the live book: the signal day is two days before the run, and the book is set at 00:15 UTC.',
      'Each day, short the 5 names with the lowest posts per author, 10% each, and hedge long the 10 most liquid names, 5% each. Five daily sleeves are averaged and the book is sized at 0.72x. A sleeve with fewer than 20 names is flat for that day.',
      'It is a dry run against a flat account, with its own $10,000. The live L4 wallet was closed on 2026-11-23, and the paper book started on 2026-11-24 00:15 UTC. The sleeve history carried over, so the first paper book already held the full five-sleeve average.',
      'Costs: 4.5 bps of capital per unit of weight traded. Funding is the real Hyperliquid hourly rate. No stops.',
    ],
    fee_note: 'Fees are 4.5 bps on weight traded. A flat day has none.',
    flat_on_empty: true,
  },
  hip3_stock_reversal: {
    title: 'HIP-3 stock 1-day reversal',
    blurb: 'Long the 5 HIP-3 stock perps that fell most yesterday, short the 5 that rose most. $10,000.',
    overview: [
      'Universe: HIP-3 single-stock perps only. Indices, ETFs, commodities, FX, rates, crypto and pre-IPO names are left out. Top 30 by 30-day median dollar volume, with at least 20 days of data. A stock listed on several DEXs keeps its most traded listing.',
      'Signal day D is the daily candle that closes at 00:00 UTC on D+1. Long the 5 lowest 1-day log returns and short the 5 highest, 10% of capital each. Fewer than 12 names makes the book flat. The book is set daily at 00:00 UTC and filled at the 1h open.',
      'Costs: 3 bps of capital per unit of weight traded, which assumes limit orders. At 10 bps taker costs the research Sharpe falls from 1.99 to 0.82. Funding is the real HIP-3 hourly rate. Source: Golden Pear research, 23 Nov 2026.',
    ],
    fee_note: 'Fees are 3 bps on weight traded (limit-order assumption). A flat day has none.',
    flat_on_empty: true,
  },
};

export const SHARPE_MIN_DAYS = 7;

/**
 * Daily risk stats from the paper equity marks. Each UTC day uses its last mark.
 * The series starts at the opening capital. Sharpe is annualized with sqrt(365), rf = 0,
 * and is only shown once there are SHARPE_MIN_DAYS daily returns.
 */
export function paperRisk(points: { ts: string | Date; equity: number }[], capital: number) {
  const byDay = new Map<string, number>();
  for (const point of points) {
    const day = new Date(point.ts).toISOString().slice(0, 10);
    byDay.set(day, point.equity);
  }
  const closes = [capital, ...byDay.values()];
  let peak = closes[0];
  let maxDrawdown = 0;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    peak = Math.max(peak, closes[i]);
    maxDrawdown = Math.min(maxDrawdown, closes[i] / peak - 1);
    if (closes[i - 1] > 0) returns.push(closes[i] / closes[i - 1] - 1);
  }
  let sharpe: number | null = null;
  if (returns.length >= SHARPE_MIN_DAYS) {
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
    const deviation = Math.sqrt(variance);
    sharpe = deviation > 0 ? (mean / deviation) * Math.sqrt(365) : null;
  }
  return {
    max_drawdown: maxDrawdown,
    sharpe,
    days: returns.length,
    sharpe_min_days: SHARPE_MIN_DAYS,
  };
}

export function flatOnEmpty(strategy: string): boolean {
  return PAPER_PROFILES[strategy]?.flat_on_empty ?? false;
}

/**
 * Profile for a book. A strategy with no PAPER_PROFILES entry still gets a description,
 * taken from its latest cycle note, so a new paper book is never shown blank.
 */
function profileFor(strategy: string, latestNote?: unknown): PaperProfile {
  const known = PAPER_PROFILES[strategy];
  if (known) return known;
  const lines = String(latestNote ?? '')
    .split(/;\s+|\.\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((part) => (part.length > 400 ? `${part.slice(0, 397)}...` : part));
  return {
    title: strategy.replace(/_/g, ' '),
    blurb: 'Paper book. No written description yet; the rules below come from its latest cycle note.',
    overview: lines,
    fee_note: 'Fees: see the rules above.',
    flat_on_empty: false,
  };
}

export async function listPaperBooks() {
  const rows = await query<any>(
    `
      SELECT c.strategy_name,
             MIN(c.ended_at) FILTER (WHERE c.trade_count > 0 OR c.status = 'BACKFILLED') AS started_at,
             MAX(c.ended_at) FILTER (WHERE c.trade_count > 0) AS last_trade_at,
             MAX(c.ended_at) AS last_run_at,
             (ARRAY_AGG(c.capital_usd ORDER BY c.ended_at DESC))[1] AS capital_usd,
             (ARRAY_AGG(c.note ORDER BY c.ended_at DESC))[1] AS latest_note
      FROM paper_cycles c
      GROUP BY c.strategy_name
      ORDER BY started_at NULLS LAST
    `
  );
  const books = [];
  for (const row of rows) {
    const latest = await queryOneSafe(row.strategy_name);
    const capital = Number(row.capital_usd ?? 0);
    const equity = latest ? Number(latest.equity_usd) : null;
    const series = await query<any>(
      `SELECT ts, equity_usd FROM paper_equity WHERE strategy_name = $1 ORDER BY ts`,
      [row.strategy_name]
    );
    const risk = paperRisk(
      series.map((point) => ({ ts: point.ts, equity: Number(point.equity_usd) })),
      capital
    );
    books.push({
      strategy: row.strategy_name,
      ...profileFor(row.strategy_name, row.latest_note),
      started_at: row.started_at,
      last_rebalance_at: flatOnEmpty(row.strategy_name) ? row.last_run_at : row.last_trade_at,
      last_run_at: row.last_run_at,
      capital,
      equity,
      net: equity === null ? null : equity - capital,
      mark_ts: latest?.ts ?? null,
      max_drawdown: risk.max_drawdown,
      sharpe: risk.sharpe,
      sharpe_days: risk.days,
    });
  }
  return books;
}

async function queryOneSafe(strategy: string) {
  const rows = await query<any>(
    `
      SELECT ts, equity_usd
      FROM paper_equity
      WHERE strategy_name = $1
      ORDER BY ts DESC
      LIMIT 1
    `,
    [strategy]
  );
  return rows[0] ?? null;
}

export async function getPaperBook(strategy = 'mw_majors_weak') {
  const cycles = await query<any>(
    `
      SELECT cycle_id, started_at, ended_at, status, signal_day, capital_usd, trade_count, note
      FROM paper_cycles
      WHERE strategy_name = $1
      ORDER BY ended_at DESC
    `,
    [strategy]
  );
  // Current book = the latest cycle that placed trades. Later cycles with no trades mean "held".
  const open = cycles.find((row) => Number(row.trade_count) > 0) ?? cycles[0];
  // Latest run of any kind. For MW a run with no trades was held (usually LunarCrush coverage).
  // Flat-on-empty books (Book N, L4, HIP-3) always rebalance: a flat day is a real decision, so the latest run is the rebalance.
  const latestRun = cycles[0] ?? null;
  const rebalance = flatOnEmpty(strategy) ? latestRun : open;
  const heldReason = (note: unknown) => {
    const parts = String(note ?? '').split('; ');
    const alert = parts.find((part) => part.includes('ALERT')) ?? parts.find((part) => part.includes('held:'));
    return alert ? alert.replace(/^mw_majors_weak\s+/, '').trim() : null;
  };
  const trades = open
    ? await query<any>(
        `
          SELECT symbol, side, qty, price, notional_usd, ts
          FROM paper_trades
          WHERE cycle_id = $1
          ORDER BY side, symbol
        `,
        [open.cycle_id]
      )
    : [];
  const equity = await query<any>(
    `
      SELECT ts, equity_usd, price_pnl, funding_pnl, fee_pnl, gross_notional
      FROM paper_equity
      WHERE strategy_name = $1
      ORDER BY ts
    `,
    [strategy]
  );
  const latest = equity[equity.length - 1] ?? null;
  // First cycle that placed trades (or was backfilled). This is when the paper book started.
  const firstTrade = cycles.filter((row) => Number(row.trade_count) > 0 || row.status === 'BACKFILLED').at(-1);
  const legs = await query<any>(
    `
      SELECT symbol, qty, entry_price, mark_price, notional_usd, price_pnl, funding_pnl, ts
      FROM paper_leg_marks
      WHERE strategy_name = $1
        AND ts = (SELECT MAX(ts) FROM paper_leg_marks WHERE strategy_name = $1)
      ORDER BY notional_usd DESC
    `,
    [strategy]
  );
  // Positions at the last hourly mark of each UTC day. Shows the book in effect that day.
  const dayLegRows = await query<any>(
    `
      WITH last AS (
        SELECT (ts AT TIME ZONE 'UTC')::date AS d, MAX(ts) AS mts
        FROM paper_leg_marks
        WHERE strategy_name = $1
        GROUP BY 1
      )
      SELECT to_char((l.ts AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
             l.symbol, l.qty, l.entry_price, l.mark_price, l.notional_usd, l.price_pnl, l.funding_pnl
      FROM paper_leg_marks l
      JOIN last ON l.ts = last.mts AND (l.ts AT TIME ZONE 'UTC')::date = last.d
      WHERE l.strategy_name = $1
      ORDER BY day, l.notional_usd DESC
    `,
    [strategy]
  );
  const day_legs: Record<string, any[]> = {};
  for (const row of dayLegRows) {
    (day_legs[row.day] ??= []).push({
      market: String(row.symbol).split('/')[0],
      qty: Number(row.qty),
      entry: Number(row.entry_price),
      mark: Number(row.mark_price),
      notional: Number(row.notional_usd),
      price_pnl: Number(row.price_pnl),
      funding: Number(row.funding_pnl),
    });
  }
  const capital = Number(open?.capital_usd ?? latest?.equity_usd ?? 0);
  const risk = paperRisk(
    equity.map((row) => ({ ts: row.ts, equity: Number(row.equity_usd) })),
    capital
  );
  return {
    strategy,
    profile: profileFor(strategy, cycles[0]?.note),
    first_trade_at: firstTrade?.ended_at ?? null,
    capital,
    open_cycle: open
      ? {
          cycle_id: open.cycle_id,
          started_at: open.started_at,
          ended_at: open.ended_at,
          signal_day: open.signal_day,
          status: open.status,
        }
      : null,
    last_rebalance: rebalance
      ? {
          ended_at: rebalance.ended_at,
          signal_day: rebalance.signal_day,
          trade_count: Number(rebalance.trade_count),
          backfilled: rebalance.status === 'BACKFILLED',
        }
      : null,
    last_run: latestRun
      ? {
          ended_at: latestRun.ended_at,
          signal_day: latestRun.signal_day,
          held: !flatOnEmpty(strategy) && Number(latestRun.trade_count) === 0,
          reason: Number(latestRun.trade_count) === 0 ? heldReason(latestRun.note) : null,
        }
      : null,
    trades: trades.map((row) => ({
      symbol: String(row.symbol).split('/')[0],
      side: row.side,
      qty: Number(row.qty),
      price: Number(row.price),
      notional: Number(row.notional_usd),
    })),
    day_legs,
    legs: legs.map((row) => ({
      market: String(row.symbol).split('/')[0],
      qty: Number(row.qty),
      entry: Number(row.entry_price),
      mark: Number(row.mark_price),
      notional: Number(row.notional_usd),
      price_pnl: Number(row.price_pnl),
      funding: Number(row.funding_pnl),
      ts: row.ts,
    })),
    latest: latest
      ? {
          ts: latest.ts,
          equity: Number(latest.equity_usd),
          price_pnl: Number(latest.price_pnl),
          funding_pnl: Number(latest.funding_pnl),
          fee_pnl: Number(latest.fee_pnl),
          gross: Number(latest.gross_notional),
          net: Number(latest.equity_usd) - capital,
          max_drawdown: risk.max_drawdown,
          sharpe: risk.sharpe,
          sharpe_days: risk.days,
          sharpe_min_days: risk.sharpe_min_days,
        }
      : null,
    equity: equity.map((row) => ({
      ts: row.ts,
      equity: Number(row.equity_usd),
      price_pnl: Number(row.price_pnl),
      funding_pnl: Number(row.funding_pnl),
    })),
    cycles: cycles.map((row) => ({
      cycle_id: row.cycle_id,
      ended_at: row.ended_at,
      signal_day: row.signal_day,
      status: row.status,
      trade_count: Number(row.trade_count),
      note: row.note,
    })),
  };
}
