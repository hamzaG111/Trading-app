// Tail- and shape-aware risk statistics. Sharpe assumes a bell curve; real
// returns have fat tails and negative skew, where the real danger lives. These
// metrics look past the average at the shape and the tails of the distribution.

function sortedAsc(xs: number[]): number[] {
  return xs.slice().sort((a, b) => a - b);
}

function moment(xs: number[], k: number, mean: number, sd: number): number {
  if (sd < 1e-12 || xs.length === 0) return 0;
  const s = xs.reduce((a, b) => a + Math.pow((b - mean) / sd, k), 0);
  return s / xs.length;
}

export interface RiskMetrics {
  var95: number; // historical 95% VaR (positive loss fraction, daily)
  cvar95: number; // expected shortfall beyond VaR
  skew: number;
  kurtosis: number; // excess kurtosis (0 = normal)
  ulcerIndex: number; // RMS of drawdown depth — pain, not just volatility
  gainToPain: number; // sum gains / sum |losses|
  omega: number; // prob-weighted gains/losses around 0
  tailRatio: number; // |95th pct| / |5th pct|
}

export function computeRiskMetrics(returns: number[], equity: number[]): RiskMetrics {
  const n = returns.length;
  if (n < 2) {
    return { var95: 0, cvar95: 0, skew: 0, kurtosis: 0, ulcerIndex: 0, gainToPain: 0, omega: 0, tailRatio: 0 };
  }
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(returns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1));
  const sorted = sortedAsc(returns);
  const at = (p: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))];

  const var95 = -at(0.05);
  const tailCount = Math.max(1, Math.floor(0.05 * n));
  let tail = 0;
  for (let i = 0; i < tailCount; i++) tail += sorted[i];
  const cvar95 = -(tail / tailCount);

  const gains = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r < 0);
  const sumGain = gains.reduce((a, b) => a + b, 0);
  const sumLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  // Ulcer index from the equity curve.
  let peak = -Infinity;
  let sqSum = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (v / peak - 1) * 100 : 0;
    sqSum += dd * dd;
  }
  const ulcerIndex = Math.sqrt(sqSum / equity.length);

  const p95 = Math.abs(at(0.95));
  const p05 = Math.abs(at(0.05));

  return {
    var95,
    cvar95,
    skew: moment(returns, 3, mean, sd),
    kurtosis: moment(returns, 4, mean, sd) - 3,
    ulcerIndex,
    gainToPain: sumLoss > 1e-12 ? sumGain / sumLoss : sumGain > 0 ? Infinity : 0,
    omega: sumLoss > 1e-12 ? sumGain / sumLoss : sumGain > 0 ? Infinity : 0,
    tailRatio: p05 > 1e-12 ? p95 / p05 : 0,
  };
}
