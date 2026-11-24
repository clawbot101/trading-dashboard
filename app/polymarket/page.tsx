'use client';

import { useState } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const OFFSETS = [-20, -15, -10, -5, -3];
const VARIANT_LABEL: Record<string, string> = {
  'taker_L0.2': 'Taker, 0.2 s delay',
  'taker_L0.5': 'Taker, 0.5 s delay',
  'taker_L1.0': 'Taker, 1.0 s delay',
  maker_a: 'Maker a (join bid, cancel at t0)',
  maker_b: 'Maker b (cancel at t0 + 5 s)',
};
const VARIANTS = ['taker_L0.2', 'taker_L0.5', 'taker_L1.0', 'maker_a', 'maker_b'];

function utc(ts: number | string | null | undefined) {
  if (ts === null || ts === undefined || ts === '') return '—';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function pct(n: number | null | undefined, dp = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `${(Number(n) * 100).toFixed(dp)}%`;
}

function usd(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  return <span className={v >= 0 ? 'text-hl-profit' : 'text-hl-loss'}>{`${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`}</span>;
}

function num(n: number | null | undefined, dp = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toFixed(dp);
}

export default function PolymarketPage() {
  const { data, error, isLoading } = useSWR('/api/polymarket', fetcher, { refreshInterval: 60000 });
  const [offset, setOffset] = useState(-10);
  const body = data?.data;
  const desc = body?.description;
  const status = body?.status;
  const summary: any[] = body?.summary ?? [];
  const daily: any[] = body?.daily ?? [];
  const recent: any[] = body?.recent ?? [];

  const rowsAt = summary.filter((r) => Number(r.T_offset) === offset);
  const primary = summary.filter((r) => Number(r.T_offset) === -10);
  const tk = primary.find((r) => r.variant === 'taker_L0.5');
  const makers = primary.filter((r) => String(r.variant).startsWith('maker'));

  const dailyAt = daily.filter((r) => Number(r.T_offset) === offset);
  let cum: Record<string, number> = { 'taker_L0.2': 0, 'taker_L0.5': 0, 'taker_L1.0': 0, maker_a: 0, maker_b: 0 };
  const dailyRows = dailyAt.map((r) => {
    const out: any = { day: r.day, traded: Number(r.traded) };
    for (const v of VARIANTS) {
      const day = Number(r[v] ?? 0);
      cum[v] += day;
      out[v] = { day, cum: cum[v] };
    }
    return out;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{desc?.title ?? 'Polymarket BTC 5-minute'}</h1>
        <p className="text-xs text-hl-secondary">{desc?.blurb}</p>
      </div>

      {desc?.overview?.length ? (
        <div className="panel p-3 space-y-1 text-xs text-hl-secondary">
          <div className="text-sm text-hl-text font-medium">Strategy</div>
          {desc.overview.map((line: string) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}

      {error || data?.ok === false ? (
        <div className="text-sm text-hl-loss">{error?.message || data?.error}</div>
      ) : null}
      {isLoading ? <div className="text-sm text-hl-secondary">Loading Polymarket paper…</div> : null}

      {status ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="panel p-3">
            <div className="text-xs text-hl-secondary">Markets seen</div>
            <div className="font-num text-lg">{status.total_markets}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs text-hl-secondary">Resolved</div>
            <div className="font-num text-lg">{status.resolved_markets}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs text-hl-secondary">Latest market</div>
            <div className="font-num text-sm">{utc(status.last_t0)}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs text-hl-secondary">Last written</div>
            <div className="font-num text-sm">{status.last_written_at ? String(status.last_written_at).slice(0, 16).replace('T', ' ') + ' UTC' : '—'}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-hl-secondary">No Polymarket markets recorded yet.</div>
      )}

      {tk || makers.length ? (
        <div className="panel p-3 text-xs space-y-1">
          <div className="text-sm text-hl-text font-medium">14-day rule check (at -10 s, to be decided by a person)</div>
          {tk ? (
            <div className="text-hl-secondary">
              Taker 0.5 s: per $ <span className="font-num text-hl-text">{pct(tk.pnl_per_usd)}</span>, fill{' '}
              <span className="font-num text-hl-text">{pct(tk.fill_rate, 0)}</span> (bar: at least +3% and 60% fill)
            </div>
          ) : null}
          {makers.map((m) => (
            <div key={m.variant} className="text-hl-secondary">
              {VARIANT_LABEL[m.variant]}: per $ <span className="font-num text-hl-text">{pct(m.pnl_per_usd)}</span>, fills/day{' '}
              <span className="font-num text-hl-text">{num(m.fills_per_day, 1)}</span> (bar: at least +3% and 30 fills/day)
            </div>
          ))}
          <div className="text-hl-muted">History for comparison: about +5% per $ at -10 s and +8% at -5 s (2,000 markets, gap at least 2 bp).</div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {OFFSETS.map((o) => (
          <button
            key={o}
            onClick={() => setOffset(o)}
            className={`px-2 py-1 text-xs rounded border ${offset === o ? 'border-hl-accent text-hl-accent' : 'border-hl-border text-hl-secondary'}`}
          >
            {o} s
          </button>
        ))}
      </div>

      {rowsAt.length ? (
        <div className="panel p-3 overflow-x-auto">
          <div className="text-xs text-hl-secondary mb-2">Decision time {offset} s · $100 per market · cumulative</div>
          <table className="w-full text-xs font-num">
            <thead>
              <tr className="text-hl-secondary">
                <th className="text-left font-normal pb-1">Variant</th>
                <th className="text-right font-normal">Markets</th>
                <th className="text-right font-normal">Traded</th>
                <th className="text-right font-normal">Fill rate</th>
                <th className="text-right font-normal">Fills/day</th>
                <th className="text-right font-normal">Avg ask</th>
                <th className="text-right font-normal">Avg fill</th>
                <th className="text-right font-normal">Slippage</th>
                <th className="text-right font-normal">Hit rate</th>
                <th className="text-right font-normal">Per $</th>
                <th className="text-right font-normal">PnL $</th>
                <th className="text-right font-normal">90% range per $</th>
              </tr>
            </thead>
            <tbody>
              {VARIANTS.map((v) => {
                const r = rowsAt.find((x) => x.variant === v);
                if (!r) return null;
                return (
                  <tr key={v} className="border-t border-hl-border">
                    <td className="py-1 text-left">{VARIANT_LABEL[v]}</td>
                    <td className="text-right">{r.markets}</td>
                    <td className="text-right">{r.traded}</td>
                    <td className="text-right">{pct(r.fill_rate, 0)}</td>
                    <td className="text-right">{num(r.fills_per_day, 1)}</td>
                    <td className="text-right">{num(r.px_decision, 3)}</td>
                    <td className="text-right">{num(r.px_fill, 3)}</td>
                    <td className="text-right">{num(r.slippage, 3)}</td>
                    <td className="text-right">{pct(r.hit_rate, 0)}</td>
                    <td className="text-right">{pct(r.pnl_per_usd)}</td>
                    <td className="text-right">{usd(r.pnl_usd)}</td>
                    <td className="text-right">
                      {r.ci90_lo === null || r.ci90_lo === undefined ? '—' : `${pct(r.ci90_lo, 1)} to ${pct(r.ci90_hi, 1)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {dailyRows.length ? (
        <div className="panel p-3 overflow-x-auto">
          <div className="text-xs text-hl-secondary mb-2">Daily PnL $ at {offset} s (cumulative in brackets)</div>
          <table className="w-full text-xs font-num">
            <thead>
              <tr className="text-hl-secondary">
                <th className="text-left font-normal pb-1">Day (UTC)</th>
                <th className="text-right font-normal">Traded</th>
                {VARIANTS.map((v) => (
                  <th key={v} className="text-right font-normal">{VARIANT_LABEL[v].split(' (')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((d) => (
                <tr key={d.day} className="border-t border-hl-border">
                  <td className="py-1 text-left">{d.day}</td>
                  <td className="text-right">{d.traded}</td>
                  {VARIANTS.map((v) => (
                    <td key={v} className="text-right">
                      {usd(d[v].day)} <span className="text-hl-muted">({usd(d[v].cum)})</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {recent.length ? (
        <div className="panel p-3 overflow-x-auto">
          <div className="text-xs text-hl-secondary mb-2">Last 20 markets at -10 s</div>
          <table className="w-full text-xs font-num">
            <thead>
              <tr className="text-hl-secondary">
                <th className="text-left font-normal pb-1">Market start</th>
                <th className="text-right font-normal">Side</th>
                <th className="text-right font-normal">Gap bp</th>
                <th className="text-right font-normal">Ask</th>
                <th className="text-right font-normal">Traded</th>
                <th className="text-right font-normal">Winner</th>
                <th className="text-right font-normal">Taker 0.5 PnL</th>
                <th className="text-right font-normal">Maker b PnL</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.t0} className="border-t border-hl-border">
                  <td className="py-1 text-left">{utc(Number(r.t0))}</td>
                  <td className="text-right">{r.side ?? '—'}</td>
                  <td className="text-right">{num(r.gap_bp, 1)}</td>
                  <td className="text-right">{num(r.fav_best_ask, 2)}</td>
                  <td className="text-right">{r.traded ? 'yes' : r.skip_reason || 'no'}</td>
                  <td className="text-right">{r.winner ?? (r.status === 'ok' ? '—' : 'pending')}</td>
                  <td className="text-right">{usd(r.pnl_taker_0_5_usd)}</td>
                  <td className="text-right">{usd(r.pnl_maker_b_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
