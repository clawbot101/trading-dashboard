/**
 * Shared KPI calculations for the trading dashboard.
 * All metrics computed from raw data with proper formulas.
 */

/**
 * Calculate return percentage.
 * Returns assume no mid-period deposits/withdrawals if netDeposits = 0.
 */
export function returnPct(
  equityEnd: number,
  equityStart: number,
  netDeposits = 0
): number {
  if (equityStart === 0) return 0;
  return ((equityEnd - equityStart - netDeposits) / equityStart) * 100;
}

/**
 * Calculate Sharpe ratio from daily returns.
 * Sharpe = mean(daily) / std(daily) * sqrt(365)
 */
export function sharpeRatio(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / dailyReturns.length;
  const std = Math.sqrt(variance);
  
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(365);
}

/**
 * Calculate Sortino ratio from daily returns.
 * Uses downside deviation only.
 */
export function sortinoRatio(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  
  // Filter negative returns for downside deviation
  const negativeReturns = dailyReturns.filter(r => r < 0);
  if (negativeReturns.length === 0) return Infinity; // No downside
  
  const downsideVariance = negativeReturns.reduce((a, r) => a + Math.pow(r, 2), 0) / negativeReturns.length;
  const downsideStd = Math.sqrt(downsideVariance);
  
  if (downsideStd === 0) return 0;
  return (mean / downsideStd) * Math.sqrt(365);
}

/**
 * Calculate max drawdown from equity curve.
 * Peak-to-trough within the series.
 */
export function maxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length < 2) return 0;
  
  let peak = equityCurve[0];
  let maxDD = 0;
  
  for (const equity of equityCurve) {
    if (equity > peak) {
      peak = equity;
    }
    const dd = (peak - equity) / peak;
    if (dd > maxDD) {
      maxDD = dd;
    }
  }
  
  return maxDD * 100; // Return as percentage
}

/**
 * Calculate max drawdown value in USD.
 */
export function maxDrawdownUsd(equityCurve: number[]): number {
  if (equityCurve.length < 2) return 0;
  
  let peak = equityCurve[0];
  let maxDDUsd = 0;
  
  for (const equity of equityCurve) {
    if (equity > peak) {
      peak = equity;
    }
    const ddUsd = peak - equity;
    if (ddUsd > maxDDUsd) {
      maxDDUsd = ddUsd;
    }
  }
  
  return maxDDUsd;
}

/**
 * Calculate win rate from round-trip trades.
 * Win = trade with positive PnL.
 */
export function winRate(trades: { pnl: number }[]): number {
  if (trades.length === 0) return 0;
  const wins = trades.filter(t => t.pnl > 0).length;
  return (wins / trades.length) * 100;
}

/**
 * Calculate profit factor from round-trip trades.
 * Profit factor = sum(wins) / abs(sum(losses))
 */
export function profitFactor(trades: { pnl: number }[]): number {
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  
  const totalWins = wins.reduce((a, t) => a + t.pnl, 0);
  const totalLosses = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  
  if (totalLosses === 0) return Infinity;
  return totalWins / totalLosses;
}

/**
 * Calculate average win and average loss.
 */
export function avgWinLoss(trades: { pnl: number }[]): { avgWin: number; avgLoss: number } {
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  
  const avgWin = wins.length > 0 ? wins.reduce((a, t) => a + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, t) => a + t.pnl, 0) / losses.length : 0;
  
  return { avgWin, avgLoss };
}

/**
 * Calculate total fees from fills.
 */
export function totalFees(fills: { fee: number }[]): number {
  return fills.reduce((a, f) => a + (f.fee || 0), 0);
}

/**
 * Calculate total funding payments.
 */
export function totalFunding(fundingPayments: { payment: number }[]): number {
  return fundingPayments.reduce((a, f) => a + (f.payment || 0), 0);
}

/**
 * PnL reconciliation check.
 * Δequity ≈ ΣrealizedPnl + Δunrealized + Σfunding - Σfees
 */
export function pnlReconciliation(
  equityDelta: number,
  realizedPnl: number,
  unrealizedDelta: number,
  funding: number,
  fees: number
): { expected: number; actual: number; diff: number } {
  const expected = realizedPnl + unrealizedDelta + funding - fees;
  const diff = equityDelta - expected;
  
  return {
    expected,
    actual: equityDelta,
    diff
  };
}

/**
 * Calculate gross exposure from positions.
 * Sum of absolute position notionals.
 */
export function grossExposure(positions: { notional: number }[]): number {
  return positions.reduce((a, p) => a + Math.abs(p.notional || 0), 0);
}

/**
 * Calculate net exposure from positions.
 * Sum of position notionals (signed).
 */
export function netExposure(positions: { notional: number }[]): number {
  return positions.reduce((a, p) => a + (p.notional || 0), 0);
}

/**
 * Calculate total unrealized PnL.
 */
export function totalUnrealizedPnl(positions: { unrealized_pnl: number }[]): number {
  return positions.reduce((a, p) => a + (p.unrealized_pnl || 0), 0);
}

/**
 * Calculate total realized PnL.
 */
export function totalRealizedPnl(tradesOrFills: { realized_pnl: number }[]): number {
  return tradesOrFills.reduce((a, t) => a + (t.realized_pnl || 0), 0);
}

/**
 * Calculate daily returns from equity snapshots.
 * Assumes snapshots are ordered chronologically.
 */
export function dailyReturns(snapshots: { ts: string; equity: number }[]): number[] {
  if (snapshots.length < 2) return [];
  
  // Group by day, take last equity per day
  const dailyMap = new Map<string, number>();
  for (const snap of snapshots) {
    const date = new Date(snap.ts).toISOString().split('T')[0];
    dailyMap.set(date, snap.equity);
  }
  
  const days = Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const returns: number[] = [];
  
  for (let i = 1; i < days.length; i++) {
    const prevEquity = days[i - 1][1];
    const currEquity = days[i][1];
    if (prevEquity > 0) {
      returns.push(((currEquity - prevEquity) / prevEquity) * 100);
    }
  }
  
  return returns;
}

/**
 * Calculate rolling volatility from equity curve.
 * Standard deviation of daily returns, annualized.
 */
export function rollingVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  
  const variance = dailyReturns.reduce((a, r) => {
    const mean = dailyReturns.reduce((x, y) => x + y, 0) / dailyReturns.length;
    return a + Math.pow(r - mean, 2);
  }, 0) / dailyReturns.length;
  
  return Math.sqrt(variance) * Math.sqrt(365);
}