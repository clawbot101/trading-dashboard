import {
  getOverviewStats,
  getEquityCurve,
  getStrategyLeaderboard,
  getCashFlowEvents,
} from '../lib/queries/overview.ts';
import {
  alignCashFlowsToEquityCatchUp,
  buildPnlCurve,
  hasOversizedPnlStep,
} from '../lib/pnlCurve.ts';

async function main() {
  for (const range of ['24H', 'ALL'] as const) {
    const t0 = Date.now();
    const stats = await getOverviewStats(range);
    const t1 = Date.now();
    const lb = await getStrategyLeaderboard(range);
    const curve = await getEquityCurve(range);
    const firstMeaningful = curve.find((p) => Number(p.equity) > 0) ?? curve[0];
    const flows = await getCashFlowEvents(
      range === 'ALL' ? '2000-01-01T00:00:00Z' : curve[0].ts,
      curve.at(-1).ts
    );
    const pnl = buildPnlCurve({
      equityCurve: curve,
      cashFlowEvents: alignCashFlowsToEquityCatchUp(curve, flows),
      baselineEquity:
        range === 'ALL'
          ? Number(firstMeaningful?.equity || 0)
          : Number(stats?.equity_24h_ago || 0),
      baselineTs: firstMeaningful?.ts,
    });
    console.log(range, {
      stats_ms: t1 - t0,
      stats_pnl: +Number(stats?.pnl_24h || 0).toFixed(2),
      lb_sum: +lb.reduce((a, r) => a + r.pnl, 0).toFixed(2),
      pnl_last: +pnl.at(-1)!.pnl.toFixed(2),
      spike_gt_1k: hasOversizedPnlStep(pnl, 1000),
      max_pnl: +Math.max(...pnl.map((p) => p.pnl)).toFixed(2),
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
