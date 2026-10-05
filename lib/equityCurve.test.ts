/**
 * Run: npx --yes tsx lib/equityCurve.test.ts
 */

import assert from 'node:assert/strict';
import {
  bucketStartMs,
  curveStepSeconds,
  sliceCurveToWindow,
  stitchEquityCurves,
} from './equityCurve';

assert.equal(curveStepSeconds('24H', 'coarse'), 3600);
assert.equal(curveStepSeconds('30D', 'coarse'), 86400);
assert.equal(curveStepSeconds('90D', 'coarse'), 86400);
assert.equal(curveStepSeconds('7D', 'coarse'), 86400);
assert.equal(curveStepSeconds('24H', 'fine'), 300);
assert.equal(curveStepSeconds('30D', 'fine'), 900);
assert.equal(curveStepSeconds('90D', 'fine'), 1800);

assert.equal(
  bucketStartMs(Date.parse('2026-10-05T10:17:00Z'), 3600),
  Date.parse('2026-10-05T10:00:00Z')
);
assert.equal(
  bucketStartMs(Date.parse('2026-10-05T10:17:00Z'), 86400),
  Date.parse('2026-10-05T00:00:00Z')
);

{
  const sliced = sliceCurveToWindow(
    [
      { ts: '2026-10-01T00:00:00.000Z', equity: 100 },
      { ts: '2026-10-03T00:00:00.000Z', equity: 130 },
      { ts: '2026-10-04T00:00:00.000Z', equity: 140 },
    ],
    Date.parse('2026-10-03T12:00:00Z')
  );
  assert.equal(sliced[0].ts, '2026-10-03T12:00:00.000Z');
  assert.equal(sliced[0].equity, 130);
  assert.equal(sliced[1].equity, 140);
}

{
  const stitched = stitchEquityCurves(
    [
      { ts: '2026-10-04T00:00:00.000Z', equity: 100 },
      { ts: '2026-10-05T00:00:00.000Z', equity: 110 },
    ],
    [
      { ts: '2026-10-05T00:00:00.000Z', equity: 110 },
      { ts: '2026-10-05T10:00:00.000Z', equity: 125 },
    ]
  );
  assert.equal(stitched.length, 3);
  assert.equal(stitched[2].equity, 125);
}

{
  const stitched = stitchEquityCurves(
    [{ ts: '2026-10-05T00:00:00.000Z', equity: 110 }],
    [
      { ts: '2026-10-05T00:00:00.000Z', equity: 10110 },
      { ts: '2026-10-05T10:00:00.000Z', equity: 10120 },
    ]
  );
  assert.equal(stitched[0].equity, 10110);
  assert.equal(stitched[1].equity, 10120);
}

console.log('equityCurve tests ok');
