/**
 * Build a deposit-adjusted PnL series from an equity curve + cash-flow events.
 *
 * net_pnl(t) = equity(t) - baselineEquity - cumulativeCashFlow(up to t)
 *
 * Deposits/withdrawals must be supplied as cash-flow events (or synthetic jumps)
 * so transfers are never painted as trading profit on the chart.
 */

export type EquityPoint = { ts: string; equity: number };
export type CashFlowPoint = { ts: string; amount: number };
export type PnlPoint = { ts: string; pnl: number };

/**
 * If a cash flow is recorded while a strategy is offline, portfolio equity may
 * keep updating (other strategies) before the catch-up jump. Re-timestamp the
 * flow onto the matching equity jump so PnL does not dip then spike by ~deposit.
 */
export function alignCashFlowsToEquityCatchUp(
  equityCurve: EquityPoint[],
  cashFlowEvents: CashFlowPoint[],
  opts?: { maxDelayMs?: number; relTol?: number }
): CashFlowPoint[] {
  if (!equityCurve.length || !cashFlowEvents.length) return cashFlowEvents;

  const maxDelayMs = opts?.maxDelayMs ?? 48 * 60 * 60 * 1000;
  const relTol = opts?.relTol ?? 0.15;
  const jumps: Array<{ ts: string; tsMs: number; amount: number }> = [];
  for (let i = 1; i < equityCurve.length; i += 1) {
    const prev = Number(equityCurve[i - 1].equity);
    const cur = Number(equityCurve[i].equity);
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    const amount = cur - prev;
    if (Math.abs(amount) < 50) continue;
    jumps.push({
      ts: equityCurve[i].ts,
      tsMs: new Date(equityCurve[i].ts).getTime(),
      amount,
    });
  }

  const usedJumps = new Set<number>();
  return cashFlowEvents.map((flow) => {
    const amount = Number(flow.amount);
    const flowMs = new Date(flow.ts).getTime();
    if (!Number.isFinite(amount) || !Number.isFinite(flowMs) || Math.abs(amount) < 50) {
      return flow;
    }

    // Already aligned with a near-simultaneous equity jump.
    const immediate = jumps.findIndex((j, idx) => {
      if (usedJumps.has(idx)) return false;
      if (Math.abs(j.tsMs - flowMs) > 120_000) return false;
      const scale = Math.max(Math.abs(amount), Math.abs(j.amount), 1);
      return Math.abs(j.amount - amount) / scale <= relTol;
    });
    if (immediate >= 0) {
      usedJumps.add(immediate);
      return flow;
    }

    const matchIdx = jumps.findIndex((j, idx) => {
      if (usedJumps.has(idx)) return false;
      if (j.tsMs <= flowMs) return false;
      if (j.tsMs - flowMs > maxDelayMs) return false;
      const scale = Math.max(Math.abs(amount), Math.abs(j.amount), 1);
      return Math.abs(j.amount - amount) / scale <= relTol;
    });
    if (matchIdx < 0) return flow;
    usedJumps.add(matchIdx);
    return { ...flow, ts: jumps[matchIdx].ts };
  });
}

export function buildPnlCurve(params: {
  equityCurve: EquityPoint[];
  cashFlowEvents: CashFlowPoint[];
  baselineEquity: number;
  /** When set, ignore curve points / flows at or before this timestamp. */
  baselineTs?: string | null;
}): PnlPoint[] {
  const { equityCurve, cashFlowEvents, baselineEquity } = params;
  if (!equityCurve.length) return [];

  const firstMeaningful =
    equityCurve.find((p) => Number(p.equity) > 0) ?? equityCurve[0];
  const baselineTsMs = new Date(
    params.baselineTs ?? firstMeaningful?.ts ?? equityCurve[0].ts
  ).getTime();

  const sortedFlows = [...cashFlowEvents]
    .filter((e) => e?.ts != null && e?.amount != null)
    .filter((e) => new Date(e.ts).getTime() > baselineTsMs)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  let flowIdx = 0;
  let cumulativeCashFlow = 0;
  const out: PnlPoint[] = [];

  for (const p of equityCurve) {
    const pointTs = new Date(p.ts).getTime();
    const equityValue = Number(p.equity);
    if (!Number.isFinite(pointTs) || !Number.isFinite(equityValue)) continue;
    if (pointTs < baselineTsMs) continue;

    while (
      flowIdx < sortedFlows.length &&
      new Date(sortedFlows[flowIdx].ts).getTime() <= pointTs
    ) {
      cumulativeCashFlow += Number(sortedFlows[flowIdx].amount || 0);
      flowIdx += 1;
    }

    out.push({
      ts: p.ts,
      pnl: equityValue - baselineEquity - cumulativeCashFlow,
    });
  }

  return out;
}

/** True if the PnL series has a single-step jump larger than `maxStep`. */
export function hasOversizedPnlStep(
  pnlCurve: PnlPoint[],
  maxStep: number
): boolean {
  for (let i = 1; i < pnlCurve.length; i += 1) {
    if (Math.abs(pnlCurve[i].pnl - pnlCurve[i - 1].pnl) > maxStep) return true;
  }
  return false;
}
