'use client';

import useSWR from 'swr';
import { useState, useMemo, useEffect, Fragment } from 'react';
import EquityChart from '../components/EquityChart';
import PnlChart from '../components/PnlChart';
import ArchivedStrategiesPanel from '../components/ArchivedStrategiesPanel';
import { buildPnlCurve, alignCashFlowsToEquityCatchUp } from '../lib/pnlCurve';
import { walletTail } from '../lib/format';

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

function curvePayloadMatches(
  payload: any,
  range: string,
  strategy: string,
  resolution: 'coarse' | 'fine'
) {
  return (
    payload?.query?.range === range &&
    payload?.query?.strategy === strategy &&
    payload?.query?.resolution === resolution &&
    Array.isArray(payload?.data?.equityCurve)
  );
}

export default function OverviewPage() {
  const [timeRange, setTimeRange] = useState('24H');
  const [paused, setPaused] = useState(false);
  const [chartView, setChartView] = useState<'equity' | 'pnl'>('pnl');
  const [activityPage, setActivityPage] = useState(1);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');
  const periodLabel = timeRange === 'ALL' ? 'Since Start' : `Since ${timeRange}`;

  // Stats and the curve are separate requests so the cards are not stuck behind
  // the chart query. The curve itself is two-step: a coarse preview (hourly for
  // 24H, daily otherwise) paints immediately, then the fine series replaces it.
  // Fine does not start until the matching preview is in, so it does not compete
  // with that preview on the single-CPU database.
  const rangeParam = timeRange.toLowerCase();
  const strategyParam = encodeURIComponent(selectedStrategy);
  const swrOpts = {
    refreshInterval: paused ? 0 : 60000,
    dedupingInterval: 30000,
    keepPreviousData: true,
  };

  const { data: statsPayload, error: statsError, isLoading } = useSWR(
    `/api/overview?range=${rangeParam}&strategy=${strategyParam}&parts=stats`,
    fetcher,
    swrOpts
  );

  const { data: coarsePayload, error: coarseError } = useSWR(
    `/api/overview?range=${rangeParam}&strategy=${strategyParam}&parts=curve&resolution=coarse`,
    fetcher,
    swrOpts
  );

  const coarseReady = curvePayloadMatches(coarsePayload, rangeParam, selectedStrategy, 'coarse');
  const { data: finePayload, error: fineError } = useSWR(
    coarseReady
      ? `/api/overview?range=${rangeParam}&strategy=${strategyParam}&parts=curve&resolution=fine`
      : null,
    fetcher,
    swrOpts
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

  const fineReady = curvePayloadMatches(finePayload, rangeParam, selectedStrategy, 'fine');
  const curvePayload = fineReady
    ? finePayload
    : coarseReady
      ? coarsePayload
      : finePayload ?? coarsePayload;
  const curveIsPreview = coarseReady && !fineReady;

  const stats = statsPayload?.data?.stats;
  const equityCurve = curvePayload?.data?.equityCurve ?? EMPTY_LIST;
  const cashFlowEvents = curvePayload?.data?.cashFlowEvents ?? EMPTY_LIST;
  const strategies = sharedData?.data?.strategyLeaderboard ?? EMPTY_LIST;
  const venueSplit = sharedData?.data?.venueSplit ?? EMPTY_LIST;
  const asOf = curvePayload?.as_of_ts ?? statsPayload?.as_of_ts;

  const positionsKey =
    selectedStrategy === 'all'
      ? null
      : `/api/positions?strategy=${encodeURIComponent(selectedStrategy)}`;
  const { data: positionsPayload, error: positionsError } = useSWR(
    positionsKey,
    fetcher,
    {
      refreshInterval: paused ? 0 : 15000,
      dedupingInterval: 5000,
    }
  );
  const bookReady = positionsPayload?.query?.strategy === selectedStrategy;
  const bookPositions = bookReady ? positionsPayload?.data?.positions ?? EMPTY_LIST : EMPTY_LIST;
  const bookLoading = selectedStrategy !== 'all' && !bookReady && !positionsError;

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

  // Summed from the leaderboard rather than read from `stats`, because `stats`
  // is scoped to the selected strategy and would stop being a portfolio total
  // as soon as one is picked.
  const portfolioTotals = useMemo(() => {
    const sum = (key: string) =>
      strategies.reduce((acc: number, s: any) => acc + (Number(s[key]) || 0), 0);
    const contributed = sum('contributed_capital');
    const pnl = sum('inception_pnl');
    return {
      contributed,
      equity: sum('latest_equity'),
      realized: sum('inception_realized_pnl'),
      unrealized: sum('unrealized_pnl'),
      pnl,
      returnPct: contributed > 0 ? (pnl / contributed) * 100 : 0,
    };
  }, [strategies]);

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
      {(statsError || coarseError) && !sharedData?.data?.strategyLeaderboard?.length && (
        <div className="mb-4 p-3 bg-hl-loss/20 border border-hl-loss rounded text-hl-loss">
          Connection error. Retrying...
        </div>
      )}
      {(statsError || coarseError) && sharedData?.data?.strategyLeaderboard?.length > 0 && (
        <div className="mb-4 p-3 bg-hl-panel border border-hl-border rounded text-hl-secondary text-sm">
          Chart or summary is slow to load (database busy). Strategy table below should still update.
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
        <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
          <div className="text-xs text-hl-secondary">Strategy Performance</div>
          <div className="flex items-center gap-3 flex-wrap">
            <ArchivedStrategiesPanel />
            <div className="text-[10px] text-hl-muted">
              Click a row to see its positions · click again to clear
            </div>
          </div>
        </div>
        {strategies.length > 0 ? (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-hl-border text-[10px] uppercase tracking-wide text-hl-muted">
                <th className="w-44 pb-2 text-left font-normal">Strategy</th>
                <th className="pb-2 text-right font-normal">Capital → Equity</th>
                <th
                  className="pb-2 text-right font-normal"
                  title="Realized: fees, funding, closed/changed positions since start. Open: exchange unrealized on open positions."
                >
                  Realized / Open
                </th>
                <th className="pb-2 text-right font-normal">Total PnL (Since Inception)</th>
              </tr>
            </thead>
            <tbody>
              {/* Portfolio total. Shown as a row rather than a toggle so the
                  combined result is readable without discovering a control. */}
              <tr
                onClick={() => setSelectedStrategy('all')}
                className={`cursor-pointer border-b-2 border-hl-border transition ${
                  selectedStrategy === 'all' ? 'bg-hl-accent/10' : 'hover:bg-hl-hover'
                }`}
              >
                <td className="w-44 py-3 pr-3 leading-tight">
                  <div className="text-sm font-semibold">All Strategies</div>
                  <div className="text-[10px] uppercase tracking-wide text-hl-muted">
                    Portfolio
                  </div>
                </td>
                <td className="py-3 text-right font-num text-hl-secondary">
                  {formatUsd(portfolioTotals.contributed)} →{' '}
                  {formatUsd(portfolioTotals.equity)}
                </td>
                <td className="py-3 text-right font-num">
                  <span
                    className={
                      portfolioTotals.realized >= 0 ? 'text-hl-profit' : 'text-hl-loss'
                    }
                  >
                    {formatPnl(portfolioTotals.realized)}
                  </span>
                  <span className="text-hl-muted"> / </span>
                  <span
                    className={
                      portfolioTotals.unrealized >= 0 ? 'text-hl-profit' : 'text-hl-loss'
                    }
                  >
                    {formatPnl(portfolioTotals.unrealized)}
                  </span>
                </td>
                <td
                  className={`py-3 text-right font-num ${
                    portfolioTotals.pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'
                  }`}
                >
                  <span className="text-lg font-semibold">
                    {formatPnl(portfolioTotals.pnl)}
                  </span>{' '}
                  <span className="text-xs">({formatPct(portfolioTotals.returnPct)})</span>
                </td>
              </tr>
              {strategies.slice(0, 5).map((s: any) => {
                const tail = walletTail(s.account_id);
                const open = selectedStrategy === s.strategy_name;
                return (
                <Fragment key={s.strategy_name}>
                <tr
                  onClick={() =>
                    setSelectedStrategy((prev) =>
                      prev === s.strategy_name ? 'all' : s.strategy_name
                    )
                  }
                  className={`cursor-pointer transition ${
                    open
                      ? 'bg-hl-accent/10'
                      : 'border-b border-hl-border/40 hover:bg-hl-hover last:border-0'
                  }`}
                >
                  <td
                    className="w-44 py-2.5 pr-3 font-medium leading-tight"
                    title={s.account_id ? `${s.strategy_name} · ${s.account_id}` : s.strategy_name}
                  >
                    <span className="line-clamp-2 break-words">
                      {String(s.strategy_name).replace(/_/g, '_\u200b')}
                      {tail ? (
                        <span className="font-num text-hl-muted"> ({tail})</span>
                      ) : null}
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
                {open && (
                  <tr className="border-b border-hl-border/40 bg-hl-accent/5">
                    <td colSpan={4} className="px-3 pb-3 pt-0">
                      <StrategyBook
                        positions={bookPositions}
                        loading={bookLoading}
                        error={Boolean(positionsError)}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="text-hl-muted text-sm py-4">No strategies</div>
        )}
      </div>

      {/* Main content: equity chart + right column */}
      <div className="mb-6 grid grid-cols-3 gap-4">
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
                PnL ({periodLabel})
              </button>
            </div>
            <div className="text-xs text-hl-muted">
              {curveIsPreview
                ? `${timeRange === '24H' ? 'Hourly' : 'Daily'} preview${fineError ? '' : ' · loading detail'}`
                : `Updated ${dataFreshness.text}`}
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

function StrategyBook({
  positions,
  loading,
  error,
}: {
  positions: any[];
  loading: boolean;
  error: boolean;
}) {
  if (error) {
    return <div className="py-2 text-xs text-hl-loss">Couldn't load positions.</div>;
  }
  if (loading) {
    return <div className="py-2 text-xs text-hl-muted">Loading positions...</div>;
  }
  if (positions.length === 0) {
    return <div className="py-2 text-xs text-hl-muted">Flat — no open position</div>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-hl-muted">
          <th className="w-16 pb-1 text-left font-normal">Side</th>
          <th className="pb-1 text-left font-normal">Symbol</th>
          <th className="pb-1 text-right font-normal">Qty</th>
          <th className="pb-1 text-right font-normal">Notional</th>
          <th className="pb-1 text-right font-normal">Entry → Mark</th>
          <th className="w-20 pb-1 text-right font-normal">Held</th>
          <th className="w-24 pb-1 text-right font-normal">Funding</th>
          <th className="w-24 pb-1 text-right font-normal">uPnL</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const move = priceMovePct(p.avg_entry_price, p.mark_price);
          const upnl = Number(p.unrealized_pnl);
          const funding = p.funding_accrued == null ? null : Number(p.funding_accrued);
          const side = String(p.side || '').toUpperCase();
          const held = formatHeld(p.opened_at);
          return (
            <tr key={p.state_key ?? `${p.symbol}-${side}`}>
              <td className="py-1.5">
                <span
                  className={
                    side === 'LONG' ? 'badge-long' : side === 'SHORT' ? 'badge-short' : 'badge-stopped'
                  }
                >
                  {side || '--'}
                </span>
              </td>
              <td className="py-1.5 font-medium">{p.symbol}</td>
              <td className="py-1.5 text-right font-num text-hl-secondary">
                {formatSize(p.position_qty)}
              </td>
              <td className="py-1.5 text-right font-num text-hl-secondary">
                {formatUsd(
                  Number.isFinite(Number(p.notional))
                    ? Number(p.notional)
                    : Math.abs(Number(p.position_qty)) *
                        Number(p.mark_price ?? p.avg_entry_price ?? 0)
                )}
              </td>
              <td className="py-1.5 text-right font-num">
                {formatMark(p.avg_entry_price)}
                <span className="text-hl-muted"> → </span>
                {formatMark(p.mark_price)}
                {move != null && (
                  <span className={move >= 0 ? 'text-hl-profit' : 'text-hl-loss'}>
                    {' '}
                    ({formatPct(move)})
                  </span>
                )}
              </td>
              <td
                className="py-1.5 text-right font-num text-hl-secondary"
                title={heldTitle(p.opened_at)}
              >
                {held}
              </td>
              <td
                className={`py-1.5 text-right font-num ${
                  funding == null ? 'text-hl-muted' : funding >= 0 ? 'text-hl-profit' : 'text-hl-loss'
                }`}
              >
                {formatPnl(funding)}
              </td>
              <td
                className={`py-1.5 text-right font-num ${
                  upnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'
                }`}
              >
                {formatPnl(upnl)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function priceMovePct(entry: number | null | undefined, mark: number | null | undefined) {
  const e = Number(entry);
  const m = Number(mark);
  if (!Number.isFinite(e) || !Number.isFinite(m) || e === 0) return null;
  return ((m - e) / e) * 100;
}

function formatHeld(openedAt: string | null | undefined) {
  if (!openedAt) return '--';
  const ms = Date.now() - new Date(openedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m`;
  return 'now';
}

function heldTitle(openedAt: string | null | undefined) {
  if (!openedAt) return 'Open time unknown';
  const d = new Date(openedAt);
  if (Number.isNaN(d.getTime())) return 'Open time unknown';
  return `Opened ${d.toLocaleString()}`;
}

function formatSize(n: number | null | undefined) {
  const abs = Math.abs(Number(n));
  if (!Number.isFinite(abs)) return '--';
  if (abs >= 1000) return abs.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return abs.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function formatMark(n: number | null | undefined) {
  const v = Number(n);
  if (n == null || !Number.isFinite(v)) return '--';
  const abs = Math.abs(v);
  const dp = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return v.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
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