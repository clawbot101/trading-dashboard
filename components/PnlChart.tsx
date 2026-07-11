'use client';

import { useEffect, useRef } from 'react';
import type { UTCTimestamp } from 'lightweight-charts';

interface PnlCurvePoint {
  ts: string;
  pnl: number;
}

interface PnlChartProps {
  data: PnlCurvePoint[];
  height?: number;
}

function toChartTime(ts: string): UTCTimestamp {
  return Math.floor(new Date(ts).getTime() / 1000) as UTCTimestamp;
}

function ChartInner({ data, height = 260 }: PnlChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const dataRef = useRef<PnlCurvePoint[]>(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    let disposed = false;
    let localChart: any = null;

    import('lightweight-charts').then(({ createChart, ColorType }) => {
      if (disposed || !chartContainerRef.current) return;

      // React StrictMode can mount effects twice; clear stale layers.
      chartContainerRef.current.innerHTML = '';
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height,
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
        crosshair: {
          horzLine: {
            visible: false,
            labelVisible: false,
          },
        },
      });

      localChart = chart;
      chartRef.current = chart;

      const baselineSeries = chart.addBaselineSeries({
        baseValue: { type: 'price', price: 0 },
      });
      baselineSeries.applyOptions({
        topLineColor: '#22c55e',
        topFillColor1: 'rgba(34, 197, 94, 0.35)',
        topFillColor2: 'rgba(34, 197, 94, 0.0)',
        bottomLineColor: '#ef4444',
        bottomFillColor1: 'rgba(239, 68, 68, 0.35)',
        bottomFillColor2: 'rgba(239, 68, 68, 0.0)',
        lineWidth: 2,
        priceLineVisible: false,
        priceLineColor: 'rgba(0,0,0,0)',
        lastValueVisible: false,
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });

      seriesRef.current = baselineSeries;
      baselineSeries.setData(
        dataRef.current.map((point) => ({
          time: toChartTime(point.ts),
          value: point.pnl,
        }))
      );
      chart.timeScale().fitContent();
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      const chartToRemove = localChart || chartRef.current;
      if (chartToRemove) chartToRemove.remove();
      localChart = null;
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current || !data.length) return;
    seriesRef.current.setData(
      data.map((point) => ({
        time: toChartTime(point.ts),
        value: point.pnl,
      }))
    );
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  return <div ref={chartContainerRef} className="rounded" />;
}

export default function PnlChart({ data, height = 260 }: PnlChartProps) {
  if (data.length < 2) {
    return (
      <div className="h-64 bg-hl-hover rounded flex items-center justify-center text-hl-muted text-sm">
        Need at least 2 points for chart
      </div>
    );
  }

  return <ChartInner data={data} height={height} />;
}