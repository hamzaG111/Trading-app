// Portfolio construction — the layer that turns raw strategy signals into the
// actual book, exactly the way the great systematic funds are wired:
//
//   signals  →  regime adaptation  →  risk-model allocation  →  factor tilt  →  book
//   (alpha)     (Two Sigma/DE Shaw)   (Bridgewater/HRP)          (AQR)
//
// This is the single pipeline used by BOTH the backtester and the live
// autopilot, so research and execution can never diverge. Every step uses only
// information available up to bar `t` (no look-ahead).
import { cachedCloses } from "./data";
import { shrinkCovariance } from "./linalg";
import {
  covarianceMatrix,
  equalRiskContribution,
  hrp,
  minVariance,
  returnsMatrix,
} from "./optimize";
import { computeFactors } from "./factors";
import { aggregateRegime } from "./regime";
import { STRATEGIES, STRATEGY_MAP, defaultParams, ensembleWeights } from "./strategies";
import type { Universe, Weights } from "./types";

export type RiskModel = "none" | "inv-var" | "erc" | "hrp" | "min-var";

export interface PortfolioLeg {
  strategyId: string;
  params: Record<string, number>;
  weight: number;
}

export interface PortfolioConfig {
  /** Base strategy sleeves (alpha sources). */
  legs: PortfolioLeg[];
  /** Re-weight the sleeves toward what fits the detected market regime. */
  regimeAdaptive: boolean;
  /** Covariance-based risk allocator used to size the directional bets. */
  riskModel: RiskModel;
  /** How strongly to pull weights toward the risk model (0 = pure alpha, 1 = full). */
  riskBlend: number;
  /** Tilt toward the cross-sectional factor composite (0..1). */
  factorTilt: number;
  /** Lookback (bars) for the covariance estimate. */
  covLookback: number;
}

/**
 * The flagship integrated engine. These defaults were chosen EMPIRICALLY
 * (scripts/integration-test.ts), not by taste: HRP risk-sizing + a light factor
 * tilt lifts Sharpe from ~0.5 to ~1.6 and cuts drawdown on the demo data.
 * Regime adaptation is left OFF by default because it added turnover and
 * drawdown here — it's exposed as an opt-in toggle for experimentation, not
 * switched on by faith.
 */
export function defaultPortfolioConfig(): PortfolioConfig {
  return {
    legs: STRATEGIES.map((s) => ({ strategyId: s.id, params: defaultParams(s), weight: 1 })),
    regimeAdaptive: false,
    riskModel: "hrp",
    riskBlend: 0.8,
    factorTilt: 0.2,
    covLookback: 120,
  };
}

function tail(arr: number[], t: number, n: number): number[] {
  const end = Math.min(arr.length, t + 1);
  return arr.slice(Math.max(0, end - n), end);
}

function blend(a: Weights, b: Weights, alpha: number, symbols: string[]): Weights {
  const out: Weights = {};
  for (const s of symbols) out[s] = (1 - alpha) * (a[s] || 0) + alpha * (b[s] || 0);
  return out;
}

function capGross(w: Weights, symbols: string[], maxGross = 1): Weights {
  let g = 0;
  for (const s of symbols) g += Math.abs(w[s] || 0);
  if (g <= maxGross || g === 0) return w;
  const k = maxGross / g;
  const out: Weights = {};
  for (const s of symbols) out[s] = (w[s] || 0) * k;
  return out;
}

/** Continuous factor tilt: long above-average composite, short below, gross 1. */
function factorDirection(closesTail: number[][], symbols: string[]): Weights {
  const scores = computeFactors(closesTail, symbols);
  const comps = scores.map((s) => s.composite);
  const mean = comps.reduce((a, b) => a + b, 0) / (comps.length || 1);
  const dev = comps.map((c) => c - mean);
  const gross = dev.reduce((a, b) => a + Math.abs(b), 0) || 1;
  const out: Weights = {};
  symbols.forEach((s, i) => (out[s] = dev[i] / gross));
  return out;
}

/**
 * The full construction pipeline. Returns target weights (gross ≤ 1); the caller
 * (backtest/autopilot) then applies vol-targeting, leverage caps and the
 * prop-firm guard on top.
 */
export function constructPortfolio(
  u: Universe,
  symbols: string[],
  t: number,
  cfg: PortfolioConfig,
): Weights {
  // 1) ALPHA — combine strategy sleeves, optionally re-weighted by market regime.
  let legs = cfg.legs;
  if (cfg.regimeAdaptive) {
    const closesForRegime = symbols.map((s) => tail(cachedCloses(u[s]), t, 252));
    const reg = aggregateRegime(closesForRegime);
    legs = cfg.legs.map((l) => ({
      ...l,
      weight: reg.recommended[l.strategyId] ?? l.weight,
    }));
  }
  const mappedLegs = legs
    .filter((l) => STRATEGY_MAP[l.strategyId])
    .map((l) => ({ strategy: STRATEGY_MAP[l.strategyId], params: l.params, weight: l.weight }));
  let w = ensembleWeights(mappedLegs, u, symbols, t);

  // 2) FACTOR TILT — blend in the cross-sectional factor composite.
  if (cfg.factorTilt > 0) {
    const closesForFactors = symbols.map((s) => tail(cachedCloses(u[s]), t, 300));
    const fdir = factorDirection(closesForFactors, symbols);
    w = blend(w, fdir, cfg.factorTilt, symbols);
  }

  // 3) RISK MODEL — keep the alpha's direction, size the bets by a covariance
  //    allocator (HRP / ERC / min-var) so each position contributes balanced risk.
  if (cfg.riskModel !== "none") {
    const closesWin = symbols.map((s) => tail(cachedCloses(u[s]), t, cfg.covLookback + 1));
    if (closesWin[0].length > 10) {
      const cov = shrinkCovariance(covarianceMatrix(returnsMatrix(closesWin)), 0.2);
      const wRisk =
        cfg.riskModel === "hrp"
          ? hrp(cov)
          : cfg.riskModel === "erc"
            ? equalRiskContribution(cov)
            : cfg.riskModel === "min-var"
              ? minVariance(cov, true)
              : cov.map((row, i) => (row[i] > 1e-12 ? 1 / row[i] : 0)); // inv-var fallback
      const sumRisk = wRisk.reduce((a, b) => a + b, 0) || 1;
      const directional: Weights = {};
      symbols.forEach((s, i) => {
        directional[s] = Math.sign(w[s] || 0) * (wRisk[i] / sumRisk);
      });
      w = blend(w, directional, cfg.riskBlend, symbols);
    }
  }

  return capGross(w, symbols, 1);
}
