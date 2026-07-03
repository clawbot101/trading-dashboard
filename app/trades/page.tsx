'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TIME_RANGES = ['24H', '7D', '30D', '90D', 'ALL'];

export default function TradesPage() {
  const [tab, setTab] = useState<'fills' | 'orders'>('fills');
  const [timeRange, setTimeRange] = useState('24H');
  const [page, setPage] = useState(1);
  const [paused, setPaused] = useState(false);

  const { data, error, isLoading } = useSWR(
    `/api/fills?timeRange=${timeRange}&page=${page}&pageSize=50`,
    fetcher,
    {
      refreshInterval: paused ? 0 : 5000,
      dedupingInterval: 2000,
    }
  );

  const { data: ordersData } = useSWR(
    `/api/orders?timeRange=${timeRange}&page=${page}&pageSize=50`,
    fetcher,
    {
      refreshInterval: paused ? 0 : 5000,
      dedupingInterval: 2000,
    }
  );

  const fills = data?.data?.fills || [];
  const totals = data?.data?.totals;
  const orders = ordersData?.data?.orderEvents || [];
  const asOf = data?.as_of;

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/" className="text-hl-accent text-sm hover:underline">
            ← Overview
          </Link>
          <h1 className="text-xl font-semibold mt-1">Trades & Orders</h1>
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

      {/* Tabs + Controls */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('fills')}
            className={`px-3 py-1 text-sm rounded ${
              tab === 'fills'
                ? 'bg-hl-accent text-hl-bg'
                : 'bg-hl-panel text-hl-secondary'
            }`}
          >
            Fills
          </button>
          <button
            onClick={() => setTab('orders')}
            className={`px-3 py-1 text-sm rounded ${
              tab === 'orders'
                ? 'bg-hl-accent text-hl-bg'
                : 'bg-hl-panel text-hl-secondary'
            }`}
          >
            Order Events
          </button>
        </div>

        <div className="flex items-center gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-2 py-1 text-xs rounded ${
                timeRange === r
                  ? 'bg-hl-accent text-hl-bg'
                  : 'bg-hl-panel text-hl-secondary hover:bg-hl-hover'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 p-3 bg-hl-loss/20 border border-hl-loss rounded text-hl-loss">
          Connection error. Retrying...
        </div>
      )}

      {/* Loading state */}
      {isLoading && <div className="h-48 bg-hl-panel rounded animate-pulse" />}

      {/* Fills tab */}
      {tab === 'fills' && !isLoading && (
        <div className="panel overflow-hidden">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Time</th>
                <th className="text-left">Strategy</th>
                <th className="text-left">Venue</th>
                <th className="text-left">Symbol</th>
                <th className="text-left">Side</th>
                <th className="text-right">Price</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Notional</th>
                <th className="text-right">Fee</th>
                <th className="text-left">Maker</th>
                <th className="text-right">rPnL</th>
              </tr>
            </thead>
            <tbody>
              {fills.length > 0 ? (
                fills.map((f: any) => (
                  <tr key={f.fill_id}>
                    <td className="text-xs text-hl-muted">{formatTime(f.ts)}</td>
                    <td className="text-sm">{f.strategy_name}</td>
                    <td className={`venue-${f.venue === 'Hyperliquid' ? 'hl' : 'lt'}`}>
                      {f.venue === 'Hyperliquid' ? 'HL' : 'LT'}
                    </td>
                    <td className="font-medium">{f.symbol}</td>
                    <td className={`badge-${f.side.toLowerCase()}`}>{f.side}</td>
                    <td className="font-num text-right">{formatPrice(f.fill_price)}</td>
                    <td className="font-num text-right">{formatQty(f.fill_qty)}</td>
                    <td className="font-num text-right">{formatUsd(f.notional)}</td>
                    <td className="font-num text-right">{formatUsd(f.fee)}</td>
                    <td className="text-xs">{f.is_maker ? 'M' : 'T'}</td>
                    <td className={`font-num text-right ${pnlClass(f.realized_pnl)}`}>
                      {formatPnl(f.realized_pnl)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="text-center text-hl-muted py-8">
                    No fills in range
                  </td>
                </tr>
              )}
            </tbody>
            {/* Footer totals */}
            {totals && fills.length > 0 && (
              <tfoot className="bg-hl-hover">
                <tr>
                  <td colSpan={6} className="text-right text-hl-secondary font-medium">
                    Totals:
                  </td>
                  <td className="font-num text-right">{formatQty(totals.total_qty)}</td>
                  <td className="font-num text-right">{formatUsd(totals.total_notional)}</td>
                  <td className="font-num text-right">{formatUsd(totals.total_fee)}</td>
                  <td></td>
                  <td className={`font-num text-right ${pnlClass(totals.total_realized_pnl)}`}>
                    {formatPnl(totals.total_realized_pnl)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between p-3 border-t border-hl-border">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1 text-sm bg-hl-panel rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-hl-secondary">Page {page}</span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={fills.length < 50}
              className="px-3 py-1 text-sm bg-hl-panel rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>

          {/* CSV export */}
          <div className="p-3 border-t border-hl-border">
            <button className="px-3 py-1 text-sm bg-hl-accent text-hl-bg rounded">
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Orders tab */}
      {tab === 'orders' && !isLoading && (
        <div className="panel overflow-hidden">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Order ID</th>
                <th className="text-left">Symbol</th>
                <th className="text-left">Side</th>
                <th className="text-left">Type</th>
                <th className="text-right">Price</th>
                <th className="text-right">Qty</th>
                <th className="text-left">Status</th>
                <th className="text-left">Created</th>
                <th className="text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {orders.length > 0 ? (
                orders.map((o: any) => (
                  <tr key={o.strategy_order_id}>
                    <td className="text-xs font-mono">{o.strategy_order_id?.slice(0, 8)}</td>
                    <td className="font-medium">{o.symbol}</td>
                    <td className={`badge-${o.side.toLowerCase()}`}>{o.side}</td>
                    <td className="text-sm">{o.order_type}</td>
                    <td className="font-num text-right">{formatPrice(o.price)}</td>
                    <td className="font-num text-right">{formatQty(o.qty)}</td>
                    <td>
                      <span className={`badge-${statusClass(o.latest_status)}`}>
                        {o.latest_status}
                      </span>
                    </td>
                    <td className="text-xs text-hl-muted">{formatTime(o.created_ts)}</td>
                    <td className="text-xs text-hl-muted">{formatTime(o.latest_ts)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="text-center text-hl-muted py-8">
                    No order events in range
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 text-xs text-hl-muted">Last update: {formatTime(asOf)}</div>
    </div>
  );
}

function statusClass(status: string) {
  switch (status) {
    case 'FILLED':
    case 'filled':
      return 'filled';
    case 'CANCELED':
    case 'canceled':
      return 'canceled';
    case 'REJECTED':
    case 'rejected':
      return 'rejected';
    case 'OPEN':
    case 'open':
    case 'pending':
    case 'submitted':
      return 'open';
    default:
      return 'stopped';
  }
}

function formatUsd(n: number | null) {
  if (!n) return '--';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPnl(n: number | null) {
  if (!n) return '--';
  const sign = n >= 0 ? '+' : '';
  return `$${sign}${n.toFixed(2)}`;
}

function formatQty(n: number | null) {
  if (!n) return '--';
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

function pnlClass(n: number | null) {
  if (!n) return '';
  return n >= 0 ? 'pnl-positive' : 'pnl-negative';
}