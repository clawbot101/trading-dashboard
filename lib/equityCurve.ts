/**
 * Pure helpers for the overview equity curve.
 *
 * Closed history does not change, so the loader caches everything before the
 * current bucket and only recomputes the open bucket. The page paints a coarse
 * series first (hourly for 24H, daily otherwise) and swaps in the fine series
 * once it arrives.
 */

export type CurveResolution = 'coarse' | 'fine';

export type EquityCurvePoint = { ts: string; equity: number };

const RANGE_MS: Record<string, number> = {
  '24H': 24 * 60 * 60 * 1000,
  '7D': 7 * 24 * 60 * 60 * 1000,
  '30D': 30 * 24 * 60 * 60 * 1000,
  '90D': 90 * 24 * 60 * 60 * 1000,
};

/**
 * Bucket width in seconds.
 * Coarse is the fast preview. Fine stays close to what the chart already showed
 * after downsampling (about 5–30 minutes), without shipping every snapshot.
 */
export function curveStepSeconds(timeRange: string, resolution: CurveResolution): number {
  if (resolution === 'coarse') {
    return timeRange === '24H' ? 60 * 60 : 24 * 60 * 60;
  }
  switch (timeRange) {
    case '24H':
      return 5 * 60;
    case '7D':
      return 5 * 60;
    case '30D':
      return 15 * 60;
    case '90D':
      return 30 * 60;
    case 'ALL':
      return 60 * 60;
    default:
      return 5 * 60;
  }
}

export function rangeWindowMs(timeRange: string): number | null {
  return RANGE_MS[timeRange] ?? null;
}

/** UTC bucket start. Matches `floor(extract(epoch from ts) / step) * step` in SQL. */
export function bucketStartMs(tsMs: number, stepSeconds: number): number {
  const stepMs = stepSeconds * 1000;
  return Math.floor(tsMs / stepMs) * stepMs;
}

/**
 * Keep the last point at or before `fromMs` as the window anchor, then every
 * later point. Equity values are absolute, so dropping older points does not
 * change the levels that remain.
 */
export function sliceCurveToWindow(
  points: EquityCurvePoint[],
  fromMs: number
): EquityCurvePoint[] {
  let anchor: EquityCurvePoint | null = null;
  const inside: EquityCurvePoint[] = [];
  for (const point of points) {
    const ms = new Date(point.ts).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms < fromMs) anchor = point;
    else inside.push(point);
  }
  if (!anchor) return inside;
  if (inside.length && new Date(inside[0].ts).getTime() === fromMs) return inside;
  return [{ ts: new Date(fromMs).toISOString(), equity: Number(anchor.equity) }, ...inside];
}

/**
 * Join a cached closed prefix to the open-bucket tail.
 * The tail starts with a synthetic seed at the boundary; drop it when it
 * repeats the prefix, and keep it when pending cash flows moved the level.
 */
export function stitchEquityCurves(
  prefix: EquityCurvePoint[],
  tail: EquityCurvePoint[]
): EquityCurvePoint[] {
  if (!prefix.length) return tail;
  if (!tail.length) return prefix;

  const out = [...prefix];
  let lastMs = new Date(out[out.length - 1].ts).getTime();
  let lastEq = Number(out[out.length - 1].equity);

  for (const point of tail) {
    const ms = new Date(point.ts).getTime();
    const equity = Number(point.equity);
    if (!Number.isFinite(ms) || !Number.isFinite(equity)) continue;
    if (ms < lastMs) continue;
    if (ms === lastMs) {
      if (Math.abs(equity - lastEq) < 1) continue;
      out[out.length - 1] = { ts: point.ts, equity };
      lastEq = equity;
      continue;
    }
    out.push({ ts: point.ts, equity });
    lastMs = ms;
    lastEq = equity;
  }
  return out;
}
