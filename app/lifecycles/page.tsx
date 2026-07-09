'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TIME_RANGES = ['24H', '7D', '30D', '90D', 'ALL'];
const STATUS_FILTERS = ['ALL', 'OPEN', 'CLOSED'];

export default function LifecyclesPage() {
  const [timeRange, setTimeRange] = useState('ALL');
  const [status, setStatus] = useState('ALL' as 'ALL' | 'OPEN' | 'CLOSED');
  const [paused, setPaused] = useState(false);

  const { data, error, isLoading } = useSWR(
    `/api/lifecycles?timeRange=${timeRange}&status=${status}`,
    fetcher,
    {
      refreshInterval: paused ? 0 : 30000,
      dedupingInterval: 10000,
    }
  );

  const lifecycles = data?.data?.lifecycles || [];
  const totals = data?.data?.totals;
  const asOf = data?.as_of_ts;

  // Export to CSV
  const exportCSV = () => {
    const headers = [
      'Lifecycle ID',
      'Strategy',
      'Venue',
      'Symbol',
      'Side',
      'Status',
      'Open Time',
      'Close Time',
      'Holding Duration',
      'Open Price',
      'Close Price',
      'Position Size',
      'Notional',
      'Realized PnL',
      'Unrealized PnL',
      'Total PnL',
      'Total Fees',
      'Total Funding',
      'Net PnL',
    ];

    const rows = lifecycles.map((l: any) => [
      l.lifecycle_id,
      l.strategy_name,
      l.venue,
      l.symbol,
      l.side,
      l.status,
      l.open_time,
      l.close_time || '',
      l.holding_duration || '',
      l.open_price || '',
      l.close_price || '',
      l.position_size,
      l.notional,
      l.realized_pnl,
      l.unrealized_pnl,
      l.total_pnl,
      l.total_fee,
      l.total_funding,
      l.net_pnl,
    ]);

    const csv = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifecycles-${timeRange.toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
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
          <h1 className="text-xl font-semibold mt-1">Position Lifecycles</h1>
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

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1">
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

        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s as any)}
              className={`px-3 py-1 text-sm rounded ${
                status === s
                  ? 'bg-hl-accent text-hl-bg'
                  : 'bg-hl-panel text-hl-secondary hover:bg-hl-hover'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={exportCSV}
          className="ml-auto px-3 py-1 text-sm bg-hl-accent text-hl-bg rounded"
        >
          Export CSV
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 p-3 bg-hl-loss/20 border border-hl-loss rounded text-hl-loss">
          Connection error. Retrying...
        </div>
      )}

      {/* Loading state */}
      {isLoading && <div className="h-48 bg-hl-panel rounded animate-pulse" />}

      {/* Summary strip */}
      {!isLoading && totals && (
        <div className="panel p-3 mb-4">
          <div className="grid grid-cols-7 gap-4 text-sm">
            <div>
              <span className="text-hl-secondary">Total Lifecycles</span>
              <div className="font-num">{totals.total_lifecycles || 0}</div>
            </div>
            <div>
              <span className="text-hl-secondary">Open</span>
              <div className="font-num text-hl-accent">{totals.open_count || 0}</div>
            </div>
            <div>
              <span className="text-hl-secondary">Closed</span>
              <div className="font-num">{totals.closed_count || 0}</div>
            </div>
            <div>
              <span className="text-hl-secondary">Total Realized PnL</span>
              <div className={`font-num ${totals.total_realized_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                {formatPnl(totals.total_realized_pnl)}
              </div>
            </div>
            <div>
              <span className="text-hl-secondary">Total Unrealized PnL</span>
              <div className={`font-num ${totals.total_unrealized_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                {formatPnl(totals.total_unrealized_pnl)}
              </div>
            </div>
            <div>
              <span className="text-hl-secondary">Total Fees</span>
              <div className="font-num">{formatUsd(totals.total_fees)}</div>
            </div>
            <div>
              <span className="text-hl-secondary">Net PnL</span>
              <div className={`font-num ${totals.total_net_pnl >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                {formatPnl(totals.total_net_pnl)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {!isLoading && (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th className="text-left">Symbol</th>
                  <th className="text-left">Strategy</th>
                  <th className="text-left">Side</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Open Time</th>
                  <th className="text-left">Close Time</th>
                  <th className="text-right">Duration</th>
                  <th className="text-right">Open Price</th>
                  <th className="text-right">Close Price</th>
                  <th className="text-right">Size</th>
                  <th className="text-right">Notional</th>
                  <th className="text-right">Realized PnL</th>
                  <th className="text-right">Unrealized PnL</th>
                  <th className="text-right">Total PnL</th>
                  <th className="text-right">Fees</th>
                  <th className="text-right">Funding</th>
                  <th className="text-right">Net PnL</th>
                </tr>
              </thead>
              <tbody>
                {lifecycles.length > 0 ? (
                  lifecycles.map((l: any) => (
                    <tr key={l.lifecycle_id}>
                      <td className="font-medium">{l.symbol}</td>
                      <td className="text-hl-secondary">{l.strategy_name}</td>
                      <td>
                        <span className={`badge-${l.side.toLowerCase()}`}>{l.side}</span>
                      </td>
                      <td>
                        <span className={`badge-${l.status === 'OPEN' ? 'live' : 'stopped'}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="text-xs text-hl-muted">{formatTime(l.open_time)}</td>
                      <td className="text-xs text-hl-muted">{l.close_time ? formatTime(l.close_time) : '--'}</td>
                      <td className="font-num text-right text-xs">{l.holding_duration || '--'}</td>
                      <td className="font-num text-right">{formatPrice(l.open_price)}</td>
                      <td className="font-num text-right">{formatPrice(l.close_price)}</td>
                      <td className="font-num text-right">{formatQty(l.position_size)}</td>
                      <td className="font-num text-right">{formatUsd(l.notional)}</td>
                      <td className={`font-num text-right ${pnlClass(l.realized_pnl)}`}>
                        {formatPnl(l.realized_pnl)}
                      </td>
                      <td className={`font-num text-right ${pnlClass(l.unrealized_pnl)}`}>
                        {formatPnl(l.unrealized_pnl)}
                      </td>
                      <td className={`font-num text-right ${pnlClass(l.total_pnl)}`}>
                        {formatPnl(l.total_pnl)}
                      </td>
                      <td className="font-num text-right">{formatUsd(l.total_fee)}</td>
                      <td className={`font-num text-right ${l.total_funding >= 0 ? 'text-hl-profit' : 'text-hl-loss'}`}>
                        {formatPnl(l.total_funding)}
                      </td>
                      <td className={`font-num text-right ${pnlClass(l.net_pnl)}`}>
                        {formatPnl(l.net_pnl)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={17} className="text-center text-hl-muted py-8">
                      No lifecycles in range
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 text-xs text-hl-muted">Last update: {formatTime(asOf)}</div>
    </div>
  );
}

// Formatting helpers
function formatUsd(n: number | null) {
  if (!n && n !== 0) return '--';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPnl(n: number | null) {
  if (!n && n !== 0) return '--';
  const sign = n >= 0 ? '+' : '';
  if (Math.abs(n) >= 1e6) return `$${sign}${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${sign}${(n / 1e3).toFixed(2)}K`;
  return `$${sign}${n.toFixed(2)}`;
}

function formatQty(n: number | null) {
  if (!n && n !== 0) return '--';
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(4);
}

function formatPrice(n: number | null) {
  if (!n && n !== 0) return '--';
  return n.toFixed(4);
}

function formatTime(ts: string | null) {
  if (!ts) return '--';
  return new Date(ts).toLocaleString();
}

function pnlClass(n: number | null) {
  if (!n && n !== 0) return '';
  return n >= 0 ? 'pnl-positive' : 'pnl-negative';
}
