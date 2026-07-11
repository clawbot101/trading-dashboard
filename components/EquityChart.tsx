'use client';

import { useEffect, useRef } from 'react';
import type { UTCTimestamp } from 'lightweight-charts';

interface EquityCurvePoint {
  ts: string;
  equity: number;
}

interface EquityChartProps {
  data: EquityCurvePoint[];
  markers?: Array<{ ts: string; text?: string; color?: string }>;
  height?: number;
}
const EMPTY_MARKERS: Array<{ ts: string; text?: string; color?: string }> = [];

function toChartTime(ts: string): UTCTimestamp {
  return Math.floor(new Date(ts).getTime() / 1000) as UTCTimestamp;
}

// Chart component that uses lightweight-charts
function ChartInner({ data, markers = EMPTY_MARKERS, height = 260 }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const dataRef = useRef<EquityCurvePoint[]>(data);
  const markersRef = useRef<Array<{ ts: string; text?: string; color?: string }>>(markers);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    let disposed = false;
    let localChart: any = null;

    // Dynamic import for lightweight-charts
    import('lightweight-charts').then(({ createChart, ColorType }) => {
      if (disposed || !chartContainerRef.current) return;
      // StrictMode/dev can mount effects twice; clear any stale canvas layers.
      chartContainerRef.current.innerHTML = '';
      const chart = createChart(chartContainerRef.current!, {
        width: chartContainerRef.current!.clientWidth,
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

      // Set initial data
      const chartData = dataRef.current.map((point) => ({
        time: toChartTime(point.ts),
        value: point.equity,
      }));
      lineSeries.setData(chartData);
      if (typeof lineSeries.setMarkers === 'function') {
        lineSeries.setMarkers(
          markersRef.current.map((m) => ({
            time: toChartTime(m.ts),
            position: 'inBar',
            color: m.color || '#22c55e',
            shape: 'circle',
            text: m.text || 'RB',
          }))
        );
      }
      chart.timeScale().fitContent();
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
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

  // Update data when it changes
  useEffect(() => {
    if (!seriesRef.current || !data.length) return;

    const chartData = data.map((point) => ({
      time: toChartTime(point.ts),
      value: point.equity,
    }));

    seriesRef.current.setData(chartData);
    if (typeof seriesRef.current.setMarkers === 'function') {
      seriesRef.current.setMarkers(
        markers.map((m) => ({
          time: toChartTime(m.ts),
          position: 'inBar',
          color: m.color || '#22c55e',
          shape: 'circle',
          text: m.text || 'RB',
        }))
      );
    }

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data, markers]);

  return <div ref={chartContainerRef} className="rounded" />;
}

export default function EquityChart({ data, markers = EMPTY_MARKERS, height = 260 }: EquityChartProps) {
  if (data.length < 2) {
    return (
      <div className="h-64 bg-hl-hover rounded flex items-center justify-center text-hl-muted text-sm">
        Need at least 2 points for chart
      </div>
    );
  }

  return <ChartInner data={data} markers={markers} height={height} />;
}