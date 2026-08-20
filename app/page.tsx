'use client';

import useSWR from 'swr';
import { useState, useMemo, useEffect } from 'react';
import EquityChart from '../components/EquityChart';
import PnlChart from '../components/PnlChart';
import { buildPnlCurve, alignCashFlowsToEquityCatchUp } from '../lib/pnlCurve';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const payload = await r.json();
  if (!r.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed (${r.status})`);
  }
  return payload;
};

// Time range options
const TIME_RANGES = ['24H', '7D', '30D', '90D', 'ALL'];
const EMPTY_LIST: any[] = [];

export default function OverviewPage() {
  const [timeRange, setTimeRange] = useState('24H');
  const [paused, setPaused] = useState(false);
  const [chartView, setChartView] = useState<'equity' | 'pnl'>('pnl');
  const [activityPage, setActivityPage] = useState(1);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');
  const periodLabel = timeRange === 'ALL' ? 'Since Start' : `Since ${timeRange}`;

  // Split into the sections that depend on the selected strategy and the ones that
  // do not. Switching strategy then only refetches the former, instead of redoing
  // the leaderboard and venue split (~4s of query time) that come back identical.
  // keepPreviousData holds the last values on screen during a switch, so the page
  // no longer blanks out and flashes the connection-error banner.
  const { data, error, isLoading } = useSWR(
    `/api/overview?range=${timeRange.toLowerCase()}&strategy=${encodeURIComponent(selectedStrategy)}&parts=stats,curve`,
    fetcher,
    {
      refreshInterval: paused ? 0 : 60000, // 60s for analytics
      dedupingInterval: 30000,
      keepPreviousData: true,
    }
  );

  // Strategy-independent, so the key deliberately omits the selected strategy and
  // stays warm across switches. Also feeds the strategy picker itself.
  const { data: sharedData } = useSWR(
    `/api/overview?range=${timeRange.toLowerCase()}&parts=leaderboard,venue`,
    fetcher,
    {
      refreshInterval: paused ? 0 : 60000,
      dedupingInterval: 30000,
      keepPreviousData: true,
    }
  );

  const stats = data?.data?.stats;
  const equityCurve = data?.data?.equityCurve ?? EMPTY_LIST;
  const cashFlowEvents = data?.data?.cashFlowEvents ?? EMPTY_LIST;
  const strategies = sharedData?.data?.strategyLeaderboard ?? EMPTY_LIST;
  const venueSplit = sharedData?.data?.venueSplit ?? EMPTY_LIST;
  const asOf = data?.as_of_ts;

  const { data: activityData, isLoading: isActivityLoading } = useSWR(
    `/api/recent-activity?tab=all&page=${activityPage}&pageSize=10`,
    fetcher,
    {
      refreshInterval: paused ? 0 : 60000,
      dedupingInterval: 10000,
    }
  );

  const recentActivities = activityData?.data?.items ?? EMPTY_LIST;
  const activityTotalPages = activityData?.data?.totalPages ?? 1;
  const activityTotalRows = activityData?.data?.total ?? 0;

  useEffect(() => {
    setActivityPage(1);
  }, [selectedStrategy]);

  const displayEquityCurve = useMemo(() => normalizeEquityCurve(equityCurve), [equityCurve]);

  // Compute PnL curve from equity curve (deposits excluded via cashFlowEvents)
  const pnlCurve = useMemo(() => {
    if (!displayEquityCurve.length) return [];
    const firstMeaningful =
      displayEquityCurve.find((p) => Number(p.equity) > 0) ?? displayEquityCurve[0];
    const periodBaseline = Number(stats?.equity_24h_ago);
    const inceptionMs = stats?.initial_equity_ts
      ? new Date(stats.initial_equity_ts).getTime()
      : NaN;
    const rangeMs: Record<string, number> = {
      '24H': 24 * 3600_000,
      '7D': 7 * 24 * 3600_000,
      '30D': 30 * 24 * 3600_000,
      '90D': 90 * 24 * 3600_000,
    };
    // Windows longer than live history (30D/90D): curve starts at first print —
    // same chart baseline as ALL, not a bogus period-start equity.
    const historyInsideWindow =
      timeRange === 'ALL' ||
      (Number.isFinite(inceptionMs) &&
        rangeMs[timeRange] != null &&
        inceptionMs > Date.now() - rangeMs[timeRange]);
    const baselineEquity = historyInsideWindow
      ? firstMeaningful?.equity ?? 0
      : periodBaseline > 0
        ? periodBaseline
        : firstMeaningful?.equity ?? 0;

    return buildPnlCurve({
      equityCurve: displayEquityCurve,
      cashFlowEvents: alignCashFlowsToEquityCatchUp(displayEquityCurve, cashFlowEvents),
      baselineEquity,
      baselineTs: firstMeaningful?.ts,
    });
  }, [displayEquityCurve, stats?.equity_24h_ago, stats?.initial_equity_ts, cashFlowEvents, timeRange]);

  // Data freshness indicator
  const dataFreshness = useMemo(() => {
    if (!asOf) return { text: 'Connecting...', seconds: null };
    const diff = Date.now() - new Date(asOf).getTime();
    const seconds = Math.floor(diff / 1000);
    const mins = Math.floor(seconds / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return { text: `${hours}h ago`, seconds };
    if (mins > 0) return { text: `${mins}m ago`, seconds };
    return { text: 'Just now', seconds };
  }, [asOf]);

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1 text-sm rounded ${
                timeRange === r
                  ? 'bg-hl-accent text-hl-bg'
                  : 'bg-hl-panel text-hl-secondary hover:bg-hl-hover'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPaused(!paused)}
          className={`px-3 py-1 text-sm rounded ${
            paused
              ? 'bg-hl-loss text-hl-text'
              : 'bg-hl-panel text-hl-secondary'
          }`}
        >
          {paused ? '⏸ Paused' : '▶ Live'}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 p-3 bg-hl-loss/20 border border-hl-loss rounded text-hl-loss">
          Connection error. Retrying...
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 bg-hl-panel rounded animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Strategy performance table */}
      <div className="panel p-4 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-xs text-hl-secondary">Strategy Performance</div>
          <button
            type="button"
            onClick={() => setSelectedStrategy('all')}
            className={`px-2 py-0.5 text-[10px] rounded transition ${
              selectedStrategy === 'all'
                ? 'bg-hl-accent/20 ring-1 ring-hl-accent text-hl-text'
                : 'bg-hl-hover text-hl-secondary hover:bg-hl-panel'
            }`}
          >
            All Strategies · Portfolio View
          </button>
        </div>
        {strategies.length > 0 ? (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-hl-border text-[10px] uppercase tracking-wide text-hl-muted">
                <th className="w-36 pb-2 text-left font-normal">Strategy</th>
                <th className="pb-2 text-right font-normal">Capital → Equity</th>
                <th className="pb-2 text-right font-normal">Realized / Open</th>
                <th className="pb-2 text-right font-normal">Total PnL (Since Inception)</th>
              </tr>
            </thead>
            <tbody>
              {strategies.slice(0, 5).map((s: any) => (
                <tr
                  key={s.strategy_name}
                  onClick={() =>
                    setSelectedStrategy((prev) =>
                      prev === s.strategy_name ? 'all' : s.strategy_name
                    )
                  }
                  className={`cursor-pointer border-b border-hl-border/40 transition last:border-0 ${
                    selectedStrategy === s.strategy_name
                      ? 'bg-hl-accent/10'
                      : 'hover:bg-hl-hover'
                  }`}
                >
                  <td
                    className="w-36 py-2.5 pr-3 font-medium leading-tight"
                    title={s.strategy_name}
                  >
                    <span className="line-clamp-2 break-words">
                      {String(s.strategy_name).replace(/_/g, '_\u200b')}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-num text-hl-secondary">
                    {formatUsd(s.contributed_capital)} → {formatUsd(s.latest_equity)}
                  </td>
                  <td className="py-2.5 text-right font-num">
                    <span
                      className={
                        s.inception_realized_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'
                      }
                    >
                      {formatPnl(s.inception_realized_pnl)}
                    </span>
                    <span className="text-hl-muted"> / </span>
                    <span className={s.unrealized_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'}>
                      {formatPnl(s.unrealized_pnl)}
                    </span>
                  </td>
                  <td
                    className={`py-2.5 text-right font-num ${
                      s.inception_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'
                    }`}
                  >
                    <span className="text-base">{formatPnl(s.inception_pnl)}</span>{' '}
                    <span className="text-xs">({formatPct(s.inception_return_pct)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-hl-muted text-sm py-4">No strategies</div>
        )}
      </div>

      {/* Main content: equity chart + right column */}
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_220px] gap-4">
        {/* Equity/PnL chart */}
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setChartView('equity')}
                className={`px-2 py-0.5 text-xs rounded ${
                  chartView === 'equity'
                    ? 'bg-hl-accent text-hl-bg'
                    : 'bg-hl-hover text-hl-secondary'
                }`}
              >
                Equity
              </button>
              <button
                onClick={() => setChartView('pnl')}
                className={`px-2 py-0.5 text-xs rounded ${
                  chartView === 'pnl'
                    ? 'bg-hl-accent text-hl-bg'
                    : 'bg-hl-hover text-hl-secondary'
                }`}
              >
                PnL ({periodLabel})
              </button>
            </div>
            <div className="text-xs text-hl-muted">
              Updated {dataFreshness.text}
            </div>
          </div>
          {chartView === 'equity' ? (
            <EquityChart data={displayEquityCurve} height={256} />
          ) : (
            <PnlChart data={pnlCurve} height={256} />
          )}
          <div className="mt-2 text-xs text-hl-muted">
            {chartView === 'equity' ? (
              <>
                Account equity (wallet balance). Deposits raise this line; they are not
                trading profit.
              </>
            ) : (
              <>
                Trading PnL only (equity change minus deposits/withdrawals). Baseline:{' '}
                {formatUsd(
                  (() => {
                    const firstEq =
                      displayEquityCurve.find((p) => Number(p.equity) > 0)?.equity ?? null;
                    const inceptionMs = stats?.initial_equity_ts
                      ? new Date(stats.initial_equity_ts).getTime()
                      : NaN;
                    const rangeMs: Record<string, number> = {
                      '24H': 24 * 3600_000,
                      '7D': 7 * 24 * 3600_000,
                      '30D': 30 * 24 * 3600_000,
                      '90D': 90 * 24 * 3600_000,
                    };
                    const historyInsideWindow =
                      timeRange === 'ALL' ||
                      (Number.isFinite(inceptionMs) &&
                        rangeMs[timeRange] != null &&
                        inceptionMs > Date.now() - rangeMs[timeRange]);
                    if (historyInsideWindow) return firstEq;
                    return Number(stats?.equity_24h_ago) > 0
                      ? stats?.equity_24h_ago
                      : firstEq;
                  })()
                )}
              </>
            )}
          </div>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-4">
          {/* Portfolio totals */}
          {stats && (
            <div className="grid grid-cols-1 gap-2">
              <StatCard
                label="Contributed Capital"
                value={formatUsd(stats.contributed_capital)}
                subValue="Net deposits since inception"
                compact
              />
              <StatCard
                label="Current Equity"
                value={formatUsd(stats.total_equity)}
                compact
              />
              <StatCard
                label="Total PnL (Inception)"
                value={formatPnl(stats.inception_pnl)}
                pnl
                compact
              />
              <StatCard
                label="Realized PnL (Inception)"
                value={formatPnl(stats.inception_realized_pnl)}
                pnl
                compact
              />
              <StatCard
                label="Unrealized PnL (Now)"
                value={formatPnl(stats.total_unrealized_pnl)}
                subValue={`${stats.open_positions} open · ${formatUsd(stats.gross_exposure)} notional`}
                pnl
                compact
              />
            </div>
          )}

          {/* Venue split */}
          <div className="panel p-4">
            <div className="text-xs text-hl-secondary mb-2">Venue Split</div>
            {venueSplit.length > 0 ? (
              <div className="space-y-2">
                {venueSplit.map((v: any) => (
                  <div key={v.venue} className="flex items-center justify-between">
                    <span className="text-sm">{v.venue}</span>
                    <span className="font-num text-sm">{formatUsd(v.equity)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-hl-muted text-sm py-4">No venue data</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: recent fills */}
      <div className="panel p-4">
        <div className="text-xs text-hl-secondary mb-2">Recent Activity</div>
        <div className="space-y-1">
          {!isActivityLoading && recentActivities.length > 0 ? (
            recentActivities.map((a: any) =>
              a.kind === 'rebalance' ? (
                <div
                  key={`rebalance-${a.ts}-${a?.payload?.strategy_name ?? 'unknown'}-${a?.payload?.fill_count ?? 0}`}
                  className="flex items-center justify-between p-2 bg-hl-hover rounded text-sm border border-hl-border"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-hl-muted">{formatTimeAgo(a.ts)}</span>
                    <span className="badge-live">Rebalance</span>
                    <span className="font-medium">{a?.payload?.strategy_name ?? 'unknown'}</span>
                    <span className="font-medium text-hl-secondary">
                      {a?.payload?.same_position
                        ? 'Same position (no open/close at UTC 00:00 window)'
                        : `Rebalanced (${a?.payload?.fill_count ?? 0} fills in UTC 00:00 window)`}
                    </span>
                  </div>
                  <div className="font-num text-hl-muted">UTC {formatUtcHm(a.ts)}</div>
                </div>
              ) : (
                <div
                  key={`${a.payload?.ts}-${a.payload?.symbol}-${a.payload?.side}-${a.payload?.fill_qty}`}
                  className="flex items-center justify-between p-2 bg-hl-hover rounded text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-hl-muted">{formatTimeAgo(a.payload.ts)}</span>
                    <span className="font-medium">{a.payload.strategy_name}</span>
                    <span
                      className={
                        String(a.payload.side || '').toLowerCase() === 'buy'
                          ? 'badge-long'
                          : 'badge-short'
                      }
                    >
                      {String(a.payload.side || '').toLowerCase() === 'buy' ? 'LONG' : 'SHORT'}
                    </span>
                    <span className="text-hl-muted">{String(a.payload.side || '').toUpperCase()}</span>
                    <span>{a.payload.symbol}</span>
                    <span className="text-hl-muted">{a.payload.venue}</span>
                  </div>
                  <div className="font-num">
                    {a.payload.fill_qty}@{formatPrice(a.payload.fill_price, 2)}{' '}
                    <span className="text-hl-muted">
                      fee:{' '}
                      {a.payload?.fee != null && Number.isFinite(Number(a.payload.fee))
                        ? formatPrice(Number(a.payload.fee), 4)
                        : '--'}
                    </span>
                  </div>
                </div>
              )
            )
          ) : isActivityLoading ? (
            <div className="text-hl-muted text-sm py-4">Loading recent activity...</div>
          ) : (
            <div className="text-hl-muted text-sm py-4">No recent activity</div>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 text-sm">
          <button
            onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
            disabled={activityPage <= 1}
            className="px-3 py-1 rounded bg-hl-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <div className="text-hl-secondary">
            Page {activityPage} of {activityTotalPages} ({activityTotalRows} activities)
          </div>
          <button
            onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
            disabled={activityPage >= activityTotalPages}
            className="px-3 py-1 rounded bg-hl-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-xs text-hl-muted">
        Last update: {formatTime(asOf)} | PnL excludes deposits/withdrawals when cash flow data is provided
      </div>
    </div>
  );
}

function normalizeEquityCurve(points: any[]) {
  if (!points.length) return points;

  const map = new Map<string, any>();
  for (const p of points) {
    if (!p?.ts) continue;
    const ts = new Date(p.ts).toISOString();
    const equity = Number(p.equity);
    if (!Number.isFinite(equity)) continue;
    // Keep latest value for duplicated timestamp keys.
    map.set(ts, { ts, equity });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
}

// Stat card component
function StatCard({
  label,
  value,
  delta,
  subValue,
  pnl,
  negative,
  compact,
}: {
  label: string;
  value: string;
  delta?: string;
  subValue?: string;
  pnl?: boolean;
  negative?: boolean;
  /** Side-column variant: label and value share a row so five of these fit
   *  alongside the chart instead of stacking into a very tall column. */
  compact?: boolean;
}) {
  const valueClass = pnl
    ? value.includes('+') || (!value.includes('-') && value !== '$0.00')
      ? 'text-hl-profit'
      : value.includes('-')
      ? 'text-hl-loss'
      : ''
    : negative
    ? 'text-hl-loss'
    : '';

  if (compact) {
    return (
      <div className="panel px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wide text-hl-muted">{label}</div>
          <div className={`font-num text-sm ${valueClass}`}>{value}</div>
        </div>
        {subValue && <div className="text-[10px] text-hl-muted">{subValue}</div>}
        {delta && !subValue && <div className="text-[10px] text-hl-muted">{delta}</div>}
      </div>
    );
  }

  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className={`value ${valueClass}`}>{value}</div>
      {subValue && <div className="value text-hl-secondary text-sm">{subValue}</div>}
      {delta && !subValue && <div className="delta text-hl-muted">{delta}</div>}
    </div>
  );
}

// Formatting helpers
function formatUsd(n: number | null) {
  if (n == null) return '$--';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPnl(n: number | null) {
  if (n == null) return '$--';
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) >= 1e6) return `$${sign}${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${sign}${(n / 1e3).toFixed(2)}K`;
  return `$${sign}${n.toFixed(2)}`;
}

function formatPct(n: number | null) {
  if (n == null) return '--';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function formatPrice(n: number, dp = 2) {
  return n.toFixed(dp);
}

function formatTime(ts: string | null) {
  if (!ts) return '--';
  return new Date(ts).toLocaleString();
}

function formatTimeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h`;
  if (mins > 0) return `${mins}m`;
  return 'now';
}

function formatUtcHm(ts: string) {
  const d = new Date(ts);
  const hh = `${d.getUTCHours()}`.padStart(2, '0');
  const mm = `${d.getUTCMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
}