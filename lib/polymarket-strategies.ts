// Polymarket paper strategies (polymarket-btc5m, pm_strategies.py). No DB access here, so the
// client page can import it. Add an entry whenever a new Polymarket paper run is started.

export type PmStrategyKey = 'btc_5m' | 'eth_5m' | 'btc_15m';

export type PmStrategy = {
  key: PmStrategyKey; // strategy column in pm_paper_*_all
  slug: string; // URL: /polymarket/<slug>
  label: string; // selector tab
  asset: 'BTC' | 'ETH';
  windowSeconds: number;
  offsets: number[];
  started: string; // UTC date of the first paper round
  title: string;
  blurb: string;
  overview: string[];
  historyNote: string | null; // backtest reference line, BTC 5m only
  barsNote: string; // how the 14-day bars apply to this strategy
};

const COMMON_FILLS =
  'Taker: buy at the decision-time ask, after a 0.2, 0.5 or 1.0 second delay, limit 0.01 above the decision average price. Maker: rest a bid on the favoured side (a: join best bid, cancel at t0; b: cancel at t0 plus 5 s). Filled from real trades, queue-aware.';
const SIMULATED =
  'Observation only: no orders are sent and no keys are used. Fills are simulated from the recorded Polymarket order book and trades, so they are not real fills.';

export const PM_STRATEGIES: PmStrategy[] = [
  {
    key: 'btc_5m',
    slug: 'btc-5m',
    label: 'BTC 5m',
    asset: 'BTC',
    windowSeconds: 300,
    offsets: [-20, -15, -10, -5, -3],
    started: '2026-11-24',
    title: 'Polymarket BTC 5-minute start-price gap (paper)',
    blurb:
      'Observation only, no orders. A new BTC Up/Down market opens every 5 minutes, one round each. Each round, buy the side Binance BTC favours before the start, taker or maker, $100 per round.',
    overview: [
      'Side: BTC mid versus the 60-second average of BTC mid since t0 minus 60 s, measured at t0 minus 20, 15, 10, 5 and 3 seconds. Above the average means Up, below means Down. The Polymarket price never picks the side.',
      'Trade only if the gap is at least 2 bp and the favoured side best ask is at most 0.75. Stake $100 per round and decision time. Rounds run 24/7, 288 a day.',
      COMMON_FILLS,
      'Fees: taker 0.05 times (1 - p) per $, maker 0 (rebate ignored). Outcome from the Chainlink TWAP settlement (btc-5m-twap-60), resolved by Polymarket.',
      'Decision rule after 14 days (made by a person): taker 0.5 s at -10 s with at least +3% per $ and at least 60% fill, or maker with at least +3% per $ and at least 30 fills a day. History for comparison: about +5% at -10 s, +8% at -5 s.',
      SIMULATED,
    ],
    historyNote: 'History for comparison: about +5% per $ at -10 s and +8% at -5 s (2,000 markets, gap at least 2 bp).',
    barsNote: '14-day rule check (at -10 s, to be decided by a person)',
  },
  {
    key: 'eth_5m',
    slug: 'eth-5m',
    label: 'ETH 5m',
    asset: 'ETH',
    windowSeconds: 300,
    offsets: [-20, -15, -10, -5, -3],
    started: '2026-11-27',
    title: 'Polymarket ETH 5-minute start-price gap (paper)',
    blurb:
      'Observation only, no orders. A new ETH Up/Down market opens every 5 minutes. Same rule as BTC 5m, with Binance ETH instead of BTC, $100 per round.',
    overview: [
      'Side: Binance ETHUSDT futures mid versus the 60-second average of ETH mid since t0 minus 60 s, measured at t0 minus 20, 15, 10, 5 and 3 seconds. Above the average means Up, below means Down. The Polymarket price never picks the side.',
      'Trade only if the gap is at least 2 bp and the favoured side best ask is at most 0.75, the BTC 5m thresholds, not tuned for ETH (ETH moves more in bp, so more rounds pass the gap filter). Stake $100 per round and decision time. 288 rounds a day.',
      COMMON_FILLS,
      'Fees: taker 0.01 times (1 - p) per $ (ETH markets use fee rate 0.01), maker 0 (rebate ignored). Outcome from the Chainlink ETH/USD TWAP settlement (eth-5m-twap-60), resolved by Polymarket.',
      SIMULATED,
    ],
    historyNote: null,
    barsNote: 'Rule check at -10 s using the BTC 5m bars (reference only, no ETH-specific rule yet)',
  },
  {
    key: 'btc_15m',
    slug: 'btc-15m',
    label: 'BTC 15m',
    asset: 'BTC',
    windowSeconds: 900,
    offsets: [-20, -15, -10, -5, -3],
    started: '2026-11-27',
    title: 'Polymarket BTC 15-minute start-price gap (paper)',
    blurb:
      'Observation only, no orders. A new BTC Up/Down market opens every 15 minutes, 96 a day. Same pre-start rule as BTC 5m, $100 per round.',
    overview: [
      'The start price is the same 60-second Chainlink TWAP (btc-15m-twap-60), so the side is picked the same way: BTC mid versus the 60-second average since t0 minus 60 s, at t0 minus 20, 15, 10, 5 and 3 seconds. The window after t0 is 15 minutes instead of 5.',
      'Trade only if the gap is at least 2 bp and the favoured side best ask is at most 0.75 (BTC 5m thresholds, not tuned). Stake $100 per round and decision time.',
      COMMON_FILLS,
      'Fees: taker 0.05 times (1 - p) per $, maker 0 (rebate ignored). Outcome from the Chainlink BTC/USD TWAP settlement, resolved by Polymarket.',
      SIMULATED,
    ],
    historyNote: null,
    barsNote: 'Rule check at -10 s using the BTC 5m bars (reference only, no 15m-specific rule yet)',
  },
];

export const PM_DEFAULT_STRATEGY = PM_STRATEGIES[0];

export function pmStrategyBySlug(slug: string | null | undefined): PmStrategy | undefined {
  return PM_STRATEGIES.find((s) => s.slug === slug);
}

export function pmStrategyByKey(key: string | null | undefined): PmStrategy | undefined {
  return PM_STRATEGIES.find((s) => s.key === key);
}

/**
 * A market row is written after it resolves (about window + 1 min after t0), so the newest
 * row is normally under two windows old. Allow extra time for slow resolutions.
 */
export function pmFreshLimitSeconds(s: PmStrategy) {
  return 2 * s.windowSeconds + 600;
}
