'use client';

import useSWR from 'swr';
import { formatPnl } from '../../lib/format';
import PnlChart from '../../components/PnlChart';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function money(n: number) {
  return <span className={n >= 0 ? 'text-hl-profit' : 'text-hl-loss'}>{formatPnl(n)}</span>;
}

export default function PaperPage() {
  const { data, error, isLoading } = useSWR('/api/paper', fetcher, { refreshInterval: 300000 });
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
        <h1 className="text-lg font-semibold">Paper</h1>
        <p className="text-xs text-hl-secondary">
          MW dry run, simulated from its own $10,000. These rows are not live positions and are not in Overview.
        </p>
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
      {body?.trades?.length ? (
        <div className="panel overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Entry</th>
                <th>Notional</th>
              </tr>
            </thead>
            <tbody>
              {body.trades.map((row: any) => (
                <tr key={row.symbol}>
                  <td className="px-3 py-2">{row.symbol}</td>
                  <td className={`px-3 py-2 ${row.side === 'LONG' ? 'text-hl-profit' : 'text-hl-loss'}`}>{row.side}</td>
                  <td className="px-3 py-2 font-num text-right">{Number(row.qty).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                  <td className="px-3 py-2 font-num text-right">{Number(row.price).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                  <td className="px-3 py-2 font-num text-right">{formatPnl(row.notional).replace('+', '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
