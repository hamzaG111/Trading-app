// Risk overlay: the layer that sits between a strategy's raw target weights and
// the actual book. Volatility targeting, gross-exposure caps and fractional
// position sizing are what separate a system that compounds from one that blows up.
import { cachedCloses } from "./data";
import type { RiskConfig, Universe, Weights } from "./types";

const TRADING_DAYS = 252;

/**
 * Ex-ante daily volatility of the portfolio assuming the *current* weights had
 * been held over the trailing window. This is the standard way trend/vol-target
 * funds estimate risk before sizing.
 */
export function estimatePortfolioDailyVol(
  weights: Weights,
  u: Universe,
  symbols: string[],
  t: number,
  lookback: number,
): number {
  const window = Math.min(lookback, t);
  if (window < 5) return 0.01; // not enough history; assume 1%/day
  const pret: number[] = [];
  for (let i = t - window + 1; i <= t; i++) {
    let r = 0;
    for (const s of symbols) {
      const w = weights[s] || 0;
      if (w === 0) continue;
      const c = cachedCloses(u[s]);
      const ar = c[i - 1] !== 0 ? c[i] / c[i - 1] - 1 : 0;
      r += w * ar;
    }
    pret.push(r);
  }
  const m = pret.reduce((a, b) => a + b, 0) / pret.length;
  let v = 0;
  for (const r of pret) v += (r - m) * (r - m);
  return Math.sqrt(v / pret.length);
}

export function gross(weights: Weights): number {
  let g = 0;
  for (const k in weights) g += Math.abs(weights[k]);
  return g;
}

export function scale(weights: Weights, factor: number): Weights {
  const out: Weights = {};
  for (const k in weights) out[k] = weights[k] * factor;
  return out;
}

export function turnover(prev: Weights, next: Weights, symbols: string[]): number {
  let t = 0;
  for (const s of symbols) t += Math.abs((next[s] || 0) - (prev[s] || 0));
  return t;
}

/**
 * Apply the full risk overlay to raw strategy weights:
 *  1. Scale exposure so the portfolio's ex-ante annualised vol ≈ targetVol.
 *  2. Apply the fractional-Kelly deployment factor (bet less than "optimal").
 *  3. Cap gross exposure at maxGross (leverage limit).
 */
export function applyRiskOverlay(
  raw: Weights,
  u: Universe,
  symbols: string[],
  t: number,
  cfg: RiskConfig,
): Weights {
  let scaled = raw;

  if (cfg.targetVol > 0) {
    const dailyVol = estimatePortfolioDailyVol(raw, u, symbols, t, cfg.volLookback);
    const annual = Math.max(dailyVol * Math.sqrt(TRADING_DAYS), 1e-4);
    const volScale = cfg.targetVol / annual;
    // Never lever beyond ~10x from vol-targeting alone; gross cap refines further.
    scaled = scale(raw, Math.min(volScale, 10));
  }

  if (cfg.kellyFraction > 0 && cfg.kellyFraction !== 1) {
    scaled = scale(scaled, cfg.kellyFraction);
  }

  const g = gross(scaled);
  if (g > cfg.maxGross && g > 0) {
    scaled = scale(scaled, cfg.maxGross / g);
  }
  return scaled;
}

/**
 * Fractional Kelly position fraction for a simple win/loss bet.
 *  f* = W - (1 - W) / R    (Kelly), then multiplied by `fraction`.
 * W = win probability, R = average win / average loss.
 * Used by the Risk calculator to teach disciplined sizing. Capped at [0, 1].
 */
export function kellyFraction(winProb: number, winLossRatio: number, fraction = 0.5): number {
  if (winLossRatio <= 0) return 0;
  const full = winProb - (1 - winProb) / winLossRatio;
  return Math.max(0, Math.min(1, full * fraction));
}

export const RISK_PRESETS: Record<string, { name: string; nameAr: string; config: RiskConfig }> = {
  conservative: {
    name: "Conservative",
    nameAr: "متحفّظ",
    config: {
      targetVol: 0.08,
      maxGross: 1.0,
      kellyFraction: 0.5,
      costPerTurnover: 0.0006,
      volLookback: 60,
    },
  },
  balanced: {
    name: "Balanced",
    nameAr: "متوازن",
    config: {
      targetVol: 0.12,
      maxGross: 1.5,
      kellyFraction: 0.75,
      costPerTurnover: 0.0005,
      volLookback: 60,
    },
  },
  aggressive: {
    name: "Aggressive",
    nameAr: "هجومي",
    config: {
      targetVol: 0.18,
      maxGross: 2.0,
      kellyFraction: 1.0,
      costPerTurnover: 0.0005,
      volLookback: 40,
    },
  },
};
