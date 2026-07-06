'use client';

import { useEffect, useRef } from 'react';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createChart, ColorType } = require('lightweight-charts');

interface EquityCurvePoint {
  ts: string;
  equity: number;
}

interface EquityChartProps {
  data: EquityCurvePoint[];
  height?: number;
}

export default function EquityChart({ data, height = 260 }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a0a0a0',
      },
      grid: {
        vertLines: { color: 'rgba(60, 60, 60, 0.3)' },
        horzLines: { color: 'rgba(60, 60, 60, 0.3)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(60, 60, 60, 0.5)',
      },
      timeScale: {
        borderColor: 'rgba(60, 60, 60, 0.5)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Create area series
    const areaSeries = chart.addAreaSeries({
      topColor: 'rgba(34, 197, 94, 0.4)',
      bottomColor: 'rgba(34, 197, 94, 0.0)',
      lineColor: '#22c55e',
      lineWidth: 2,
    });

    seriesRef.current = areaSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  // Update data when it changes
  useEffect(() => {
    if (!seriesRef.current || !data.length) return;

    const chartData = data.map((point) => ({
      time: Math.floor(new Date(point.ts).getTime() / 1000),
      value: point.equity,
    }));

    seriesRef.current.setData(chartData);

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  if (data.length < 2) {
    return (
      <div className="h-64 bg-hl-hover rounded flex items-center justify-center text-hl-muted text-sm">
        Need at least 2 points for chart
      </div>
    );
  }

  return <div ref={chartContainerRef} className="rounded" />;
}