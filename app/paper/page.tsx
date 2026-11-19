'use client';

import useSWR from 'swr';
import { formatPnl } from '../../lib/format';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function money(n: number) {
  return <span className={n >= 0 ? 'text-hl-profit' : 'text-hl-loss'}>{formatPnl(n)}</span>;
}

export default function PaperPage() {
  const { data, error, isLoading } = useSWR('/api/paper', fetcher, { refreshInterval: 300000 });
  const body = data?.data;
  const latest = body?.latest;
  const daily = new Map<string, any>();
  for (const row of body?.equity ?? []) {
    daily.set(String(row.ts).slice(0, 10), row);
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
      {body?.open_cycle ? (
        <div className="text-xs text-hl-secondary">
          Open book from {String(body.open_cycle.ended_at).slice(0, 16)} UTC, signal day {body.open_cycle.signal_day}.
          Fees are zero because no order was sent. Marked through {latest ? String(latest.ts).slice(0, 16) : '—'} UTC.
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
      {daily.size ? (
        <div className="panel overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th>Day</th>
                <th>Equity</th>
                <th>Price</th>
                <th>Funding</th>
              </tr>
            </thead>
            <tbody>
              {[...daily.entries()].reverse().map(([day, row]) => (
                <tr key={day}>
                  <td className="px-3 py-2 font-num">{day}</td>
                  <td className="px-3 py-2 font-num text-right">{money(row.equity)}</td>
                  <td className="px-3 py-2 font-num text-right">{money(row.price_pnl)}</td>
                  <td className="px-3 py-2 font-num text-right">{money(row.funding_pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
