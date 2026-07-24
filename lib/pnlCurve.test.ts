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

console.log('pnlCurve.test.ts: all checks passed');
