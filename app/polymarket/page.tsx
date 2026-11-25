'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import PmEquityChart from '../../components/PmEquityChart';

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
const VARIANT_COLOR: Record<string, string> = {
  'taker_L0.2': '#38bdf8',
  'taker_L0.5': '#22c55e',
  'taker_L1.0': '#a78bfa',
  maker_a: '#f59e0b',
  maker_b: '#f472b6',
};
// Per-round PnL column for each variant (see getPolymarketRounds aliases).
const ROUND_PNL_KEY: Record<string, string> = {
  'taker_L0.2': 'pnl_t02',
  'taker_L0.5': 'pnl_t05',
  'taker_L1.0': 'pnl_t10',
  maker_a: 'pnl_a',
  maker_b: 'pnl_b',
};
const START_TOTAL = 10000;
const ROUND_SECONDS = 300;

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
  const [chartMode, setChartMode] = useState<'pnl' | 'total'>('pnl');
  const body = data?.data;
  const desc = body?.description;
  const status = body?.status;
  const summary: any[] = body?.summary ?? [];
  const daily: any[] = body?.daily ?? [];
  const rounds: any[] = body?.rounds ?? [];

  // One line per variant. 'total' starts at $10,000; 'pnl' starts at 0. $100 fixed stake, no compounding.
  // Every decision for the selected decision time. Newest first in the table.
  const roundRows = rounds.filter((r) => Number(r.T_offset) === offset).slice(-50).reverse();

  // Price paid per round for the selected decision time: taker 0.5 s fill price and maker b bid.
  const priceSeries = useMemo(() => {
    const at = rounds.filter((r) => Number(r.T_offset) === offset && r.traded);
    const taker = at.filter((r) => r.px_t05 !== null).map((r) => ({ time: Number(r.t0) + 30, value: Number(r.px_t05) }));
    const maker = at.filter((r) => r.usd_b).map((r) => ({ time: Number(r.t0) + 30, value: Number(r.bid_b) }));
    const ask = at.filter((r) => r.ask !== null).map((r) => ({ time: Number(r.t0) + 30, value: Number(r.ask) }));
    return [
      { name: 'Taker 0.5 s price', color: '#22c55e', points: taker, key: 'pt' },
      { name: 'Maker b bid', color: '#f472b6', points: maker, key: 'pm' },
      { name: 'Ask at decision', color: '#94a3b8', points: ask, key: 'pa' },
    ];
  }, [rounds, offset]);

  const equitySeries = useMemo(() => {
    // Only rounds we actually traded and that have resolved; skipped rounds have no PnL.
    const at = rounds.filter((r) => Number(r.T_offset) === offset && r.traded && r.won !== null);
    if (!at.length) return [];
    const start = chartMode === 'total' ? START_TOTAL : 0;
    return VARIANTS.map((v) => {
      let level = start;
      const points = [{ time: Number(at[0].t0), value: start }];
      for (const r of at) {
        level += Number(r[ROUND_PNL_KEY[v]] ?? 0);
        points.push({ time: Number(r.t0) + ROUND_SECONDS, value: level });
      }
      return { name: VARIANT_LABEL[v], color: VARIANT_COLOR[v], points, last: level, key: v };
    });
  }, [rounds, offset, chartMode]);

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
            <div className="text-xs text-hl-secondary">Rounds seen</div>
            <div className="font-num text-lg">{status.total_markets}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs text-hl-secondary">Resolved</div>
            <div className="font-num text-lg">{status.resolved_markets}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs text-hl-secondary">Latest round</div>
            <div className="font-num text-sm">{utc(status.last_t0)}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs text-hl-secondary">Last written</div>
            <div className="font-num text-sm">{status.last_written_at ? String(status.last_written_at).slice(0, 16).replace('T', ' ') + ' UTC' : '—'}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-hl-secondary">No Polymarket rounds recorded yet.</div>
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
          <div className="text-xs text-hl-secondary mb-2">Decision time {offset} s · $100 per round · cumulative · refreshed every 15 min (the chart and daily table update after each round)</div>
          <table className="w-full text-xs font-num">
            <thead>
              <tr className="text-hl-secondary">
                <th className="text-left font-normal pb-1">Variant</th>
                <th className="text-right font-normal">Rounds</th>
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

      {equitySeries.length ? (
        <div className="panel p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-hl-text font-medium">
              {chartMode === 'pnl' ? `PnL since start (decision time ${offset} s)` : `Account total from $10,000 (decision time ${offset} s)`}
            </div>
            <div className="flex gap-1">
              {(['pnl', 'total'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className={`px-2 py-1 text-xs rounded border ${chartMode === m ? 'border-hl-accent text-hl-accent' : 'border-hl-border text-hl-secondary'}`}
                >
                  {m === 'pnl' ? 'PnL' : 'Account total'}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-hl-muted">
            $100 fixed stake per round, no compounding. Each line is a separate what-if account, not one combined account.
          </div>
          <PmEquityChart
            series={equitySeries}
            base={chartMode === 'total' ? START_TOTAL : 0}
            baseTitle={chartMode === 'total' ? 'start' : '0'}
            height={280}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-num">
            {equitySeries.map((s) => (
              <div key={s.key} className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5" style={{ backgroundColor: s.color }} />
                <span className="text-hl-secondary">{VARIANT_LABEL[s.key].split(' (')[0]}</span>
                <span className={s.last - (chartMode === 'total' ? START_TOTAL : 0) >= 0 ? 'text-hl-profit' : 'text-hl-loss'}>
                  {chartMode === 'pnl'
                    ? `${s.last >= 0 ? '+' : '-'}$${Math.abs(s.last).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `$${s.last.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </span>
              </div>
            ))}
          </div>
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

      {priceSeries[0].points.length ? (
        <div className="panel p-3 space-y-2">
          <div className="text-sm text-hl-text font-medium">Prices paid per round at {offset} s</div>
          <div className="text-xs text-hl-muted">
            One point per traded round. Taker 0.5 s = the price we would have paid buying 0.5 s after the decision. Maker b = the bid we rested. Ask = best ask when we decided.
          </div>
          <PmEquityChart series={priceSeries} precision={3} height={240} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-num">
            {priceSeries.map((s) => (
              <div key={s.key} className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5" style={{ backgroundColor: s.color }} />
                <span className="text-hl-secondary">{s.name}</span>
                <span className="text-hl-muted">{s.points.length} rounds</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {roundRows.length ? (
        <div className="panel p-3 overflow-x-auto">
          <div className="text-xs text-hl-secondary mb-2">
            Every round at {offset} s, newest first (last 50). Prices are per share, 0 to 1. A share pays $1 if its side wins.
          </div>
          <table className="w-full text-xs font-num whitespace-nowrap">
            <thead>
              <tr className="text-hl-secondary">
                <th className="text-left font-normal pb-1">Round start (UTC)</th>
                <th className="text-right font-normal">Side</th>
                <th className="text-right font-normal">BTC gap (bp)</th>
                <th className="text-right font-normal">Ask at decision</th>
                <th className="text-right font-normal">Taker 0.5 s price</th>
                <th className="text-right font-normal">Taker 0.5 s filled</th>
                <th className="text-right font-normal">Maker b bid</th>
                <th className="text-right font-normal">Maker b filled $</th>
                <th className="text-right font-normal">Winner</th>
                <th className="text-right font-normal">Taker 0.5 s PnL</th>
                <th className="text-right font-normal">Maker b PnL</th>
              </tr>
            </thead>
            <tbody>
              {roundRows.map((r) => (
                <tr key={`${r.t0}-${r.T_offset}`} className="border-t border-hl-border">
                  <td className="py-1 text-left">{utc(r.t0)}</td>
                  <td className="text-right">{r.side ?? '—'}</td>
                  <td className="text-right">{num(r.gap_bp, 1)}</td>
                  <td className="text-right">{r.traded ? num(r.ask, 3) : <span className="text-hl-muted">skip: {r.skip_reason}</span>}</td>
                  <td className="text-right">{r.traded && r.px_t05 !== null ? num(r.px_t05, 3) : '—'}</td>
                  <td className="text-right">{r.fr_t05 !== null ? pct(r.fr_t05, 0) : '—'}</td>
                  <td className="text-right">{num(r.bid_b, 3)}</td>
                  <td className="text-right">{r.usd_b ? `$${Number(r.usd_b).toFixed(2)}` : 'no fill'}</td>
                  <td className="text-right">{r.winner ?? 'pending'}</td>
                  <td className="text-right">{r.traded ? usd(r.pnl_t05) : '—'}</td>
                  <td className="text-right">{r.traded ? usd(r.pnl_b) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
