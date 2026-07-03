'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Time range options
const TIME_RANGES = ['24H', '7D', '30D', '90D', 'ALL'];

export default function OverviewPage() {
  const [timeRange, setTimeRange] = useState('24H');
  const [paused, setPaused] = useState(false);

  const { data, error, isLoading } = useSWR(
    `/api/overview?timeRange=${timeRange}`,
    fetcher,
    {
      refreshInterval: paused ? 0 : 60000, // 60s for analytics
      dedupingInterval: 30000,
    }
  );

  const stats = data?.data?.stats;
  const equityCurve = data?.data?.equityCurve || [];
  const strategies = data?.data?.strategyLeaderboard || [];
  const venueSplit = data?.data?.venueSplit || [];
  const pnlAttribution = data?.data?.pnlAttribution || [];
  const recentFills = data?.data?.recentFills || [];
  const asOf = data?.as_of;

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

      {/* Top row: 6 stat cards */}
      {!isLoading && stats && (
        <div className="grid grid-cols-6 gap-3 mb-6">
          <StatCard label="Total Equity" value={formatUsd(stats.total_equity)} />
          <StatCard
            label="24h PnL"
            value={formatPnl(stats.pnl_24h)}
            delta={formatPct(stats.pnl_24h_pct)}
            pnl
          />
          <StatCard label="Unrealized PnL" value={formatPnl(stats.total_unrealized_pnl)} pnl />
          <StatCard label="Realized PnL" value={formatPnl(stats.total_realized_pnl)} pnl />
          <StatCard label="Max Drawdown" value={formatPct(-stats.max_drawdown_pct)} negative />
          <StatCard
            label="Open Positions"
            value={`${stats.open_positions}`}
            delta={formatUsd(stats.gross_exposure)}
          />
        </div>
      )}

      {/* Main content: equity chart + right column */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Equity chart (2/3) */}
        <div className="col-span-2 panel p-4">
          <div className="text-xs text-hl-secondary mb-2">Account Equity</div>
          {equityCurve.length > 0 ? (
            <div className="h-64 bg-hl-hover rounded flex items-center justify-center">
              {/* Placeholder for TradingView chart */}
              <div className="text-hl-muted text-sm">
                [TradingView chart: {equityCurve.length} points]
              </div>
            </div>
          ) : (
            <div className="h-64 bg-hl-hover rounded flex items-center justify-center text-hl-muted">
              No equity data
            </div>
          )}
          <div className="text-xs text-hl-muted mt-2">as of {formatTime(asOf)}</div>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-4">
          {/* Strategy leaderboard */}
          <div className="panel p-4">
            <div className="text-xs text-hl-secondary mb-2">Strategy Leaderboard</div>
            <div className="space-y-1">
              {strategies.length > 0 ? (
                strategies.slice(0, 5).map((s: any, i: number) => (
                  <div
                    key={s.strategy_name}
                    className="flex items-center justify-between p-2 bg-hl-hover rounded"
                  >
                    <span className="text-sm font-medium">{s.strategy_name}</span>
                    <span
                      className={`font-num text-sm ${
                        s.pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'
                      }`}
                    >
                      {formatPnl(s.pnl)}
                    </span>
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

      {/* Bottom row: PnL attribution + recent fills */}
      <div className="grid grid-cols-2 gap-4">
        {/* PnL attribution */}
        <div className="panel p-4">
          <div className="text-xs text-hl-secondary mb-2">PnL Attribution (Daily)</div>
          {pnlAttribution.length > 0 ? (
            <div className="h-48 bg-hl-hover rounded flex items-center justify-center">
              {/* Placeholder for Recharts stacked bar */}
              <div className="text-hl-muted text-sm">
                [Recharts stacked bar: {pnlAttribution.length} days]
              </div>
            </div>
          ) : (
            <div className="h-48 bg-hl-hover rounded flex items-center justify-center text-hl-muted">
              No attribution data
            </div>
          )}
        </div>

        {/* Recent fills */}
        <div className="panel p-4">
          <div className="text-xs text-hl-secondary mb-2">Recent Activity</div>
          <div className="space-y-1">
            {recentFills.length > 0 ? (
              recentFills.slice(0, 10).map((f: any) => (
                <div
                  key={`${f.ts}-${f.symbol}`}
                  className="flex items-center justify-between p-2 bg-hl-hover rounded text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-hl-muted">{formatTimeAgo(f.ts)}</span>
                    <span className="font-medium">{f.strategy_name}</span>
                    <span className={`badge-${f.side.toLowerCase()}`}>{f.side}</span>
                    <span>{f.symbol}</span>
                  </div>
                  <div className="font-num">
                    {f.fill_qty}@{formatPrice(f.fill_price, 2)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-hl-muted text-sm py-4">No recent fills</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-xs text-hl-muted">
        Last update: {formatTime(asOf)} | Returns assume no mid-period deposits/withdrawals
      </div>
    </div>
  );
}

// Stat card component
function StatCard({
  label,
  value,
  delta,
  pnl,
  negative,
}: {
  label: string;
  value: string;
  delta?: string;
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
      {delta && <div className="delta text-hl-muted">{delta}</div>}
    </div>
  );
}

// Formatting helpers
function formatUsd(n: number | null) {
  if (!n) return '$--';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPnl(n: number | null) {
  if (!n) return '$--';
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) >= 1e6) return `$${sign}${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${sign}${(n / 1e3).toFixed(2)}K`;
  return `$${sign}${n.toFixed(2)}`;
}

function formatPct(n: number | null) {
  if (!n) return '--';
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