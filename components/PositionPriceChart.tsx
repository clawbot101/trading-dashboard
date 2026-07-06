'use client';

import { useEffect, useRef, useState } from 'react';
const { createChart, ColorType } = require('lightweight-charts');

interface PositionPriceChartProps {
  symbol: string;
  entryPrice: number | null;
  side: string;
  height?: number;
}

export default function PositionPriceChart({ symbol, entryPrice, side, height = 128 }: PositionPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const entryLineRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a0a0a0',
      },
      grid: {
        vertLines: { color: 'rgba(60, 60, 60, 0.2)' },
        horzLines: { color: 'rgba(60, 60, 60, 0.2)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(60, 60, 60, 0.3)',
      },
      timeScale: {
        borderColor: 'rgba(60, 60, 60, 0.3)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const lineSeries = chart.addLineSeries({
      color: side === 'LONG' ? '#22c55e' : '#ef4444',
      lineWidth: 1,
    });

    seriesRef.current = lineSeries;

    // Add entry price line
    if (entryPrice && entryPrice > 0) {
      const entryLine = chart.addPriceLine({
        price: entryPrice,
        color: '#f59e0b',
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: 'Entry',
      });
      entryLineRef.current = entryLine;
    }

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height, entryPrice, side]);

  // Fetch price history from Hyperliquid
  useEffect(() => {
    if (!seriesRef.current) return;

    // Parse symbol: WLD/USDC:USDC -> WLD
    const baseSymbol = symbol.split('/')[0];
    
    fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: {
          coin: baseSymbol,
          interval: '1h',
          startTime: Math.floor(Date.now() / 1000) - 24 * 3600, // last 24h
          endTime: Math.floor(Date.now() / 1000),
        },
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && Array.isArray(data)) {
          const chartData = data.map((c: any) => ({
            time: c.t,
            value: parseFloat(c.c), // close price
          }));
          seriesRef.current.setData(chartData);
          chartRef.current?.timeScale().fitContent();
          setLoading(false);
        } else {
          setError('No data');
          setLoading(false);
        }
      })
      .catch((e) => {
        setError('Fetch error');
        setLoading(false);
      });
  }, [symbol]);

  if (loading) {
    return (
      <div className="h-32 bg-hl-panel rounded flex items-center justify-center text-hl-muted text-xs">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-32 bg-hl-panel rounded flex items-center justify-center text-hl-muted text-xs">
        {error}
      </div>
    );
  }

  return <div ref={chartContainerRef} className="rounded bg-hl-panel" />;
}