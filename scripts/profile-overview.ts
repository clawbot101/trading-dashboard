import {
  getOverviewStats,
  getEquityCurve,
  getStrategyLeaderboard,
  getVenueSplit,
  getRecentFills,
  getLatestRebalanceStatus,
  getCashFlowEvents,
} from '../lib/queries/overview.ts';

async function timed(name: string, fn: () => Promise<any>) {
  const t = Date.now();
  const result = await fn();
  console.log(name, Date.now() - t, 'ms');
  return result;
}

async function main() {
  for (const range of ['24H', 'ALL'] as const) {
    console.log('====', range);
    const stats = await timed('stats', () => getOverviewStats(range));
    const curve = await timed('curve', () => getEquityCurve(range));
    await timed('lb', () => getStrategyLeaderboard(range));
    await timed('venue', () => getVenueSplit());
    await timed('fills', () => getRecentFills(20));
    await timed('rebalance', () => getLatestRebalanceStatus());
    const start =
      range === 'ALL'
        ? stats?.initial_equity_ts ?? curve[0]?.ts
        : curve[0]?.ts;
    await timed('cashflows', () =>
      getCashFlowEvents(start, curve.at(-1)?.ts ?? new Date().toISOString())
    );
    console.log('curve_points', curve.length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
