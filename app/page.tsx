'use client';

import useSWR from 'swr';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TradingState {
  strategy_name: string;
  strategy_slot: string | null;
  venue: string;
  symbol: string;
  position_qty: number;
  avg_entry_price: number | null;
  mark_price: number | null;
  unrealized_pnl: number;
  realized_pnl: number;
  updated_at: string;
}

interface EquitySnapshot {
  ts: string;
  equity: number;
  unrealized_pnl: number;
  realized_pnl: number;
}

interface Fill {
  ts: string;
  symbol: string;
  side: string;
  fill_price: number;
  fill_qty: number;
  fee: number;
}

interface Session {
  session_id: string;
  strategy_name: string;
  venue: string;
  token_pair: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
}

function formatNum(n: number | null, decimals = 2): string {
  if (n === null) return '-';
  return n.toFixed(decimals);
}

function formatPnl(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${formatNum(n, 2)}`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString();
}

export default function Dashboard() {
  // Live polling every 5 seconds
  const { data: stateData, error: stateError } = useSWR('/api/state', fetcher, {
    refreshInterval: 5000,
    dedupingInterval: 2000,
  });

  const { data: equityData } = useSWR('/api/equity?hours=24', fetcher, {
    refreshInterval: 10000,
    dedupingInterval: 5000,
  });

  const { data: fillsData } = useSWR('/api/fills?limit=20', fetcher, {
    refreshInterval: 30000,
    dedupingInterval: 10000,
  });

  const { data: sessionsData } = useSWR('/api/sessions', fetcher, {
    refreshInterval: 60000,
    dedupingInterval: 30000,
  });

  const states: TradingState[] = stateData?.states || [];
  const snapshots: EquitySnapshot[] = equityData?.snapshots || [];
  const fills: Fill[] = fillsData?.fills || [];
  const sessions: Session[] = sessionsData?.sessions || [];

  // Summary stats
  const totalUpnl = states.reduce((sum, s) => sum + s.unrealized_pnl, 0);
  const totalRpnl = states.reduce((sum, s) => sum + s.realized_pnl, 0);
  const activePositions = states.filter((s) => s.position_qty !== 0).length;

  // Equity chart data
  const chartData = {
    labels: snapshots.map((s) => new Date(s.ts).toLocaleTimeString()),
    datasets: [
      {
        label: 'Equity',
        data: snapshots.map((s) => s.equity),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.1,
      },
      {
        label: 'Unrealized PnL',
        data: snapshots.map((s) => s.unrealized_pnl),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        tension: 0.1,
      },
    ],
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>Trading Dashboard</h1>
        <p style={{ color: '#666', margin: '5px 0' }}>Live updates every 5s</p>
      </div>

      {/* Summary Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>Total Unrealized PnL</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: totalUpnl >= 0 ? '#10b981' : '#ef4444' }}>
            ${formatPnl(totalUpnl)}
          </div>
        </div>
        <div style={{ padding: '16px', background: '#fef3c7', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>Total Realized PnL</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>
            ${formatPnl(totalRpnl)}
          </div>
        </div>
        <div style={{ padding: '16px', background: '#e0e7ff', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>Active Positions</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{activePositions}</div>
        </div>
      </div>

      {/* Error state */}
      {stateError && (
        <div style={{ padding: '12px', background: '#fee2e2', borderRadius: '8px', marginBottom: '16px' }}>
          Connection error. Retrying...
        </div>
      )}

      {/* Positions Table */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Current Positions</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '8px', textAlign: 'left' }}>Strategy</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Symbol</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Qty</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Entry</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Mark</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>uPnL</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>rPnL</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {states.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px' }}>{s.strategy_name}</td>
                <td style={{ padding: '8px' }}>{s.symbol}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: s.position_qty > 0 ? 'bold' : 'normal' }}>
                  {s.position_qty > 0 ? 'LONG ' : s.position_qty < 0 ? 'SHORT ' : ''}{formatNum(Math.abs(s.position_qty), 4)}
                </td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatNum(s.avg_entry_price, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatNum(s.mark_price, 4)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: s.unrealized_pnl >= 0 ? '#10b981' : '#ef4444' }}>
                  ${formatPnl(s.unrealized_pnl)}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#f59e0b' }}>
                  ${formatPnl(s.realized_pnl)}
                </td>
                <td style={{ padding: '8px', color: '#666' }}>{formatTime(s.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Equity Chart */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Equity Curve (24h)</h2>
        <div style={{ height: '300px', position: 'relative' }}>
          {snapshots.length > 0 ? (
            <Line
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'top' },
                },
                scales: {
                  y: { beginAtZero: false },
                },
              }}
            />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>No equity data yet</div>
          )}
        </div>
      </div>

      {/* Recent Fills */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Recent Fills</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '8px', textAlign: 'left' }}>Time</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Symbol</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Side</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Price</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Qty</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Fee</th>
            </tr>
          </thead>
          <tbody>
            {fills.map((f, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px', color: '#666' }}>{formatTime(f.ts)}</td>
                <td style={{ padding: '8px' }}>{f.symbol}</td>
                <td style={{ padding: '8px', fontWeight: 'bold', color: f.side === 'buy' ? '#10b981' : '#ef4444' }}>
                  {f.side.toUpperCase()}
                </td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatNum(f.fill_price, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatNum(f.fill_qty, 4)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#666' }}>${formatNum(f.fee, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {fills.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No fills yet</div>
        )}
      </div>

      {/* Sessions */}
      <div>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Sessions</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '8px', textAlign: 'left' }}>Strategy</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Venue</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Pair</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Started</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Ended</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px' }}>{s.strategy_name}</td>
                <td style={{ padding: '8px' }}>{s.venue}</td>
                <td style={{ padding: '8px' }}>{s.token_pair || '-'}</td>
                <td style={{ padding: '8px', color: '#666' }}>{formatTime(s.started_at)}</td>
                <td style={{ padding: '8px', color: '#666' }}>{s.ended_at ? formatTime(s.ended_at) : 'Running'}</td>
                <td style={{ padding: '8px' }}>
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: s.status === 'running' ? '#dcfce7' : '#f3f4f6',
                      color: s.status === 'running' ? '#16a34a' : '#666',
                    }}
                  >
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ marginTop: '40px', padding: '12px', borderTop: '1px solid #e5e7eb', color: '#666', fontSize: '12px' }}>
        Last refresh: {new Date().toLocaleString()}
      </div>
    </div>
  );
}