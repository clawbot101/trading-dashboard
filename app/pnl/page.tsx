'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const payload = await r.json();
  if (!r.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed (${r.status})`);
  }
  return payload;
};

function PnlPageInner() {
  const searchParams = useSearchParams();
  const initialStrategy = searchParams.get('strategy') || 'all';
  const [strategy, setStrategy] = useState(initialStrategy);
  const [paused, setPaused] = useState(false);

  const strategyParam = encodeURIComponent(strategy);
  const swrOpts = {
    refreshInterval: paused ? 0 : 30000,
    dedupingInterval: 10000,
  };

  const { data: leaderboard } = useSWR(
    '/api/overview?range=all&parts=leaderboard',
    fetcher,
    swrOpts
  );
  const { data: statsPayload, error: statsError } = useSWR(
    `/api/overview?range=all&strategy=${strategyParam}&parts=stats`,
    fetcher,
    swrOpts
  );
  const { data: lifecyclePayload, error: lifecycleError } = useSWR(
    `/api/position-lifecycles?timeRange=ALL&strategy=${strategyParam}&page=1&pageSize=500`,
    fetcher,
    swrOpts
  );

  const strategies = leaderboard?.data?.strategyLeaderboard ?? [];
  const stats = statsPayload?.data?.stats;
  const lifecycles = lifecyclePayload?.data?.lifecycles ?? [];

  const { openRows, closedRows, openUnrealizedSum, closedRealizedSum } = useMemo(() => {
    const openRows = lifecycles.filter((r: any) => r.status === 'OPEN');
    const closedRows = lifecycles.filter((r: any) => r.status === 'CLOSED');
    const openUnrealizedSum = openRows.reduce(
      (a: number, r: any) => a + (Number(r.gross_trading_pnl) || 0),
      0
    );
    const closedRealizedSum = closedRows.reduce(
      (a: number, r: any) => a + (Number(r.net_pnl) || 0),
      0
    );
    return { openRows, closedRows, openUnrealizedSum, closedRealizedSum };
  }, [lifecycles]);

  const total = Number(stats?.inception_pnl ?? 0);
  const realized = Number(stats?.inception_realized_pnl ?? 0);
  const open = Number(stats?.total_unrealized_pnl ?? 0);

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-hl-text">Realized &amp; Open PnL</h1>
          <p className="text-sm text-hl-muted mt-1 max-w-2xl leading-relaxed">
            <strong className="text-hl-secondary">Open</strong> is exchange unrealized on positions
            still held. When you close or rotate a position, that leg moves to{' '}
            <strong className="text-hl-secondary">Realized</strong> (trade PnL, fees, funding).
            Totals match the Overview strategy row.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-hl-muted" htmlFor="pnl-strategy">
            Strategy
          </label>
          <select
            id="pnl-strategy"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="text-sm bg-hl-panel border border-hl-border rounded px-2 py-1"
          >
            <option value="all">All (shown strategies)</option>
            {strategies.map((s: any) => (
              <option key={s.strategy_name} value={s.strategy_name}>
                {s.strategy_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            className="px-3 py-1 text-sm rounded bg-hl-panel text-hl-secondary"
          >
            {paused ? 'Paused' : 'Live'}
          </button>
        </div>
      </div>

      {(statsError || lifecycleError) && (
        <div className="mb-4 p-3 bg-hl-loss/20 border border-hl-loss rounded text-hl-loss text-sm">
          Failed to load PnL data.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Total (since inception)" value={formatPnl(total)} sub="Wallet equity change" />
        <StatCard
          label="Realized"
          value={formatPnl(realized)}
          sub="Fees, funding, closed / rotated legs"
          tone={realized}
        />
        <StatCard label="Open (unrealized)" value={formatPnl(open)} sub="Mark on open positions" tone={open} />
      </div>

      <div className="panel p-4 mb-6">
        <div className="flex flex-wrap justify-between gap-2 mb-3">
          <div className="text-xs text-hl-secondary uppercase tracking-wide">
            Open legs — still unrealized ({openRows.length})
          </div>
          <div className="text-xs font-num text-hl-muted">
            Sum mark PnL: {formatPnl(openUnrealizedSum)} · Overview Open: {formatPnl(open)}
          </div>
        </div>
        <LifecycleTable rows={openRows} mode="open" />
      </div>

      <div className="panel p-4">
        <div className="flex flex-wrap justify-between gap-2 mb-3">
          <div className="text-xs text-hl-secondary uppercase tracking-wide">
            Closed legs — realized ({closedRows.length})
          </div>
          <div className="text-xs font-num text-hl-muted">
            Sum net PnL: {formatPnl(closedRealizedSum)} · fees &amp; funding included per leg
          </div>
        </div>
        <LifecycleTable rows={closedRows} mode="closed" />
      </div>

      <p className="text-[11px] text-hl-muted mt-4">
        Need raw fills? See{' '}
        <Link href="/trades" className="text-hl-accent hover:underline">
          Trades → Position history
        </Link>
        . Overview totals use wallet snapshots; leg tables are built from fills since each
        strategy&apos;s session start.
      </p>
    </div>
  );
}

export default function PnlPage() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-hl-muted">Loading…</div>}>
      <PnlPageInner />
    </Suspense>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: number;
}) {
  const color =
    tone == null || tone === 0
      ? 'text-hl-text'
      : tone >= 0
        ? 'text-hl-profit'
        : 'text-hl-loss';
  return (
    <div className="panel p-4">
      <div className="text-[10px] uppercase tracking-wide text-hl-muted mb-1">{label}</div>
      <div className={`text-xl font-num font-semibold ${color}`}>{value}</div>
      <div className="text-[11px] text-hl-muted mt-1">{sub}</div>
    </div>
  );
}

function LifecycleTable({ rows, mode }: { rows: any[]; mode: 'open' | 'closed' }) {
  if (!rows.length) {
    return (
      <div className="text-center text-hl-muted py-8 text-sm">
        No {mode === 'open' ? 'open' : 'closed'} legs in range
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full data-table text-sm">
        <thead>
          <tr className="text-[10px] uppercase text-hl-muted">
            <th className="text-left pb-2">Opened</th>
            {mode === 'closed' ? <th className="text-left pb-2">Closed</th> : null}
            <th className="text-left pb-2">Strategy</th>
            <th className="text-left pb-2">Symbol</th>
            <th className="text-left pb-2">Side</th>
            <th className="text-right pb-2">{mode === 'open' ? 'Unrealized' : 'Net realized'}</th>
            <th className="text-right pb-2">Fees</th>
            <th className="text-right pb-2">Funding</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.lifecycle_id} className="border-t border-hl-border/40">
              <td className="py-2 text-xs text-hl-muted">{formatTime(row.open_time)}</td>
              {mode === 'closed' ? (
                <td className="py-2 text-xs text-hl-muted">{formatTime(row.close_time)}</td>
              ) : null}
              <td className="py-2">{row.strategy_name || '—'}</td>
              <td className="py-2 font-medium">{row.symbol}</td>
              <td className="py-2">{row.side}</td>
              <td
                className={`py-2 text-right font-num ${
                  pnlClass(mode === 'open' ? row.gross_trading_pnl : row.net_pnl)
                }`}
              >
                {formatPnl(mode === 'open' ? row.gross_trading_pnl : row.net_pnl)}
              </td>
              <td className="py-2 text-right font-num text-hl-secondary">{formatUsd(row.total_fee)}</td>
              <td className={`py-2 text-right font-num ${pnlClass(row.total_funding)}`}>
                {formatPnl(row.total_funding)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatUsd(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${n.toFixed(2)}`;
}

function formatPnl(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function formatTime(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pnlClass(n: number | null | undefined) {
  if (n == null || n === 0) return 'text-hl-secondary';
  return n >= 0 ? 'text-hl-profit' : 'text-hl-loss';
}
