// The backtester. Walks the timeline one bar at a time, asks the strategy for
// target weights using only past data, applies the risk overlay and (optionally)
// the prop-firm guard, realises the next bar's return net of costs, and tracks
// the equity curve. No look-ahead, no survivorship tricks — what you see is what
// the rules would actually have produced on this data.
import { computeMetrics, drawdownSeries } from "./metrics";
import {
  dailyFloor,
  evaluatePropChallenge,
  overallFloor,
  profitTargetEquity,
  propGuardMaxGross,
} from "./propFirm";
import {
  applyRiskOverlay,
  estimatePortfolioDailyVol,
  gross,
  scale,
  turnover,
} from "./risk";
import { STRATEGY_MAP, ensembleWeights } from "./strategies";
import type {
  BacktestResult,
  PropFirmRules,
  RiskConfig,
  Universe,
  Weights,
} from "./types";

export interface EnsembleLeg {
  strategyId: string;
  params: Record<string, number>;
  weight: number;
}

export interface BacktestConfig {
  /** Single-strategy mode. */
  strategyId?: string;
  params?: Record<string, number>;
  /** Multi-strategy ensemble mode (takes precedence over strategyId if non-empty). */
  ensemble?: EnsembleLeg[];
  risk: RiskConfig;
  initialEquity: number;
  /** Optional prop-firm rules to enforce live and evaluate against. */
  prop?: PropFirmRules;
  /** Bars to skip for indicator warm-up. */
  warmup?: number;
}

function cloneToZero(symbols: string[]): Weights {
  const w: Weights = {};
  for (const s of symbols) w[s] = 0;
  return w;
}

export function runBacktest(
  u: Universe,
  symbols: string[],
  config: BacktestConfig,
): BacktestResult {
  const len = Math.min(...symbols.map((s) => u[s].length));
  const warmup = Math.min(config.warmup ?? 252, Math.max(0, len - 2));
  const initial = config.initialEquity > 0 ? config.initialEquity : 100_000;

  const weightFn = buildWeightFn(config);

  let equity = initial;
  let peak = equity;
  let prevWeights = cloneToZero(symbols);
  let halted = false;

  const equityCurve: { time: number; value: number }[] = [
    { time: u[symbols[0]][warmup].time, value: equity },
  ];
  const returns: number[] = [];
  const grossPerBar: number[] = [];

  for (let t = warmup; t < len - 1; t++) {
    // 1) Raw target weights using information up to and including bar t.
    let w = halted ? cloneToZero(symbols) : weightFn(u, symbols, t);

    // 2) Risk overlay (vol targeting, Kelly fraction, gross cap).
    if (!halted) w = applyRiskOverlay(w, u, symbols, t, config.risk);

    // 3) Prop-firm guard: never take a bet that a normal adverse day could turn
    //    into a rule breach. Sizes down (or to zero) as the risk budget shrinks.
    if (config.prop && !halted) {
      const estVol = estimatePortfolioDailyVol(w, u, symbols, t, config.risk.volLookback);
      const maxG = propGuardMaxGross(config.prop, equity, equity, peak, estVol);
      const g = gross(w);
      if (g > maxG && g > 0) w = scale(w, Math.max(0, maxG) / g);
    }

    // 4) Realise the return from bar t -> t+1.
    let r = 0;
    for (const s of symbols) {
      const c0 = u[s][t].close;
      const c1 = u[s][t + 1].close;
      if (c0 !== 0) r += (w[s] || 0) * (c1 / c0 - 1);
    }

    // 5) Subtract transaction costs proportional to how much we traded.
    const to = turnover(prevWeights, w, symbols);
    r -= to * config.risk.costPerTurnover;
    prevWeights = w;

    // 6) Update equity & peak.
    const dayStart = equity;
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    returns.push(r);
    grossPerBar.push(gross(w));
    equityCurve.push({ time: u[symbols[0]][t + 1].time, value: equity });

    // 7) Live prop-firm outcome checks (close-to-close approximation).
    if (config.prop && !halted) {
      const daysSoFar = returns.length;
      if (equity <= dailyFloor(config.prop, dayStart) || equity <= overallFloor(config.prop, peak)) {
        halted = true; // challenge failed — stop trading
      } else if (equity >= profitTargetEquity(config.prop) && daysSoFar >= config.prop.minTradingDays) {
        halted = true; // challenge passed — lock in the result
      }
    }
  }

  const equityValues = equityCurve.map((p) => p.value);
  const dd = drawdownSeries(equityValues);
  const metrics = computeMetrics(equityValues, returns, grossPerBar);

  return {
    equity: equityCurve,
    drawdown: equityCurve.map((p, i) => ({ time: p.time, value: dd[i] })),
    returns,
    metrics,
    prop: config.prop ? evaluatePropChallenge(equityValues, config.prop) : undefined,
  };
}

function buildWeightFn(
  config: BacktestConfig,
): (u: Universe, symbols: string[], t: number) => Weights {
  if (config.ensemble && config.ensemble.length > 0) {
    const legs = config.ensemble
      .filter((l) => STRATEGY_MAP[l.strategyId])
      .map((l) => ({
        strategy: STRATEGY_MAP[l.strategyId],
        params: l.params,
        weight: l.weight,
      }));
    return (u, symbols, t) => ensembleWeights(legs, u, symbols, t);
  }
  const strat = config.strategyId ? STRATEGY_MAP[config.strategyId] : undefined;
  if (!strat) {
    return (_u, symbols) => cloneToZero(symbols);
  }
  const params = config.params ?? {};
  return (u, symbols, t) => strat.computeWeights(u, symbols, t, params);
}
