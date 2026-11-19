/**
 * MW paper book. Reads paper_* tables only, never live fills or equity.
 */

import { query } from './db';

export const PAPER_PROFILES: Record<string, { title: string; blurb: string; overview: string[] }> = {
  mw_majors_weak: {
    title: 'MW · majors vs weak alts',
    blurb: 'Long five majors, short the five alts whose social dominance fell the most. 1x on $10,000.',
    overview: [
      'Market-neutral. Each day it goes long BTC, ETH, HYPE, ZEC and SOL, 10% of capital each, and shorts the 5 alts whose LunarCrush social dominance fell most versus their own 30-day history, 10% each.',
      'Universe: top 60 Hyperliquid perps by 30-day median of close × volume. PAXG and the majors are not shorted. If fewer than 15 alts score, there is no short leg that day.',
      'Signal uses the LunarCrush bar from two days before the run. Rebalance 00:45 UTC. No stops, no risk governor, and no fees in the paper PnL.',
    ],
  },
};

function profileFor(strategy: string) {
  return (
    PAPER_PROFILES[strategy] ?? {
      title: strategy,
      blurb: 'Paper book. Its own capital, separate from live.',
      overview: [],
    }
  );
}

export async function listPaperBooks() {
  const rows = await query<any>(
    `
      SELECT c.strategy_name,
             MIN(c.ended_at) FILTER (WHERE c.trade_count > 0) AS started_at,
             (ARRAY_AGG(c.capital_usd ORDER BY c.ended_at DESC) FILTER (WHERE c.trade_count > 0))[1] AS capital_usd
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
    books.push({
      strategy: row.strategy_name,
      ...profileFor(row.strategy_name),
      started_at: row.started_at,
      capital,
      equity,
      net: equity === null ? null : equity - capital,
      mark_ts: latest?.ts ?? null,
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
  const open = cycles.find((row) => Number(row.trade_count) > 0);
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
  const capital = Number(open?.capital_usd ?? latest?.equity_usd ?? 0);
  return {
    strategy,
    profile: profileFor(strategy),
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
    trades: trades.map((row) => ({
      symbol: String(row.symbol).split('/')[0],
      side: row.side,
      qty: Number(row.qty),
      price: Number(row.price),
      notional: Number(row.notional_usd),
    })),
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
