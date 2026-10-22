import { getStrategyLeaderboard } from '../lib/queries/overview';

async function main() {
  const lb = await getStrategyLeaderboard('ALL');
  for (const s of lb) {
    const r = s.inception_realized_pnl + s.unrealized_pnl;
    console.log({
      name: s.strategy_name,
      contributed: +s.contributed_capital.toFixed(2),
      equity: +s.latest_equity.toFixed(2),
      inception_pnl: +s.inception_pnl.toFixed(2),
      realized: +s.inception_realized_pnl.toFixed(2),
      open: +s.unrealized_pnl.toFixed(2),
      sum: +r.toFixed(2),
      diff_vs_inception: +(s.inception_pnl - r).toFixed(2),
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
