'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatPnl } from '../../lib/format';
import PnlChart from '../../components/PnlChart';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Format a timestamp as "YYYY-MM-DD HH:mm" in a fixed UTC offset (hours). */
function fmtUtc(ts: string, offsetHours = 0): string {
  const d = new Date(new Date(ts).getTime() + offsetHours * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function money(n: number) {
  return <span className={n >= 0 ? 'text-hl-profit' : 'text-hl-loss'}>{formatPnl(n)}</span>;
}

type SortKey = 'market' | 'size' | 'notional' | 'entry' | 'mark' | 'pnl' | 'margin' | 'funding';

const SORTS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'market', label: 'Market', align: 'left' },
  { key: 'size', label: 'Size', align: 'right' },
  { key: 'notional', label: 'Position Value', align: 'right' },
  { key: 'entry', label: 'Entry Price', align: 'right' },
  { key: 'mark', label: 'Mark Price', align: 'right' },
  { key: 'pnl', label: 'PnL (ROE %)', align: 'right' },
  { key: 'margin', label: 'Margin', align: 'right' },
  { key: 'funding', label: 'Funding', align: 'right' },
];

function sortValue(row: any, key: SortKey): number | string {
  if (key === 'market') return String(row.market);
  if (key === 'size') return Math.abs(Number(row.qty));
  if (key === 'pnl') return Number(row.price_pnl);
  if (key === 'margin') return Number(row.notional);
  return Number(row[key]);
}

