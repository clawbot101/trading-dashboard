'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface PnlCurvePoint {
  ts: string;
  pnl: number;
}

interface PnlChartProps {
  data: PnlCurvePoint[];
  height?: number;
}

function formatXAxisTick(ts: string) {
  const d = new Date(ts);
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function PnlChart({ data, height = 260 }: PnlChartProps) {
  if (data.length < 2) {
    return (
      <div className="h-64 bg-hl-hover rounded flex items-center justify-center text-hl-muted text-sm">
        Need at least 2 points for chart
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="rgba(60, 60, 60, 0.3)" vertical horizontal />
          <XAxis
            dataKey="ts"
            tickFormatter={formatXAxisTick}
            minTickGap={24}
            tick={{ fill: '#a0a0a0', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(60, 60, 60, 0.5)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#a0a0a0', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(60, 60, 60, 0.5)' }}
            tickLine={false}
            width={56}
            domain={['dataMin', 'dataMax']}
          />
          <Tooltip
            labelFormatter={(ts) => new Date(String(ts)).toLocaleString()}
            formatter={(v: any) => [Number(v).toFixed(2), 'PnL']}
            contentStyle={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              color: '#e2e8f0',
            }}
          />
          <Line
            type="monotone"
            dataKey="pnl"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}