'use client';

import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { formatPnl } from '../../../lib/format';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function Cell({ n }: { n: number }) {
  return <td className={`px-3 py-2 font-num text-right ${n >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>{formatPnl(n)}</td>;
}

export default function PnlPage() {
  const book = useSearchParams().get('book') === 'l4' ? 'l4' : 'l2';
  const { data, error, isLoading } = useSWR(`/api/analysis/pnl?book=${book}&range=30D`, fetcher, {
    refreshInterval: 60000,
  });
  const body = data?.data;
  const totals = body?.totals;

  return (
    <div className="space-y-4">
      <p className="text-xs text-hl-secondary">
        Last 30 days. Net is price + funding + exchange fees. Turnover is the traded notional times 4.5 bps, shown beside the fees, not added again.
      </p>
      {error || data?.ok === false ? (
        <div className="text-sm text-hl-loss">{error?.message || data?.error}</div>
      ) : null}
      {isLoading ? <div className="text-sm text-hl-secondary">Loading PnL…</div> : null}
      {totals ? (
          <div className="grid grid-cols-5 gap-2">
          {[
            ['Net', totals.net],
            ['Price', totals.price_pnl],
            ['Funding', totals.funding],
            ['Fees', totals.fees],
            ['Turnover 4.5 bps', -totals.turnover],
          ].map(([label, value]) => (
            <div key={String(label)} className="panel p-3">
              <div className="text-xs text-hl-secondary">{label}</div>
              <div className={`font-num text-lg ${Number(value) >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                {formatPnl(Number(value))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {body?.days ? (
        <div className="panel overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th>Day</th>
                <th>Price</th>
                <th>Funding</th>
                <th>Fees</th>
                <th>Turnover</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {[...body.days].reverse().map((row: any) => {
                const net = Number(row.price_pnl) + Number(row.funding) + Number(row.fees);
                return (
                  <tr key={row.date}>
                    <td className="px-3 py-2 font-num">{row.date}</td>
                    <Cell n={Number(row.price_pnl)} />
                    <Cell n={Number(row.funding)} />
                    <Cell n={Number(row.fees)} />
                    <Cell n={-Number(row.turnover)} />
                    <Cell n={net} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
