// Monte Carlo forward simulation. Takes a strategy's historical daily returns and
// projects thousands of possible futures — because a single backtest is one draw
// from a distribution, and what matters for survival is the SHAPE of that
// distribution: the fan of outcomes, the probability of ruin, and the tail risk
// (VaR / CVaR). This is how serious desks size bets and stress survival.
import { mulberry32 } from "./data";

export type MCMethod = "block" | "iid" | "normal";

export interface MonteCarloConfig {
  horizonDays: number;
  paths: number;
  initialCapital: number;
  method: MCMethod;
  blockSize: number;
  /** Terminal capital considered a "success". */
  target: number;
  /** Max-drawdown fraction (e.g. 0.5) considered "ruin". */
  ruinDrawdown: number;
  seed: number;
}

export interface Band {
  step: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface MonteCarloResult {
  bands: Band[];
  samplePaths: number[][];
  terminal: { p5: number; p25: number; p50: number; p75: number; p95: number; mean: number };
  probTarget: number;
  probLoss: number;
  probRuin: number;
  /** 95% 1-horizon Value-at-Risk and Conditional VaR, as positive loss fractions. */
  var95: number;
  cvar95: number;
  medianMaxDrawdown: number;
  medianCAGR: number;
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

export function runMonteCarlo(returns: number[], cfg: MonteCarloConfig): MonteCarloResult {
  const rng = mulberry32(cfg.seed >>> 0);
  const n = returns.length;
  const mean = n ? returns.reduce((a, b) => a + b, 0) / n : 0;
  const sd =
    n > 1 ? Math.sqrt(returns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : 0;

  const H = cfg.horizonDays;
  const P = cfg.paths;
  // equityAtStep[step] holds the value across all paths (for percentile bands).
  const equityAtStep: number[][] = Array.from({ length: H + 1 }, () => new Array(P).fill(0));
  const terminals: number[] = new Array(P);
  const maxDDs: number[] = new Array(P);
  const sampleCount = Math.min(24, P);
  const samplePaths: number[][] = [];

  for (let p = 0; p < P; p++) {
    let equity = cfg.initialCapital;
    let peak = equity;
    let maxDD = 0;
    equityAtStep[0][p] = equity;
    let blockLeft = 0;
    let blockIdx = 0;
    const path = p < sampleCount ? [equity] : null;

    for (let s = 1; s <= H; s++) {
      let r: number;
      if (cfg.method === "normal" || n === 0) {
        r = mean + sd * gaussian(rng);
      } else if (cfg.method === "iid") {
        r = returns[Math.floor(rng() * n)];
      } else {
        // Block bootstrap: preserves short-term autocorrelation & vol clustering.
        if (blockLeft <= 0) {
          blockIdx = Math.floor(rng() * n);
          blockLeft = cfg.blockSize;
        }
        r = returns[blockIdx % n];
        blockIdx++;
        blockLeft--;
      }
      equity *= 1 + r;
      if (equity > peak) peak = equity;
      const dd = peak > 0 ? equity / peak - 1 : 0;
      if (dd < maxDD) maxDD = dd;
      equityAtStep[s][p] = equity;
      if (path) path.push(equity);
    }
    terminals[p] = equity;
    maxDDs[p] = maxDD;
    if (path) samplePaths.push(path);
  }

  // Percentile bands per step.
  const bands: Band[] = [];
  for (let s = 0; s <= H; s++) {
    const col = equityAtStep[s].slice().sort((a, b) => a - b);
    bands.push({
      step: s,
      p5: percentile(col, 0.05),
      p25: percentile(col, 0.25),
      p50: percentile(col, 0.5),
      p75: percentile(col, 0.75),
      p95: percentile(col, 0.95),
    });
  }

  const sortedTerm = terminals.slice().sort((a, b) => a - b);
  const termReturns = terminals.map((t) => t / cfg.initialCapital - 1).sort((a, b) => a - b);
  const sortedDD = maxDDs.slice().sort((a, b) => a - b); // most negative first

  const probTarget = terminals.filter((t) => t >= cfg.target).length / P;
  const probLoss = terminals.filter((t) => t < cfg.initialCapital).length / P;
  const probRuin = maxDDs.filter((d) => d <= -cfg.ruinDrawdown).length / P;

  // VaR / CVaR at 95% on terminal returns.
  const var95 = -percentile(termReturns, 0.05);
  const tailCount = Math.max(1, Math.floor(0.05 * P));
  let tailSum = 0;
  for (let i = 0; i < tailCount; i++) tailSum += termReturns[i];
  const cvar95 = -(tailSum / tailCount);

  const years = H / 252;
  const medianTerminal = percentile(sortedTerm, 0.5);
  const medianCAGR =
    years > 0 && medianTerminal > 0
      ? Math.pow(medianTerminal / cfg.initialCapital, 1 / years) - 1
      : 0;

  return {
    bands,
    samplePaths,
    terminal: {
      p5: percentile(sortedTerm, 0.05),
      p25: percentile(sortedTerm, 0.25),
      p50: medianTerminal,
      p75: percentile(sortedTerm, 0.75),
      p95: percentile(sortedTerm, 0.95),
      mean: terminals.reduce((a, b) => a + b, 0) / P,
    },
    probTarget,
    probLoss,
    probRuin,
    var95,
    cvar95,
    medianMaxDrawdown: percentile(sortedDD, 0.5),
    medianCAGR,
  };
}
