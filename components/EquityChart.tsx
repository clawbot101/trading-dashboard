'use client';

import { useEffect, useRef, useState } from 'react';
import type { UTCTimestamp } from 'lightweight-charts';

interface EquityCurvePoint {
  ts: string;
  equity: number;
}

interface EquityChartProps {
  data: EquityCurvePoint[];
  height?: number;
}

function toChartTime(ts: string): UTCTimestamp {
  return Math.floor(new Date(ts).getTime() / 1000) as UTCTimestamp;
}

function toUniqueSecondData(points: EquityCurvePoint[]) {
  const bySecond = new Map<number, number>();
  for (const p of points) {
    const sec = Math.floor(new Date(p.ts).getTime() / 1000);
    const val = Number(p.equity);
    if (!Number.isFinite(sec) || !Number.isFinite(val)) continue;
    bySecond.set(sec, val); // last point in same second wins
  }
  return Array.from(bySecond.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sec, val]) => ({ time: sec as UTCTimestamp, value: val }));
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function extractHoverValue(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Record<string, unknown>;
  const val =
    candidate.value ??
    candidate.close ??
    candidate.price ??
    candidate.open ??
    candidate.high ??
    candidate.low;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

// Chart component that uses lightweight-charts
function ChartInner({ data, height = 260 }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const dataRef = useRef<EquityCurvePoint[]>(data);
  const hasFittedRef = useRef(false);
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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
          vertLine: {
            visible: false,
            labelVisible: false,
          },
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
      const chartData = toUniqueSecondData(dataRef.current);
      lineSeries.setData(chartData);
      chart.timeScale().fitContent();
      hasFittedRef.current = true;

      const handleCrosshairMove = (param: any) => {
        if (!seriesRef.current || !param?.point) {
          setHoverValue(null);
          return;
        }

        // lightweight-charts versions differ: some provide `seriesPrices`,
        // newer versions provide `seriesData`.
        const rawFromPrices =
          typeof param?.seriesPrices?.get === 'function'
            ? param.seriesPrices.get(seriesRef.current)
            : undefined;
        const rawFromData =
          typeof param?.seriesData?.get === 'function'
            ? param.seriesData.get(seriesRef.current)
            : undefined;

        const value = extractHoverValue(rawFromData ?? rawFromPrices);
        setHoverValue(value);
      };
      chart.subscribeCrosshairMove(handleCrosshairMove);
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
      setHoverValue(null);
      localChart = null;
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  // Update data when it changes
  useEffect(() => {
    if (!seriesRef.current || !data.length) return;

    const chartData = toUniqueSecondData(data);

    seriesRef.current.setData(chartData);

    if (chartRef.current && !hasFittedRef.current) {
      chartRef.current.timeScale().fitContent();
      hasFittedRef.current = true;
    }
  }, [data]);

  return (
    <div className="relative">
      {hoverValue != null && (
        <div className="absolute left-2 top-2 z-10 rounded bg-hl-bg/80 px-2 py-1 text-xs font-num text-hl-text pointer-events-none">
          {formatUsd(hoverValue)}
        </div>
      )}
      <div ref={chartContainerRef} className="rounded" />
    </div>
  );
}

export default function EquityChart({ data, height = 260 }: EquityChartProps) {
  if (data.length < 2) {
    return (
      <div className="h-64 bg-hl-hover rounded flex items-center justify-center text-hl-muted text-sm">
        Need at least 2 points for chart
      </div>
    );
  }

  return <ChartInner data={data} height={height} />;
}