'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const payload = await r.json();
  if (!r.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed (${r.status})`);
  }
  return payload;
};

const TIME_RANGES = ['24H', '7D', '30D', '90D', 'ALL'];

export default function TradesPage() {
  const [tab, setTab] = useState<'fills' | 'orders' | 'lifecycle'>('fills');
  const [timeRange, setTimeRange] = useState('ALL');
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

  const { data: ordersData, error: ordersError } = useSWR(
    `/api/orders?timeRange=${timeRange}&page=${page}&pageSize=50`,
    fetcher,
    {
      refreshInterval: paused ? 0 : 5000,
      dedupingInterval: 2000,
    }
  );

  const { data: lifecycleData, error: lifecycleError } = useSWR(
    `/api/position-lifecycles?timeRange=${timeRange}&page=${page}&pageSize=50`,
    fetcher,
    {
      refreshInterval: paused ? 0 : 5000,
      dedupingInterval: 2000,
    }
  );

  const fills = data?.data?.fills || [];
  const totals = data?.data?.totals;
  const totalFillRows = data?.data?.totalRows || 0;
  const orders = ordersData?.data?.orderEvents || [];
  const totalOrderRows = ordersData?.data?.totalRows || 0;
  const lifecycles = lifecycleData?.data?.lifecycles || [];
  const totalLifecycleRows = lifecycleData?.data?.totalRows || 0;
  const asOf = tab === 'orders' ? ordersData?.as_of_ts : tab === 'lifecycle' ? lifecycleData?.as_of_ts : data?.as_of_ts;

  const totalPages = Math.ceil(totalFillRows / 50);
  const orderPages = Math.ceil(totalOrderRows / 50);
  const lifecyclePages = Math.ceil(totalLifecycleRows / 50);

  // Export fills to CSV
  const exportCSV = () => {
    const headers = ['Time', 'Venue', 'Symbol', 'Side', 'Price', 'Qty', 'Notional', 'Fee', 'Realized PnL'];
    const rows = fills.map((f: any) => [
      f.ts,
      f.venue,
      f.symbol,
      f.side,
      f.fill_price,
      f.fill_qty,
      f.notional,
      f.fee || 0,
      f.realized_pnl || 0,
    ]);
    const csv = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fills-${timeRange.toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
            onClick={() => { setTab('fills'); setPage(1); }}
            className={`px-3 py-1 text-sm rounded ${
              tab === 'fills'
                ? 'bg-hl-accent text-hl-bg'
                : 'bg-hl-panel text-hl-secondary'
            }`}
          >
            Fills
          </button>
          <button
            onClick={() => { setTab('orders'); setPage(1); }}
            className={`px-3 py-1 text-sm rounded ${
              tab === 'orders'
                ? 'bg-hl-accent text-hl-bg'
                : 'bg-hl-panel text-hl-secondary'
            }`}
          >
            Order Events
          </button>
          <button
            onClick={() => { setTab('lifecycle'); setPage(1); }}
            className={`px-3 py-1 text-sm rounded ${
              tab === 'lifecycle'
                ? 'bg-hl-accent text-hl-bg'
                : 'bg-hl-panel text-hl-secondary'
            }`}
          >
            Position History
          </button>
        </div>

        <div className="flex items-center gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => { setTimeRange(r); setPage(1); }}
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
          Fills API error: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}
      {ordersError && (
        <div className="mb-4 p-3 bg-hl-loss/20 border border-hl-loss rounded text-hl-loss">
          Orders API error: {ordersError instanceof Error ? ordersError.message : 'Unknown error'}
        </div>
      )}
      {lifecycleError && (
        <div className="mb-4 p-3 bg-hl-loss/20 border border-hl-loss rounded text-hl-loss">
          Position History API error: {lifecycleError instanceof Error ? lifecycleError.message : 'Unknown error'}
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
                <th className="text-right">rPnL</th>
              </tr>
            </thead>
            <tbody>
              {fills.length > 0 ? (
                fills.map((f: any) => (
                  <tr key={f.fill_id || `${f.ts}-${f.symbol}`}>
                    <td className="text-xs text-hl-muted">{formatTime(f.ts)}</td>
                    <td className="text-sm">{f.strategy_name || '--'}</td>
                    <td className={`venue-${venueClass(f.venue)}`}>
                      {venueLabel(f.venue)}
                    </td>
                    <td className="font-medium">{f.symbol}</td>
                    <td className={`badge-${(f.side || '').toLowerCase()}`}>{f.side || '--'}</td>
                    <td className="font-num text-right">{formatPrice(f.fill_price)}</td>
                    <td className="font-num text-right">{formatQty(f.fill_qty)}</td>
                    <td className="font-num text-right">{formatUsd(f.notional)}</td>
                    <td className="font-num text-right">{formatUsd(f.fee)}</td>
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
            <span className="text-sm text-hl-secondary">
              Page {page} of {totalPages || 1} ({totalFillRows} fills)
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 text-sm bg-hl-panel rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>

          {/* CSV export */}
          <div className="flex items-center justify-between p-3 border-t border-hl-border">
            <button
              onClick={exportCSV}
              className="px-3 py-1 text-sm bg-hl-accent text-hl-bg rounded"
            >
              Export CSV
            </button>
            <span className="text-xs text-hl-secondary">
              Exports current page ({fills.length} fills)
            </span>
          </div>
        </div>
      )}

      {/* Position history tab */}
      {tab === 'lifecycle' && !isLoading && (
        <div className="panel overflow-hidden">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Open Time</th>
                <th className="text-left">Close Time</th>
                <th className="text-left">Strategy</th>
                <th className="text-left">Venue</th>
                <th className="text-left">Symbol</th>
                <th className="text-left">Side</th>
                <th className="text-left">Status</th>
                <th className="text-right">Avg Entry</th>
                <th className="text-right">Avg Exit</th>
                <th className="text-right">Fees</th>
                <th className="text-right">Funding</th>
                <th className="text-right">Gross PnL</th>
                <th className="text-right">Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {lifecycles.length > 0 ? (
                lifecycles.map((row: any) => (
                  <tr key={row.lifecycle_id}>
                    <td className="text-xs text-hl-muted">{formatTime(row.open_time)}</td>
                    <td className="text-xs text-hl-muted">{formatTime(row.close_time)}</td>
                    <td className="text-sm">{row.strategy_name || '--'}</td>
                    <td className={`venue-${venueClass(row.venue)}`}>{venueLabel(row.venue)}</td>
                    <td className="font-medium">{row.symbol}</td>
                    <td><span className={`badge-${(row.side || '').toLowerCase()}`}>{row.side || '--'}</span></td>
                    <td><span className={`badge-${row.status === 'CLOSED' ? 'filled' : 'open'}`}>{row.status}</span></td>
                    <td className="font-num text-right">{formatPrice(row.side === 'LONG' ? row.avg_buy_price : row.avg_sell_price)}</td>
                    <td className="font-num text-right">{formatPrice(row.side === 'LONG' ? row.avg_sell_price : row.avg_buy_price)}</td>
                    <td className="font-num text-right">{formatUsd(row.total_fee)}</td>
                    <td className={`font-num text-right ${pnlClass(row.total_funding)}`}>{formatPnl(row.total_funding)}</td>
                    <td className={`font-num text-right ${pnlClass(row.gross_trading_pnl)}`}>{formatPnl(row.gross_trading_pnl)}</td>
                    <td className={`font-num text-right ${pnlClass(row.net_pnl)}`}>{formatPnl(row.net_pnl)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={13} className="text-center text-hl-muted py-8">
                    No position history in range
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between p-3 border-t border-hl-border">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1 text-sm bg-hl-panel rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-hl-secondary">
              Page {page} of {lifecyclePages || 1} ({totalLifecycleRows} lifecycles)
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= lifecyclePages}
              className="px-3 py-1 text-sm bg-hl-panel rounded disabled:opacity-50"
            >
              Next
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
                <th className="text-left">Time</th>
                <th className="text-left">Venue</th>
                <th className="text-left">Symbol</th>
                <th className="text-left">Side</th>
                <th className="text-left">Type</th>
                <th className="text-left">Event Type</th>
                <th className="text-left">Status</th>
                <th className="text-right">Price</th>
                <th className="text-right">Qty</th>
                <th className="text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {orders.length > 0 ? (
                orders.map((o: any) => (
                  <tr key={o.event_id || `${o.ts}-${o.symbol}`}>
                    <td className="text-xs text-hl-muted">{formatTime(o.ts)}</td>
                    <td className={`venue-${venueClass(o.venue)}`}>
                      {venueLabel(o.venue)}
                    </td>
                    <td className="font-medium">{o.symbol}</td>
                    <td>
                      <span className={`badge-${(o.side || '').toLowerCase()}`}>{o.side || '--'}</span>
                    </td>
                    <td className="text-sm">{o.order_type || '--'}</td>
                    <td className="text-sm">
                      <span className={o.event_type === 'filled' ? 'text-hl-profit' : o.event_type === 'rejected' ? 'text-hl-loss' : 'text-hl-secondary'}>
                        {o.event_type}
                      </span>
                    </td>
                    <td>
                      <span className={`badge-${statusClass(o.event_status || '')}`}>
                        {o.event_status || '--'}
                      </span>
                    </td>
                    <td className="font-num text-right">{formatPrice(o.price)}</td>
                    <td className="font-num text-right">{formatQty(o.qty)}</td>
                    <td className="text-xs text-hl-muted">{o.note || '--'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="text-center text-hl-muted py-8">
                    No order events in range
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Order pagination */}
          <div className="flex items-center justify-between p-3 border-t border-hl-border">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1 text-sm bg-hl-panel rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-hl-secondary">
              Page {page} of {orderPages || 1} ({totalOrderRows} events)
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= orderPages}
              className="px-3 py-1 text-sm bg-hl-panel rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 text-xs text-hl-muted">Last update: {formatTime(asOf)}</div>
    </div>
  );
}

function statusClass(status: string) {
  if (!status) return 'stopped';
  switch (status.toLowerCase()) {
    case 'filled':
      return 'filled';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    case 'rejected':
      return 'rejected';
    case 'open':
    case 'pending':
    case 'submitted':
    case 'new':
      return 'open';
    case 'skipped':
      return 'stopped';
    default:
      return 'stopped';
  }
}

function formatUsd(n: number | null) {
  if (n == null) return '--';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPnl(n: number | null) {
  if (n == null) return '--';
  const sign = n >= 0 ? '+' : '';
  return `$${sign}${n.toFixed(2)}`;
}

function formatQty(n: number | null) {
  if (n == null) return '--';
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(4);
}

function formatPrice(n: number | null) {
  if (n == null) return '--';
  return n.toFixed(4);
}

function formatTime(ts: string | null) {
  if (!ts) return '--';
  return new Date(ts).toLocaleString();
}

function venueClass(venue: string | null | undefined) {
  const v = (venue || '').toLowerCase();
  return v.includes('hyperliquid') ? 'hl' : 'lt';
}

function venueLabel(venue: string | null | undefined) {
  const v = (venue || '').toLowerCase();
  return v.includes('hyperliquid') ? 'HL' : 'LT';
}

function pnlClass(n: number | null) {
  if (n == null || n === 0) return '';
  return n >= 0 ? 'pnl-positive' : 'pnl-negative';
}