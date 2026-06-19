// Performance & risk statistics computed from a series of per-bar returns and an equity curve.
import type { PerformanceMetrics } from "./types";

const TRADING_DAYS = 252;

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Downside deviation: std of negative returns only (used for Sortino). */
export function downsideDeviation(xs: number[], target = 0): number {
  const downside = xs.map((x) => Math.min(0, x - target));
  if (downside.length === 0) return 0;
  const v = downside.reduce((a, b) => a + b * b, 0) / downside.length;
  return Math.sqrt(v);
}

/** Annualised Sharpe ratio from daily returns. riskFree is annual (e.g. 0.04). */
export function sharpe(returns: number[], riskFree = 0): number {
  if (returns.length < 2) return 0;
  const dailyRf = riskFree / TRADING_DAYS;
  const excess = returns.map((r) => r - dailyRf);
  const sd = stdDev(excess);
  if (sd === 0) return 0;
  return (mean(excess) / sd) * Math.sqrt(TRADING_DAYS);
}

export function sortino(returns: number[], riskFree = 0): number {
  if (returns.length < 2) return 0;
  const dailyRf = riskFree / TRADING_DAYS;
  const excess = returns.map((r) => r - dailyRf);
  const dd = downsideDeviation(excess);
  if (dd === 0) return 0;
  return (mean(excess) / dd) * Math.sqrt(TRADING_DAYS);
}

export function annualVol(returns: number[]): number {
  return stdDev(returns) * Math.sqrt(TRADING_DAYS);
}

/** Compute the equity curve (values) into max drawdown as a negative fraction. */
export function maxDrawdown(equity: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

/** Drawdown curve aligned to the equity curve (each point is 0 or negative). */
export function drawdownSeries(equity: number[]): number[] {
  let peak = -Infinity;
  return equity.map((v) => {
    if (v > peak) peak = v;
    return peak > 0 ? v / peak - 1 : 0;
  });
}

export function cagr(equity: number[], periodsPerYear = TRADING_DAYS): number {
  if (equity.length < 2) return 0;
  const start = equity[0];
  const end = equity[equity.length - 1];
  if (start <= 0 || end <= 0) return -1;
  const years = (equity.length - 1) / periodsPerYear;
  if (years <= 0) return 0;
  return Math.pow(end / start, 1 / years) - 1;
}

export function computeMetrics(
  equity: number[],
  returns: number[],
  weightsGrossPerBar: number[],
): PerformanceMetrics {
  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const maxDd = maxDrawdown(equity);
  const annualReturn = cagr(equity);
  return {
    totalReturn: equity.length > 0 ? equity[equity.length - 1] / equity[0] - 1 : 0,
    cagr: annualReturn,
    annualVol: annualVol(returns),
    sharpe: sharpe(returns),
    sortino: sortino(returns),
    maxDrawdown: maxDd,
    calmar: maxDd < 0 ? annualReturn / Math.abs(maxDd) : 0,
    winRate: returns.length > 0 ? wins.length / returns.filter((r) => r !== 0).length || 0 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    bestDay: returns.length ? Math.max(...returns) : 0,
    worstDay: returns.length ? Math.min(...returns) : 0,
    exposure: weightsGrossPerBar.length ? mean(weightsGrossPerBar) : 0,
  };
}

/**
 * Realistic compounding projection. Given a starting capital and a per-period
 * return, returns the ending capital after `periods`. Used by the "Reality"
 * calculator to show what is — and isn't — achievable.
 */
export function compound(capital: number, ratePerPeriod: number, periods: number): number {
  return capital * Math.pow(1 + ratePerPeriod, periods);
}
