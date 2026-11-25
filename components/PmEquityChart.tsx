'use client';

import { useEffect, useRef } from 'react';
import type { UTCTimestamp } from 'lightweight-charts';

export interface PmEquitySeries {
  name: string;
  color: string;
  points: { time: number; value: number }[]; // time = unix seconds
}

interface Props {
  series: PmEquitySeries[];
  base?: number | null; // reference level: $10,000 for account total, 0 for PnL, none for prices
  baseTitle?: string;
  precision?: number;
  height?: number;
}

function unique(points: { time: number; value: number }[]) {
  const bySecond = new Map<number, number>();
  for (const p of points) {
    if (Number.isFinite(p.time) && Number.isFinite(p.value)) bySecond.set(Math.floor(p.time), p.value);
  }
  return Array.from(bySecond.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ time: t as UTCTimestamp, value: v }));
}

/** Account total or PnL over time, one line per variant, with a dashed reference line. */
export default function PmEquityChart({ series, base = null, baseTitle = '', precision = 2, height = 280 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let disposed = false;
    let chart: any = null;
    const el = ref.current;

    import('lightweight-charts').then(({ createChart, ColorType, LineStyle }) => {
      if (disposed || !el) return;
      el.innerHTML = '';
      chart = createChart(el, {
        width: el.clientWidth,
        height,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#a0a0a0' },
        grid: {
          vertLines: { color: 'rgba(60, 60, 60, 0.3)' },
          horzLines: { color: 'rgba(60, 60, 60, 0.3)' },
        },
        rightPriceScale: { borderColor: 'rgba(60, 60, 60, 0.5)' },
        timeScale: { borderColor: 'rgba(60, 60, 60, 0.5)', timeVisible: true, secondsVisible: false },
      });
      series.forEach((s, i) => {
        const line = chart.addLineSeries({
          color: s.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: 'price', precision, minMove: precision === 3 ? 0.001 : 0.01 },
        });
        line.setData(unique(s.points));
        if (i === 0 && base !== null) {
          line.createPriceLine({
            price: base,
            color: 'rgba(160,160,160,0.7)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: baseTitle,
          });
        }
      });
      chart.timeScale().fitContent();
    });

    const onResize = () => {
      if (chart && el) chart.applyOptions({ width: el.clientWidth });
    };
    window.addEventListener('resize', onResize);
    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      if (chart) chart.remove();
      chart = null;
    };
  }, [series, base, baseTitle, precision, height]);

  return <div ref={ref} className="rounded" />;
}
