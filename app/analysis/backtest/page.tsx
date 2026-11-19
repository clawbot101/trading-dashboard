'use client';

import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { formatPnl } from '../../../lib/format';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function BacktestPage() {
  const book = useSearchParams().get('book') === 'l4' ? 'l4' : 'l2';
  const { data, error, isLoading } = useSWR(`/api/analysis/backtest?book=${book}`, fetcher);
  const body = data?.data;

  return (
    <div className="space-y-4">
      <p className="text-xs text-hl-secondary">
        Saved replay from {body?.from ?? '2026-10-23'} to {body?.to ?? '2026-11-15'}, generated{' '}
        {body?.generated ?? '2026-11-16'}. It does not include days after that file.
      </p>
      {error || data?.ok === false ? (
        <div className="text-sm text-hl-loss">{error?.message || data?.error}</div>
      ) : null}
      {isLoading ? <div className="text-sm text-hl-secondary">Loading replay…</div> : null}
      {body && !body.available ? (
        <div className="panel p-3 text-sm text-hl-secondary">Replay file is not on this machine.</div>
      ) : null}
      {body?.available ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="panel p-3">
              <div className="text-xs text-hl-secondary">Live</div>
              <div className="font-num text-lg">{formatPnl(body.live_pnl)}</div>
            </div>
            <div className="panel p-3">
              <div className="text-xs text-hl-secondary">Backtest</div>
              <div className="font-num text-lg">{formatPnl(body.backtest_pnl)}</div>
            </div>
            <div className="panel p-3">
              <div className="text-xs text-hl-secondary">Live − backtest</div>
              <div className="font-num text-lg">{formatPnl(body.live_pnl - body.backtest_pnl)}</div>
            </div>
          </div>
          <div className="panel overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Live status</th>
                  <th>Live</th>
                  <th>Backtest</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {[...body.days].reverse().map((row: any) => (
                  <tr key={row.day}>
                    <td className="px-3 py-2 font-num">{row.day}</td>
                    <td className="px-3 py-2 text-hl-secondary">{row.live_status || '—'}</td>
                    <td className="px-3 py-2 font-num text-right">{formatPnl(row.live_pnl)}</td>
                    <td className="px-3 py-2 font-num text-right">{formatPnl(row.backtest_pnl)}</td>
                    <td className="px-3 py-2 font-num text-right">{formatPnl(row.gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
