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

      const lineSeries = chart.addLineSeries();
      lineSeries.applyOptions({
        color: '#22c55e',
        lineWidth: 2,
        priceLineVisible: false,
        priceLineColor: 'rgba(0,0,0,0)',
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      seriesRef.current = lineSeries;
      lineSeries.setData(
        data.map((point) => ({
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
      if (localChart) {
        localChart.remove();
        localChart = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
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