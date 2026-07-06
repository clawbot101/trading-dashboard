'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface PnlAttributionRow {
  date: string;
  price_pnl: number;
  fees: number;
  funding: number;
}

interface PnlAttributionChartProps {
  data: PnlAttributionRow[];
}

export default function PnlAttributionChart({ data }: PnlAttributionChartProps) {
  // Format date for display
  const formattedData = data.map((row) => ({
    ...row,
    dateLabel: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  // Calculate total for centering
  const maxAbs = Math.max(
    ...formattedData.map((d) => Math.abs(d.price_pnl + d.fees + d.funding))
  );

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={formattedData} barCategoryGap="15%">
        <XAxis
          dataKey="dateLabel"
          tick={{ fill: '#a0a0a0', fontSize: 10 }}
          axisLine={{ stroke: 'rgba(60,60,60,0.5)' }}
          tickLine={{ stroke: 'rgba(60,60,60,0.5)' }}
        />
        <YAxis
          tick={{ fill: '#a0a0a0', fontSize: 10 }}
          axisLine={{ stroke: 'rgba(60,60,60,0.5)' }}
          tickLine={{ stroke: 'rgba(60,60,60,0.5)' }}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
        />
        <ReferenceLine y={0} stroke="rgba(60,60,60,0.5)" />
        <Tooltip
          contentStyle={{
            background: 'hsl(220,18%,12%)',
            border: '1px solid hsl(220,14%,26%)',
            borderRadius: 4,
            fontSize: 12,
          }}
          labelStyle={{ color: '#a0a0a0' }}
          formatter={(value: number) => `$${value.toFixed(2)}`}
        />
        <Bar dataKey="price_pnl" stackId="a" fill="#22c55e" name="Price" />
        <Bar dataKey="fees" stackId="a" fill="#ef4444" name="Fees" />
        <Bar dataKey="funding" stackId="a" fill="#f59e0b" name="Funding" />
      </BarChart>
    </ResponsiveContainer>
  );
}