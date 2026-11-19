'use client';

import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function names(list: string[] | undefined) {
  if (!list?.length) return '—';
  return list.join(', ');
}

export default function RulesPage() {
  const book = useSearchParams().get('book') === 'l4' ? 'l4' : 'l2';
  const { data, error, isLoading } = useSWR(`/api/analysis/rules?book=${book}`, fetcher, {
    refreshInterval: 60000,
  });
  const body = data?.data;

  return (
    <div className="space-y-4">
      {error || data?.ok === false ? (
        <div className="text-sm text-hl-loss">{error?.message || data?.error}</div>
      ) : null}
      {isLoading ? <div className="text-sm text-hl-secondary">Loading rules…</div> : null}
      {body ? (
        <>
          <div className="panel p-3 text-sm space-y-2">
            <div className="text-hl-secondary">{body.note}</div>
            <div>
              Latest traded signal day{' '}
              <span className="font-num">{body.latest?.signal_day ?? '—'}</span>
              {body.latest?.status === 'held' ? ` · held (${body.latest.reason})` : ''}
            </div>
            <div>Target long: {names(body.latest?.longs)}</div>
            <div>Target short: {names(body.latest?.shorts)}</div>
            <div>Open long: {names(body.open_long)}</div>
            <div>Open short: {names(body.open_short)}</div>
            <div>Missing long: {names(body.missing_long)}</div>
            <div>Missing short: {names(body.missing_short)}</div>
            {book === 'l2' ? (
              <>
                <div>Extra long: {names(body.extra_long)}</div>
                <div>Extra short: {names(body.extra_short)}</div>
              </>
            ) : null}
          </div>
          <div className="panel overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th>Run day</th>
                  <th>Signal day</th>
                  <th>Status</th>
                  <th>Long</th>
                  <th>Short</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {(body.days ?? []).map((row: any) => (
                  <tr key={`${row.run_day}-${row.signal_day}-${row.cycle_start}`}>
                    <td className="px-3 py-2 font-num">{row.run_day}</td>
                    <td className="px-3 py-2 font-num">{row.signal_day}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{names(row.longs)}</td>
                    <td className="px-3 py-2">{names(row.shorts)}</td>
                    <td className="px-3 py-2 text-hl-secondary">{row.reason ?? ''}</td>
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
