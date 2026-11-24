'use client';

import { Fragment, useState } from 'react';
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

function PaperBook({ strategy }: { strategy: string }) {
  const { data, error, isLoading } = useSWR(`/api/paper?strategy=${strategy}`, fetcher, {
    refreshInterval: 300000,
  });
  const [sortKey, setSortKey] = useState<SortKey>('notional');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [openDay, setOpenDay] = useState<string | null>(null);

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
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{body?.profile?.title ?? strategy}</h1>
        <p className="text-xs text-hl-secondary">
          {body?.profile?.blurb ?? 'Paper book. Separate from live.'}
        </p>
      </div>
      {body?.open_cycle ? (
        <div className="panel p-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <div className="text-xs text-hl-secondary">Paper trading started (first trade)</div>
            <div className="font-num text-base font-semibold text-hl-accent">
              {fmtUtc(body.first_trade_at ?? body.open_cycle.ended_at)} UTC
            </div>
          </div>
          <div className="text-xs text-hl-secondary">
            = {fmtUtc(body.first_trade_at ?? body.open_cycle.ended_at, -7)} (UTC-7) · current book from {fmtUtc(body.open_cycle.ended_at)} UTC, signal day {body.open_cycle.signal_day} · marks update at each MW run (00:45 UTC daily) or manual refresh
          </div>
        </div>
      ) : null}
      {body?.profile?.overview?.length ? (
        <div className="panel p-3 space-y-1 text-xs text-hl-secondary">
          <div className="text-sm text-hl-text font-medium">Strategy</div>
          {body.profile.overview.map((line: string) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}
      {error || data?.ok === false ? (
        <div className="text-sm text-hl-loss">{error?.message || data?.error}</div>
      ) : null}
      {isLoading ? <div className="text-sm text-hl-secondary">Loading paper book…</div> : null}
      {latest ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {[
            ['Equity', latest.equity],
            ['Net', latest.net],
            ['Funding', latest.funding_pnl],
            ['Gross', latest.gross],
          ].map(([label, value]) => {
            const signed = label === 'Net' || label === 'Funding';
            const n = Number(value);
            const tone = signed ? (n >= 0 ? 'text-hl-profit' : 'text-hl-loss') : '';
            return (
              <div key={String(label)} className="panel p-3">
                <div className="text-xs text-hl-secondary">{label}</div>
                <div className={`font-num text-lg ${tone}`}>{formatPnl(n)}</div>
              </div>
            );
          })}
          <div className="panel p-3">
            <div className="text-xs text-hl-secondary">Max drawdown (daily)</div>
            <div className="font-num text-lg text-hl-loss">
              {latest.max_drawdown === null || latest.max_drawdown === undefined
                ? '—'
                : `${(Number(latest.max_drawdown) * 100).toFixed(2)}%`}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-xs text-hl-secondary">Sharpe</div>
            <div className="font-num text-lg">
              {latest.sharpe === null || latest.sharpe === undefined ? '—' : Number(latest.sharpe).toFixed(2)}
            </div>
            <div className="text-[10px] text-hl-muted">
              {latest.sharpe_days !== undefined && latest.sharpe_days < (latest.sharpe_min_days ?? 7)
                ? `needs ${latest.sharpe_min_days ?? 7} daily returns, have ${latest.sharpe_days}`
                : `daily, annualized √365, rf 0 (${latest.sharpe_days} days)`}
            </div>
          </div>
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
      {body?.last_rebalance || body?.last_run ? (
        <div className="panel p-3 text-xs space-y-1">
          <div className="text-hl-secondary">
            Last rebalance:{' '}
            <span className="font-num text-hl-text">
              {body.last_rebalance ? `${String(body.last_rebalance.ended_at).slice(0, 16)} UTC` : '—'}
            </span>
            {body.last_rebalance?.signal_day ? ` · signal day ${body.last_rebalance.signal_day}` : ''}
            {body.last_rebalance ? ` · ${body.last_rebalance.trade_count} trades` : ''}
            {body.last_rebalance?.backfilled ? ' · backfilled (run was held, data arrived later)' : ''}
          </div>
          {body.last_run?.held ? (
            <div className="text-hl-loss">
              Latest run {String(body.last_run.ended_at).slice(0, 16)} UTC held, no rebalance.
              {body.last_run.reason ? ` ${body.last_run.reason}` : ''}
            </div>
          ) : null}
        </div>
      ) : null}
      {body?.open_cycle ? (
        <div className="text-xs text-hl-secondary">
          Open book from {String(body.open_cycle.ended_at).slice(0, 16)} UTC, signal day {body.open_cycle.signal_day}.{' '}
          {body.profile?.fee_note ?? ''}{' '}
          Latest mark: {latest ? String(latest.ts).slice(0, 16) : '—'} UTC (hour bar close).
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
                <th>Funding</th>
                <th>Equity at last hour</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map(([day, row]) => {
                const open = openDay === day;
                const dayPositions: any[] = body?.day_legs?.[day] ?? [];
                return (
                  <Fragment key={day}>
                    <tr
                      onClick={() => setOpenDay(open ? null : day)}
                      className={`cursor-pointer ${open ? 'bg-hl-accent/10' : 'hover:bg-hl-hover'}`}
                    >
                      <td className="px-3 py-2 font-num">{day}</td>
                      <td className="px-3 py-2 font-num text-right">{money(row.equity_change)}</td>
                      <td className="px-3 py-2 font-num text-right">{money(row.funding_change)}</td>
                      <td className="px-3 py-2 font-num text-right">{row.end_equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    </tr>
                    {open ? (
                      <tr>
                        <td colSpan={4} className="px-3 pb-3 pt-1">
                          <div className="text-xs text-hl-muted pb-1">
                            Positions at last hourly mark of {day} UTC ({dayPositions.length} legs)
                          </div>
                          {dayPositions.length ? (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wide text-hl-muted">
                                  <th className="pb-1 text-left font-normal">Market</th>
                                  <th className="pb-1 text-right font-normal">Size</th>
                                  <th className="pb-1 text-right font-normal">Notional</th>
                                  <th className="pb-1 text-right font-normal">Entry → Mark</th>
                                  <th className="pb-1 text-right font-normal">Price PnL</th>
                                  <th className="pb-1 text-right font-normal">Funding</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dayPositions.map((leg) => (
                                  <tr key={leg.market}>
                                    <td className={`py-1 font-medium ${leg.qty > 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                                      {leg.market} <span className="text-hl-muted">{leg.qty > 0 ? 'LONG' : 'SHORT'}</span>
                                    </td>
                                    <td className="py-1 font-num text-right">
                                      {Math.abs(leg.qty).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                    </td>
                                    <td className="py-1 font-num text-right">
                                      ${leg.notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-1 font-num text-right">
                                      {leg.entry.toLocaleString(undefined, { maximumFractionDigits: 6 })} →{' '}
                                      {leg.mark.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                                    </td>
                                    <td className={`py-1 font-num text-right ${leg.price_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                                      {formatPnl(leg.price_pnl)}
                                    </td>
                                    <td className={`py-1 font-num text-right ${leg.funding >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                                      {formatPnl(leg.funding)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="text-xs text-hl-muted py-1">No positions that day.</div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default function PaperPage() {
  const { data, error, isLoading } = useSWR('/api/paper', fetcher, { refreshInterval: 300000 });
  const [picked, setPicked] = useState<string | null>(null);
  const books = data?.data?.books ?? [];
  const selected = picked ?? books[0]?.strategy ?? null;

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Paper</h1>
        <p className="text-xs text-hl-secondary">
          Each card is its own dry-run book. Pick one. These are not live positions and are not in Overview.
        </p>
      </div>
      {error || data?.ok === false ? (
        <div className="text-sm text-hl-loss">{error?.message || data?.error}</div>
      ) : null}
      {isLoading ? <div className="text-sm text-hl-secondary">Loading paper books…</div> : null}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {books.map((book: any) => {
          const active = selected === book.strategy;
          return (
            <button
              key={book.strategy}
              type="button"
              onClick={() => setPicked(book.strategy)}
              className={`panel p-3 text-left space-y-1 ${active ? 'border-hl-accent' : ''}`}
            >
              <div className="text-sm font-medium">{book.title}</div>
              <div className="text-xs text-hl-secondary">{book.blurb}</div>
              <div className="text-xs text-hl-muted">
                First trade {book.started_at ? fmtUtc(book.started_at) : '—'} UTC
              </div>
              <div className="text-xs text-hl-muted">
                Last rebalance {book.last_rebalance_at ? fmtUtc(book.last_rebalance_at) : '—'} UTC
              </div>
              <div className="font-num text-sm">
                Equity {book.equity === null ? '—' : formatPnl(book.equity).replace('+', '')}
                {' · '}
                Net{' '}
                {book.net === null ? (
                  '—'
                ) : (
                  <span className={book.net >= 0 ? 'text-hl-profit' : 'text-hl-loss'}>{formatPnl(book.net)}</span>
                )}
              </div>
              <div className="font-num text-xs text-hl-secondary">
                Max DD {book.max_drawdown === null ? '—' : `${(Number(book.max_drawdown) * 100).toFixed(2)}%`}
                {' · '}
                Sharpe {book.sharpe === null ? '—' : Number(book.sharpe).toFixed(2)}
              </div>
            </button>
          );
        })}
      </div>
      {selected ? <PaperBook strategy={selected} /> : null}
    </div>
  );
}
