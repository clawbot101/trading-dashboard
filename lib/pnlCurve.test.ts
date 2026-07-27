/**
 * Regression guards for deposit / transfer PnL accounting.
 *
 * Run: npx --yes tsx lib/pnlCurve.test.ts
 */

import assert from 'node:assert/strict';
import {
  alignCashFlowsToEquityCatchUp,
  buildPnlCurve,
  hasOversizedPnlStep,
} from './pnlCurve';

function almostEqual(a: number, b: number, tol = 1e-6) {
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b}`);
}

// Case A: deposit catch-up neutralized by cash flow at jump time
{
  const equityCurve = [
    { ts: '2026-07-23T01:00:00.000Z', equity: 7000 },
    { ts: '2026-07-23T12:00:00.000Z', equity: 7050 },
    { ts: '2026-07-23T17:23:00.000Z', equity: 17050 },
    { ts: '2026-07-23T18:00:00.000Z', equity: 17080 },
  ];
  const cashFlowEvents = [{ ts: '2026-07-23T17:23:00.000Z', amount: 10000 }];
  const pnl = buildPnlCurve({
    equityCurve,
    cashFlowEvents,
    baselineEquity: 7000,
  });
  assert.equal(hasOversizedPnlStep(pnl, 500), false, 'deposit catch-up must not spike PnL');
  almostEqual(pnl[0].pnl, 0);
  almostEqual(pnl[pnl.length - 1].pnl, 80);
}

// Case B: seeded baseline already includes pending deposit
{
  const equityCurve = [
    { ts: '2026-07-23T01:00:00.000Z', equity: 17000 },
    { ts: '2026-07-23T12:00:00.000Z', equity: 17040 },
    { ts: '2026-07-23T17:23:00.000Z', equity: 17050 },
    { ts: '2026-07-23T18:00:00.000Z', equity: 17080 },
  ];
  const pnl = buildPnlCurve({
    equityCurve,
    cashFlowEvents: [],
    baselineEquity: 17000,
  });
  assert.equal(hasOversizedPnlStep(pnl, 500), false, 'seeded baseline must stay flat');
  almostEqual(pnl[pnl.length - 1].pnl, 80);
}

// Case C: unneutralized catch-up is detected
{
  const equityCurve = [
    { ts: '2026-07-23T01:00:00.000Z', equity: 7000 },
    { ts: '2026-07-23T17:23:00.000Z', equity: 17000 },
  ];
  const pnlBroken = buildPnlCurve({
    equityCurve,
    cashFlowEvents: [],
    baselineEquity: 7000,
  });
  assert.equal(
    hasOversizedPnlStep(pnlBroken, 500),
    true,
    'sanity: unneutralized deposit catch-up is detected as oversized'
  );
}

// Case D: All-strategies — CF while another strategy keeps ticking; align to catch-up
{
  const equityCurve = [
    { ts: '2026-07-22T22:00:00.000Z', equity: 2000 },
    { ts: '2026-07-22T23:10:00.000Z', equity: 2010 },
    { ts: '2026-07-22T23:30:00.000Z', equity: 2020 },
    { ts: '2026-07-23T17:23:00.000Z', equity: 12020 },
    { ts: '2026-07-23T18:00:00.000Z', equity: 12050 },
  ];
  const rawFlows = [{ ts: '2026-07-22T23:10:00.000Z', amount: 10000 }];
  const aligned = alignCashFlowsToEquityCatchUp(equityCurve, rawFlows);
  assert.equal(aligned[0].ts, '2026-07-23T17:23:00.000Z');

  const pnlBroken = buildPnlCurve({
    equityCurve,
    cashFlowEvents: rawFlows,
    baselineEquity: 2000,
  });
  assert.equal(hasOversizedPnlStep(pnlBroken, 1000), true, 'unaligned CF must spike');

  const pnlFixed = buildPnlCurve({
    equityCurve,
    cashFlowEvents: aligned,
    baselineEquity: 2000,
  });
  assert.equal(hasOversizedPnlStep(pnlFixed, 1000), false, 'aligned CF must not spike');
  almostEqual(pnlFixed[pnlFixed.length - 1].pnl, 50);
}

// Case E: prod-shaped 30D — $10k CF on 7/22, equity catch-up next day
{
  const equityCurve = [
    { ts: '2026-07-22T22:00:00.000Z', equity: 2190 },
    { ts: '2026-07-22T23:13:56.857Z', equity: 7194 },
    { ts: '2026-07-23T02:36:56.827Z', equity: 7200 },
    { ts: '2026-07-23T17:23:40.614Z', equity: 17393 },
    { ts: '2026-07-23T18:01:23.225Z', equity: 22005 },
  ];
  const rawFlows = [
    { ts: '2026-07-22T23:08:56.818Z', amount: 4899.75 },
    { ts: '2026-07-22T23:10:58.090Z', amount: 10000 },
    { ts: '2026-07-23T17:55:34.083Z', amount: 4871.89 },
  ];
  const aligned = alignCashFlowsToEquityCatchUp(equityCurve, rawFlows);
  assert.equal(aligned[1].ts, '2026-07-23T17:23:40.614Z', '10k must move onto catch-up jump');

  const pnlNaive = buildPnlCurve({
    equityCurve,
    cashFlowEvents: rawFlows,
    baselineEquity: 2190,
  });
  assert.equal(hasOversizedPnlStep(pnlNaive, 1000), true, 'unaligned 10k must valley');

  const pnl = buildPnlCurve({
    equityCurve,
    cashFlowEvents: aligned,
    baselineEquity: 2190,
  });
  assert.equal(hasOversizedPnlStep(pnl, 1000), false, 'aligned 30D must not valley -$10k');
  const minPnl = Math.min(...pnl.map((p) => p.pnl));
  assert.ok(minPnl > -1000, `min PnL ${minPnl} should not be ~-10k`);
}

console.log('pnlCurve.test.ts: all checks passed');
