'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';
import PositionPriceChart from '../../components/PositionPriceChart';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function PositionsPage() {
  const [paused, setPaused] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR('/api/positions', fetcher, {
    refreshInterval: paused ? 0 : 5000, // 5s for live data
    dedupingInterval: 2000,
  });

  const positions = data?.data?.positions || [];
  const summary = data?.data?.summary;
  const openOrders = data?.data?.openOrders || [];
  const asOfTs = data?.as_of_ts;

  // Sort by |uPnL| desc
  const sortedPositions = [...positions].sort(
    (a, b) => Math.abs(b.unrealized_pnl) - Math.abs(a.unrealized_pnl)
  );

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/" className="text-hl-accent text-sm hover:underline">
            ← Overview
          </Link>
          <h1 className="text-xl font-semibold mt-1">Live Positions</h1>
        </div>
        <button
          onClick={() => setPaused(!paused)}
          className={`px-3 py-1 text-sm rounded ${
            paused ? 'bg-hl-loss text-hl-text' : 'bg-hl-panel text-hl-secondary'
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
          <div className="h-16 bg-hl-panel rounded animate-pulse" />
          <div className="h-48 bg-hl-panel rounded animate-pulse" />
        </div>
      )}

      {/* Summary strip */}
      {!isLoading && summary && (
        <div className="panel p-3 mb-4">
          <div className="grid grid-cols-8 gap-4 text-sm">
            <div>
              <span className="text-hl-secondary">Long Notional</span>
              <div className="font-num text-hl-profit">{formatUsd(summary.total_notional_long)}</div>
            </div>
            <div>
              <span className="text-hl-secondary">Short Notional</span>
              <div className="font-num text-hl-loss">{formatUsd(summary.total_notional_short)}</div>
            </div>
            <div>
              <span className="text-hl-secondary">Net Exposure</span>
              <div className="font-num">{formatUsd(summary.net_exposure)}</div>
            </div>
            <div>
              <span className="text-hl-secondary">Gross Leverage</span>
              <div className="font-num">{summary.gross_leverage?.toFixed(1) || '--'}x</div>
            </div>
            <div>
              <span className="text-hl-secondary">Total uPnL</span>
              <div className={`font-num ${summary.total_unrealized_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                {formatPnl(summary.total_unrealized_pnl)}
              </div>
            </div>
            <div>
              <span className="text-hl-secondary">Adj. PnL</span>
              <div className={`font-num ${summary.total_adjusted_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                {formatPnl(summary.total_adjusted_pnl)}
              </div>
            </div>
            <div>
              <span className="text-hl-secondary">Total Funding</span>
              <div className={`font-num ${summary.total_funding >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                {formatPnl(summary.total_funding)}
              </div>
            </div>
            <div>
              <span className="text-hl-secondary">Total Fees</span>
              <div className="font-num">{formatUsd(summary.total_fees)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Positions table */}
      {!isLoading && (
        <div className="panel overflow-hidden">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Symbol</th>
                <th className="text-left">Strategy</th>
                <th className="text-left">Side</th>
                <th className="text-right">Size</th>
                <th className="text-right">Notional</th>
                <th className="text-right">Leverage</th>
                <th className="text-right">Entry</th>
                <th className="text-right">Mark</th>
                <th className="text-right">Liq. Price</th>
                <th className="text-right">uPnL</th>
                <th className="text-right">Adj. PnL</th>
                <th className="text-right">Funding</th>
                <th className="text-right">Fees</th>
                <th className="text-right">Margin</th>
                <th className="text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.length > 0 ? (
                sortedPositions.map((p: any) => (
                  <PositionRow
                    key={p.state_key}
                    position={p}
                    expanded={expandedRow === p.state_key}
                    onToggle={() =>
                      setExpandedRow(expandedRow === p.state_key ? null : p.state_key)
                    }
                    orders={openOrders.filter((o: any) => o.symbol === p.symbol)}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={15} className="text-center text-hl-muted py-8">
                    No open positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 text-xs text-hl-muted">
        Last update: {formatTime(asOfTs)}
      </div>
    </div>
  );
}

// Position row component
function PositionRow({
  position,
  expanded,
  onToggle,
  orders,
}: {
  position: any;
  expanded: boolean;
  onToggle: () => void;
  orders: any[];
}) {
  // Fetch fills when expanded
  const { data: fillsData, isLoading: fillsLoading } = useSWR(
    expanded ? `/api/fills?symbol=${position.symbol}&strategy=${position.strategy_name}&limit=5` : null,
    fetcher,
    { dedupingInterval: 5000 }
  );
  const fills = fillsData?.data?.fills || [];

  const liqDistancePct = position.liquidation_price && position.mark_price
    ? (Math.abs(position.liquidation_price - position.mark_price) / position.mark_price) * 100
    : null;

  const liqWarning = liqDistancePct && liqDistancePct < 15;

  return (
    <>
      <tr className="cursor-pointer" onClick={onToggle}>
        <td className="font-medium">
          <span className={`venue-${position.venue === 'Hyperliquid' ? 'hl' : 'lt'}`}>
            {position.venue === 'Hyperliquid' ? 'HL' : 'LT'}
          </span>
          <span className="ml-2">{position.symbol}</span>
        </td>
        <td className="text-hl-secondary">{position.strategy_name}</td>
        <td>
          <span className={`badge-${position.side.toLowerCase()}`}>{position.side}</span>
        </td>
        <td className="font-num text-right">{formatQty(Math.abs(position.position_qty))}</td>
        <td className="font-num text-right">{formatUsd(position.notional)}</td>
        <td className="font-num text-right">{position.leverage?.toFixed(1) || '--'}x</td>
        <td className="font-num text-right">{formatPrice(position.avg_entry_price)}</td>
        <td className="font-num text-right">{formatPrice(position.mark_price)}</td>
        <td className={`font-num text-right ${liqWarning ? 'text-amber-500' : ''}`}>
          {formatPrice(position.liquidation_price)}
        </td>
        <td className={`font-num text-right ${pnlClass(position.unrealized_pnl)}`}>
          {formatPnl(position.unrealized_pnl)}
        </td>
        <td className={`font-num text-right ${pnlClass(position.adjusted_pnl)}`}>
          {formatPnl(position.adjusted_pnl)}
        </td>
        <td className="font-num text-right">{formatPnl(position.funding_accrued)}</td>
        <td className="font-num text-right">{formatUsd(position.total_fee)}</td>
        <td className="font-num text-right">{formatUsd(position.margin)}</td>
        <td className="text-hl-muted text-xs">{formatTimeAgo(position.updated_at)}</td>
      </tr>

      {/* Expanded row */}
      {expanded && (
        <tr>
          <td colSpan={15} className="bg-hl-hover p-4">
            <div className="grid grid-cols-4 gap-4">
              {/* Position details */}
              <div>
                <div className="text-xs text-hl-secondary mb-2">Position Details</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-hl-muted">Notional</span>
                    <span className="font-num">{formatUsd(position.notional)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-hl-muted">Mark Price</span>
                    <span className="font-num">{formatPrice(position.mark_price)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-hl-muted">Entry Price</span>
                    <span className="font-num">{formatPrice(position.avg_entry_price)}</span>
                  </div>
                  <div className={`flex justify-between ${liqWarning ? 'text-amber-500' : ''}`}>
                    <span className="text-hl-muted">Liq. Price</span>
                    <span className="font-num">{formatPrice(position.liquidation_price)}</span>
                  </div>
                  <div className={`flex justify-between ${position.adjusted_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                    <span className="text-hl-muted">Adj. PnL</span>
                    <span className="font-num">{formatPnl(position.adjusted_pnl)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-hl-muted">Funding</span>
                    <span className={`font-num ${position.funding_accrued >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                      {formatPnl(position.funding_accrued)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-hl-muted">Total Fees</span>
                    <span className="font-num">{formatUsd(position.total_fee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-hl-muted">Margin</span>
                    <span className="font-num">{formatUsd(position.margin)}</span>
                  </div>
                </div>
              </div>

              {/* Mini price chart */}
              <PositionPriceChart
                symbol={position.symbol}
                entryPrice={position.avg_entry_price}
                liqPrice={position.liquidation_price}
                side={position.side}
                height={160}
              />

              {/* Recent fills */}
              <div>
                <div className="text-xs text-hl-secondary mb-2">Recent Fills</div>
                {fillsLoading ? (
                  <div className="text-sm text-hl-muted">Loading...</div>
                ) : fills.length > 0 ? (
                  <div className="space-y-1">
                    {fills.map((f: any) => (
                      <div key={`${f.ts}-${f.fill_qty}`} className="text-sm">
                        <span className={`badge-${f.side.toLowerCase()}`}>{f.side}</span>
                        <span className="ml-2 font-num">{f.fill_qty}@{formatPrice(f.fill_price)}</span>
                        <span className="ml-2 text-hl-muted">{formatTimeAgo(f.ts)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-hl-muted">No recent fills</div>
                )}
              </div>

              {/* Open orders */}
              <div>
                <div className="text-xs text-hl-secondary mb-2">Open Orders</div>
                {orders.length > 0 ? (
                  <div className="space-y-1">
                    {orders.map((o: any) => (
                      <div key={o.strategy_order_id} className="text-sm">
                        <span className={`badge-${o.side.toLowerCase()}`}>{o.side}</span>
                        <span className="ml-2 font-num">{o.qty}@{formatPrice(o.price)}</span>
                        <span className="ml-2 text-hl-muted">{o.order_type}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-hl-muted">No open orders</div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Formatting helpers
function formatUsd(n: number | null) {
  if (!n) return '--';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPnl(n: number | null) {
  if (!n) return '--';
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) >= 1e6) return `$${sign}${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${sign}${(n / 1e3).toFixed(2)}K`;
  return `$${sign}${n.toFixed(2)}`;
}

function formatQty(n: number) {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(4);
}

function formatPrice(n: number | null) {
  if (!n) return '--';
  return n.toFixed(4);
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

function pnlClass(n: number) {
  if (n > 0) return 'pnl-positive';
  if (n < 0) return 'pnl-negative';
  return '';
}