export default function PaperPage() {
  const { data, error, isLoading } = useSWR('/api/paper', fetcher, { refreshInterval: 300000 });
  const [sortKey, setSortKey] = useState<SortKey>('notional');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'market' ? 'asc' : 'desc');
  }
  const body = data?.data;
  const latest = body?.latest;
  // Last hourly point per UTC day, then day-over-day change. The first day is measured from the $10,000 open.
  const lastByDay = new Map<string, any>();
  for (const row of body?.equity ?? []) {
    lastByDay.set(String(row.ts).slice(0, 10), row);
  }
  const daily: [string, any][] = [];
  let prev = { equity: body?.capital ?? 0, price_pnl: 0, funding_pnl: 0 };
  for (const [day, row] of lastByDay) {
    daily.push([
      day,
      {
        end_equity: row.equity,
        equity_change: row.equity - prev.equity,
        price_change: row.price_pnl - prev.price_pnl,
        funding_change: row.funding_pnl - prev.funding_pnl,
        since_open: row.equity - (body?.capital ?? 0),
      },
    ]);
    prev = { equity: row.equity, price_pnl: row.price_pnl, funding_pnl: row.funding_pnl };
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Paper · MW majors vs weak alts</h1>
        <p className="text-xs text-hl-secondary">
          Dry run, simulated from its own $10,000. Not live positions, not in Overview.
        </p>
      </div>
      {body?.open_cycle ? (
        <div className="panel p-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <div className="text-xs text-hl-secondary">Paper trading started</div>
            <div className="font-num text-base font-semibold text-hl-accent">
              {fmtUtc(body.open_cycle.ended_at)} UTC
            </div>
          </div>
          <div className="text-xs text-hl-secondary">
            = {fmtUtc(body.open_cycle.ended_at, -7)} (UTC-7) · signal day {body.open_cycle.signal_day} · marked hourly since then
          </div>
        </div>
      ) : null}
      <div className="panel p-3 space-y-1 text-xs text-hl-secondary">
        <div className="text-sm text-hl-text font-medium">Strategy</div>
        <div>
          Market-neutral. Each day it goes long the majors BTC, ETH, HYPE, ZEC and SOL, 10% of capital each, and shorts
          the 5 alts whose LunarCrush social dominance fell most versus their own 30-day history, 10% each.
        </div>
        <div>
          Universe: top 60 Hyperliquid perps by 30-day median of close × volume. PAXG and the majors are not shorted. If fewer
          than 15 alts score, there is no short leg that day.
        </div>
        <div>
          Signal: social dominance z-score, log-based, using the LunarCrush bar from two days before the run. Rebalance at
          00:45 UTC daily. The book is 1x gross ($10,000), with no stops, no risk governor, and no fees in the paper PnL.
        </div>
      </div>
      {error || data?.ok === false ? (
        <div className="text-sm text-hl-loss">{error?.message || data?.error}</div>
      ) : null}
      {isLoading ? <div className="text-sm text-hl-secondary">Loading paper book…</div> : null}
      {latest ? (
        <div className="grid grid-cols-5 gap-2">
          {[
            ['Equity', latest.equity],
            ['Net', latest.net],
            ['Price', latest.price_pnl],
            ['Funding', latest.funding_pnl],
            ['Gross', latest.gross],
          ].map(([label, value]) => (
            <div key={String(label)} className="panel p-3">
              <div className="text-xs text-hl-secondary">{label}</div>
              <div className="font-num text-lg">{formatPnl(Number(value))}</div>
            </div>
          ))}
        </div>
      ) : null}
      {body?.equity?.length ? (
        <div className="panel p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-hl-secondary">PnL since open (hourly mark, paper only)</div>
            <div className="text-xs text-hl-muted">
              {latest ? `Latest ${String(latest.ts).slice(0, 16)} UTC` : ''}
            </div>
          </div>
          <PnlChart
            data={body.equity.map((row: any) => ({
              ts: row.ts,
              pnl: Number(row.equity) - Number(body.capital || 0),
            }))}
            height={256}
          />
        </div>
      ) : null}
      {body?.open_cycle ? (
        <div className="text-xs text-hl-secondary">
          Open book from {String(body.open_cycle.ended_at).slice(0, 16)} UTC, signal day {body.open_cycle.signal_day}.
          Fees are zero because no order was sent. Each hour is marked at that hour's bar close. Latest bar: {latest ? String(latest.ts).slice(0, 16) : '—'} UTC.
        </div>
      ) : null}
      {body?.legs?.length ? (
        <div className="panel overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                {SORTS.map((col) => (
                  <th key={col.key} className={col.align === 'right' ? 'text-right' : 'text-left'}>
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className={`inline-flex w-full items-center gap-1 whitespace-nowrap hover:text-hl-text ${
                        col.align === 'right' ? 'justify-end' : 'justify-start'
                      } ${sortKey === col.key ? 'text-hl-accent' : ''}`}
                    >
                      <span>{col.label}</span>
                      <span className={`text-[10px] ${sortKey === col.key ? 'opacity-100' : 'opacity-30'}`}>
                        {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...body.legs]
                .sort((a: any, b: any) => {
                  const av = sortValue(a, sortKey);
                  const bv = sortValue(b, sortKey);
                  const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : av - Number(bv);
                  return sortDir === 'asc' ? cmp : -cmp;
                })
                .map((row: any) => {
                const long = row.qty > 0;
                const side = long ? 'text-hl-profit' : 'text-hl-loss';
                const roe = row.notional > 0 ? (row.price_pnl / row.notional) * 100 : 0;
                return (
                  <tr key={row.market}>
                    <td className={`px-3 py-2 font-medium ${side}`}>
                      {row.market} <span className="text-hl-muted text-xs">1x</span>
                    </td>
                    <td className={`px-3 py-2 font-num text-right ${side}`}>
                      {Math.abs(row.qty).toLocaleString(undefined, { maximumFractionDigits: 4 })} {row.market}
                    </td>
                    <td className="px-3 py-2 font-num text-right">${row.notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 font-num text-right">{row.entry.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                    <td className="px-3 py-2 font-num text-right">{row.mark.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                    <td className={`px-3 py-2 font-num text-right ${row.price_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                      {formatPnl(row.price_pnl)} ({roe >= 0 ? '+' : ''}{roe.toFixed(1)}%)
                    </td>
                    <td className="px-3 py-2 font-num text-right">${row.notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className={`px-3 py-2 font-num text-right ${row.funding >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                      {formatPnl(row.funding)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-xs text-hl-muted">
            Click a column to sort. Margin equals position value because the book is 1x.
          </div>
        </div>
      ) : null}
      {daily.length ? (
        <div className="panel overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th>Day (UTC)</th>
                <th>Day change</th>
                <th>Price</th>
                <th>Funding</th>
                <th>Equity at last hour</th>
                <th>Since open</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map(([day, row]) => (
                <tr key={day}>
                  <td className="px-3 py-2 font-num">{day}</td>
                  <td className="px-3 py-2 font-num text-right">{money(row.equity_change)}</td>
                  <td className="px-3 py-2 font-num text-right">{money(row.price_change)}</td>
                  <td className="px-3 py-2 font-num text-right">{money(row.funding_change)}</td>
                  <td className="px-3 py-2 font-num text-right">{row.end_equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 font-num text-right">{money(row.since_open)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
