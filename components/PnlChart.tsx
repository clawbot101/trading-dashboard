'use client';

import { useEffect, useRef, useState } from 'react';
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

function toUniqueSecondData(points: PnlCurvePoint[]) {
  const bySecond = new Map<number, number>();
  for (const p of points) {
    const sec = Math.floor(new Date(p.ts).getTime() / 1000);
    const val = Number(p.pnl);
    if (!Number.isFinite(sec) || !Number.isFinite(val)) continue;
    bySecond.set(sec, val); // last point in same second wins
  }
  return Array.from(bySecond.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sec, val]) => ({ time: sec as UTCTimestamp, value: val }));
}

function formatPnl(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ChartInner({ data, height = 260 }: PnlChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const dataRef = useRef<PnlCurvePoint[]>(data);
  const hasFittedRef = useRef(false);
  const [hoverValue, setHoverValue] = useState<number | null>(null);

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
      baselineSeries.setData(toUniqueSecondData(dataRef.current));
      chart.timeScale().fitContent();
      hasFittedRef.current = true;

      const handleCrosshairMove = (param: any) => {
        const prices = param?.seriesPrices;
        if (!prices || !seriesRef.current || !param?.point || !param?.time) {
          setHoverValue(null);
          return;
        }
        const raw = typeof prices.get === 'function' ? prices.get(seriesRef.current) : undefined;
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          setHoverValue(raw);
          return;
        }
        if (raw && typeof raw === 'object' && Number.isFinite(Number((raw as any).close))) {
          setHoverValue(Number((raw as any).close));
          return;
        }
        setHoverValue(null);
      };
      chart.subscribeCrosshairMove(handleCrosshairMove);
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
      setHoverValue(null);
      localChart = null;
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current || !data.length) return;
    seriesRef.current.setData(toUniqueSecondData(data));
    if (chartRef.current && !hasFittedRef.current) {
      chartRef.current.timeScale().fitContent();
      hasFittedRef.current = true;
    }
  }, [data]);

  return (
    <div className="relative">
      {hoverValue != null && (
        <div className="absolute left-2 top-2 z-10 rounded bg-hl-bg/80 px-2 py-1 text-xs font-num text-hl-text pointer-events-none">
          {formatPnl(hoverValue)}
        </div>
      )}
      <div ref={chartContainerRef} className="rounded" />
    </div>
  );
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