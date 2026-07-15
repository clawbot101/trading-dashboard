'use client';

import useSWR from 'swr';
import { useState, useMemo } from 'react';
import EquityChart from '../components/EquityChart';
import PnlChart from '../components/PnlChart';

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

  const { data, error, isLoading } = useSWR(
    `/api/overview?range=${timeRange.toLowerCase()}`,
    fetcher,
    {
      refreshInterval: paused ? 0 : 60000, // 60s for analytics
      dedupingInterval: 30000,
    }
  );

  const stats = data?.data?.stats;
  const equityCurve = data?.data?.equityCurve ?? EMPTY_LIST;
  const cashFlowEvents = data?.data?.cashFlowEvents ?? EMPTY_LIST;
  const strategies = data?.data?.strategyLeaderboard ?? EMPTY_LIST;
  const venueSplit = data?.data?.venueSplit ?? EMPTY_LIST;
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

  const displayEquityCurve = useMemo(() => normalizeEquityCurve(equityCurve), [equityCurve]);

  // Compute PnL curve from equity curve
  const pnlCurve = useMemo(() => {
    if (!displayEquityCurve.length) return [];
    // Since-inception baseline: match account's initial equity (e.g. ~999 at start).
    const inceptionEquity = stats?.initial_equity ?? displayEquityCurve[0]?.equity ?? 0;
    const sortedFlows = [...cashFlowEvents]
      .filter((e: any) => e?.ts != null && e?.amount != null)
      .sort((a: any, b: any) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    let flowIdx = 0;
    let cumulativeCashFlow = 0;

    const out: Array<{ ts: string; pnl: number }> = [];
    for (const p of displayEquityCurve) {
      const pointTs = new Date(p.ts).getTime();
      const equityValue = Number(p.equity);
      if (!Number.isFinite(pointTs) || !Number.isFinite(equityValue)) continue;

      while (flowIdx < sortedFlows.length && new Date(sortedFlows[flowIdx].ts).getTime() <= pointTs) {
        cumulativeCashFlow += Number(sortedFlows[flowIdx].amount || 0);
        flowIdx += 1;
      }

      out.push({
        ts: p.ts,
        pnl: equityValue - inceptionEquity - cumulativeCashFlow,
      });
    }
    return out;
  }, [displayEquityCurve, stats?.initial_equity, cashFlowEvents]);

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

      {/* Top row: stat cards */}
      {!isLoading && stats && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <StatCard label="Total Equity" value={formatUsd(stats.total_equity)} />
          <StatCard
            label="Unrealized PnL"
            value={formatPnl(stats.total_unrealized_pnl)}
            pnl
          />
          <StatCard label="Realized PnL" value={formatPnl(stats.total_realized_pnl)} pnl />
          <StatCard label="Max Drawdown" value={formatPct(-stats.max_drawdown_pct)} negative />
          <StatCard
            label="Open Positions"
            value={`${stats.open_positions}`}
            subValue={formatUsd(stats.gross_exposure)}
          />
        </div>
      )}

      {/* Main content: equity chart + right column */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Equity/PnL chart (2/3) */}
        <div className="col-span-2 panel p-4">
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
                PnL (Since Start)
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
          {chartView === 'pnl' && (
            <div className="mt-2 text-xs text-hl-muted">
              Baseline equity: {formatUsd(stats?.initial_equity ?? null)}
            </div>
          )}
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-4">
          {/* Strategy leaderboard */}
          <div className="panel p-4">
            <div className="text-xs text-hl-secondary mb-2">Strategy Leaderboard</div>
            <div className="space-y-1">
              {strategies.length > 0 ? (
                strategies.slice(0, 5).map((s: any) => (
                  <div
                    key={s.strategy_name}
                    className="flex items-center justify-between p-2 bg-hl-hover rounded"
                  >
                    <span className="text-sm font-medium">{s.strategy_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-num text-sm text-hl-secondary">
                        {formatUsd(s.notional)}
                      </span>
                      <span
                        className={`font-num text-sm ${
                          s.pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'
                        }`}
                      >
                        {formatPnl(s.pnl)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-hl-muted text-sm py-4">No strategies</div>
              )}
            </div>
          </div>

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
                  key={`rebalance-${a.ts}-${a?.payload?.fill_count ?? 0}`}
                  className="flex items-center justify-between p-2 bg-hl-hover rounded text-sm border border-hl-border"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-hl-muted">{formatTimeAgo(a.ts)}</span>
                    <span className="badge-live">Rebalance</span>
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
}: {
  label: string;
  value: string;
  delta?: string;
  subValue?: string;
  pnl?: boolean;
  negative?: boolean;
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